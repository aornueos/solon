/**
 * Facade do spellcheck. Modulo leve, sempre carregado — expoe a API
 * sincrona usada pelo ContextMenuProvider sem puxar a engine pesada
 * (~5MB com dicionario pt-BR). A engine real esta em
 * `./spellcheck-impl.ts` e e' carregada via dynamic import na primeira
 * chamada de `ensureSpellchecker`.
 *
 * Padrao: facade sincrono, impl assincrono. Permite codigo cliente
 * escrever:
 *
 *   if (isCorrect(word)) return;
 *   const sug = suggest(word);
 *
 * sem ter que awaitar nada — se a engine ainda nao carregou, `isCorrect`
 * retorna `true` (assumimos correto pra nao falsamente acusar) e
 * `suggest` retorna [].
 */
import type NSpell from "nspell";

const PERSONAL_DICT_KEY = "solon:spellcheck:personal";

let speller: NSpell | null = null;
let loadingPromise: Promise<NSpell | null> | null = null;
let personalDict = loadPersonalDict();

function loadPersonalDict(): Set<string> {
  try {
    const raw = localStorage.getItem(PERSONAL_DICT_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function savePersonalDict(): void {
  try {
    localStorage.setItem(
      PERSONAL_DICT_KEY,
      JSON.stringify([...personalDict]),
    );
  } catch {
    /* storage full — ignora */
  }
}

/**
 * Carrega a engine pt-BR. Idempotente: chamadas subsequentes retornam
 * a mesma instancia. Falhas (network, dicionario corrompido) sao
 * silenciosas — retornamos null e seguimos sem spellcheck.
 *
 * Pode ser chamado em "warming" (logo apos boot) sem await — o usuario
 * nao bloqueia esperando.
 */
export async function ensureSpellchecker(): Promise<NSpell | null> {
  if (speller) return speller;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const impl = await import("./spellcheck-impl");
      const s = await impl.load();
      // Re-aplica o dicionario pessoal — nspell so sabe do que esta no
      // .dic carregado, nao das palavras que o user adicionou em sessoes
      // anteriores. Sem isto, palavras adicionadas no boot anterior
      // voltariam a aparecer como erro.
      for (const word of personalDict) s.add(word);
      speller = s;
      return s;
    } catch (err) {
      console.error("[spellcheck] load failed:", err);
      // Reset loadingPromise pra permitir retry numa proxima call.
      loadingPromise = null;
      return null;
    }
  })();

  return loadingPromise;
}

/** Retorna a instancia se ja' carregou, ou null. NAO dispara load. */
export function getSpellcheckerIfReady(): NSpell | null {
  return speller;
}

/**
 * Verifica se a palavra e' "correta" (no dicionario ou na lista pessoal).
 * Sem engine, retorna true (nao queremos falsos negativos visiveis).
 *
 * Comparacao com personalDict e' lowercase pra "Solon"/"solon" se
 * acharem como mesma entrada. nspell faz seu proprio case folding
 * internamente.
 */
export function isCorrect(word: string): boolean {
  if (!speller) return true;
  if (personalDict.has(word.toLowerCase())) return true;
  return speller.correct(word);
}

/**
 * Top-N sugestoes pra uma palavra errada. nspell retorna lista por
 * relevancia (proximidade); cortamos em 8 pra nao explodir o context
 * menu.
 */
export function suggest(word: string): string[] {
  if (!speller) return [];
  return speller.suggest(word).slice(0, 8);
}

export function addToPersonalDict(word: string): void {
  const normalized = word.trim();
  if (!normalized) return;
  personalDict.add(normalized.toLowerCase());
  savePersonalDict();
  // Atualiza tambem a engine em memoria pra que checks subsequentes
  // dessa palavra retornem true imediatamente, sem precisar reload.
  speller?.add(normalized);
}

export function isInPersonalDict(word: string): boolean {
  return personalDict.has(word.toLowerCase());
}

export function getPersonalDictSize(): number {
  return personalDict.size;
}

/**
 * Remove uma palavra do dicionario pessoal. Nao tem UI ainda, mas a
 * action existe pra futuras "preferencias > dicionario pessoal" e pra
 * `resetSettings()` poder limpar.
 */
export function removeFromPersonalDict(word: string): void {
  const lower = word.toLowerCase();
  if (!personalDict.has(lower)) return;
  personalDict.delete(lower);
  savePersonalDict();
  speller?.remove(word);
}
