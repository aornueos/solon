/**
 * Worker de spellcheck custom — sem libs externas, sem WASM. Lista
 * plain text de ~312k palavras pt-BR + Levenshtein DP pra sugestoes.
 *
 * Por que custom? Tentativas anteriores falharam:
 *  - nspell (puro JS): "Too many properties to enumerate" — V8 nao
 *    aguenta indexar morfologia pt-BR
 *  - hunspell-asm (WASM): build browser e' UMD legacy, incompativel
 *    com Vite + Worker type:'module'
 *  - typo-js (puro JS): mesmo erro V8 do nspell
 *
 * Solucao: pre-processar o dicionario .dic em postinstall (script
 * `copy-spellcheck-dict.cjs`) extraindo so' as palavras-base. Bundle
 * carrega como Set, lookup O(1). Sugestoes via Levenshtein bounded
 * (max distance 2) com poda por comprimento.
 *
 * Trade-off: sem expansao de afixos, conjugacoes raras de verbos
 * podem nao estar na lista. Mas o .dic do pt-BR lista 300k+ formas
 * explicitamente, cobertura pratica e' boa pra app de escrita.
 *
 * Performance:
 *  - check: O(1) — Set.has
 *  - suggest: O(n) com early-skip por len diff. ~50-100ms em 312k
 *    palavras na maquina tipica. Acontece so' quando user faz
 *    right-click em palavra errada, nao no path quente.
 */

let words: Set<string> | null = null;
let wordList: string[] | null = null; // mesma data, ordenado, pra suggest
let initPromise: Promise<void> | null = null;

type ReqInit = { type: "init" };
type ReqSuggest = { type: "suggest"; id: number; word: string };
type ReqCorrect = { type: "correct"; id: number; word: string };
type ReqAdd = { type: "add"; word: string };
type WorkerRequest = ReqInit | ReqSuggest | ReqCorrect | ReqAdd;

const MAX_DISTANCE = 2;
const MAX_SUGGESTIONS = 8;

async function init(): Promise<void> {
  if (words) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[spellcheck.worker] init: fetching word list...");
    const startFetch = performance.now();
    const res = await fetch("/dict/pt-words.txt");
    if (!res.ok) {
      throw new Error(
        `Falha ao carregar word list: ${res.status}. Verifique public/dict/pt-words.txt.`,
      );
    }
    const text = await res.text();
    console.log(
      `[spellcheck.worker] fetch done in ${(performance.now() - startFetch).toFixed(0)}ms — ${(text.length / 1024).toFixed(0)} KB`,
    );

    const startParse = performance.now();
    // Lines, drop empty. Set permite O(1) check; array permite O(n) iter
    // com index pra suggest. Mantemos os dois — ~10MB de RAM no total.
    const arr: string[] = [];
    const set = new Set<string>();
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        if (i > start) {
          const w = text.slice(start, i);
          if (w) {
            arr.push(w);
            set.add(w);
          }
        }
        start = i + 1;
      }
    }
    // Ultima linha sem \n final
    if (start < text.length) {
      const w = text.slice(start);
      if (w) {
        arr.push(w);
        set.add(w);
      }
    }
    words = set;
    wordList = arr;
    console.log(
      `[spellcheck.worker] parsed ${arr.length.toLocaleString("pt-BR")} palavras em ${(performance.now() - startParse).toFixed(0)}ms`,
    );
    self.postMessage({ type: "ready" });
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

/**
 * Levenshtein distance bounded — para o calculo cedo se ja' excedeu o
 * limite. Usa array unidimensional e atualiza em-place pra economizar
 * alocacao (custo importante em loop com 312k palavras).
 */
function levenshtein(a: string, b: string, max: number): number {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > max) return max + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Linha anterior do DP
  let prev = new Array(lenB + 1);
  let curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lenB; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Early exit: se a melhor possibilidade nessa linha ja' excede o
    // max, o resultado final tambem vai exceder.
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[lenB];
}

function suggest(word: string): string[] {
  if (!wordList) return [];
  const lower = word.toLowerCase();
  const wlen = lower.length;

  // Coleta candidatos com distance <= MAX_DISTANCE.
  // Otimizacao: pula candidates cujo len difere demais (impossivel
  // ter distance <= max se diff > max).
  type Candidate = { word: string; dist: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < wordList.length; i++) {
    const candidate = wordList[i];
    const diff = Math.abs(candidate.length - wlen);
    if (diff > MAX_DISTANCE) continue;
    const dist = levenshtein(lower, candidate, MAX_DISTANCE);
    if (dist <= MAX_DISTANCE) {
      candidates.push({ word: candidate, dist });
      // Early-stop se ja' achou muitas com distance 1 — distance 2
      // raramente e melhor que distance 1 com mais opcoes.
      if (candidates.length > 200) break;
    }
  }

  // Ordena por distance asc, depois alfabetico.
  candidates.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.word.localeCompare(b.word, "pt-BR");
  });

  return candidates.slice(0, MAX_SUGGESTIONS).map((c) => c.word);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      await init();
      return;
    }
    if (msg.type === "add") {
      // Personal dict: insere no Set local. Nao persiste — facade ja'
      // guarda em localStorage e re-emite no 'ready'.
      if (words) words.add(msg.word.toLowerCase());
      return;
    }
    await init();
    if (msg.type === "suggest") {
      const suggestions = suggest(msg.word);
      self.postMessage({ type: "suggest", id: msg.id, suggestions });
      return;
    }
    if (msg.type === "correct") {
      // Set.has e' O(1). Lowercase pra match (lista esta toda lowercase).
      const correct = words!.has(msg.word.toLowerCase());
      self.postMessage({ type: "correct", id: msg.id, correct });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = "id" in msg ? msg.id : -1;
    self.postMessage({ type: "error", id, message });
  }
};
