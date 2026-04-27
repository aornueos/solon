/**
 * Facade do spellcheck — agora 100% backend nativo via Tauri commands.
 *
 * Historia das tentativas:
 *  - nspell (JS): "Too many properties to enumerate" no V8
 *  - hunspell-asm (WASM): build browser e' UMD legacy, incompativel
 *    com Vite + Worker type:'module'
 *  - typo-js (JS): mesmo problema do nspell
 *  - Web Worker custom (Set + Levenshtein em JS): funcionava, mas user
 *    nao via sugestoes confiaveis; foco e' desktop
 *  - **ATUAL**: Rust backend via Tauri invoke. HashSet + Levenshtein
 *    em rust nativo. Sem limite V8, sem WASM, sem worker. Funciona
 *    sempre.
 *
 * Trade: roda so' em Tauri (no `npm run dev` puro browser, e' no-op).
 * Decisao explicita do user — foco e' desktop.
 *
 * API publica (mesma interface dos providers anteriores):
 *  - `ensureSpellchecker()`     — sync, dispara warm-up
 *  - `isSpellcheckerReady()`    — sync, retorna se backend esta vivo
 *  - `suggest(word)`            — async, Promise<string[]>
 *  - `isCorrect(word)`          — async, Promise<boolean>
 *  - `addToPersonalDict(word)`  — sync, persiste + notifica backend
 *  - `isInPersonalDict(word)`   — sync
 *  - `getPersonalDictSize()`    — sync
 *  - `removeFromPersonalDict(word)` — sync
 */
import { invoke } from "@tauri-apps/api/core";

const PERSONAL_DICT_KEY = "solon:spellcheck:personal";

let isReady = false;
let warmupPromise: Promise<void> | null = null;
let personalDict = loadPersonalDict();

const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ !== undefined;

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
    /* storage cheio — ignora */
  }
}

/**
 * Warm-up assincrono: dispara um `spell_size` no backend pra forcar a
 * inicializacao das estruturas Lazy do Rust (HashSet + Vec). E' tipo
 * "wake the server up" — o primeiro suggest depois desse warm vai ser
 * fast porque a lista ja esta carregada na memoria do processo.
 *
 * Tambem re-aplica o dict pessoal — palavras adicionadas em sessoes
 * anteriores precisam ser re-injetadas no backend (que sobe vazio em
 * cada start).
 *
 * Idempotente: chamadas repetidas retornam o mesmo Promise pendente
 * ou nao fazem nada se ja' completou.
 */
export function ensureSpellchecker(): void {
  if (!isTauri()) return;
  if (isReady) return;
  if (warmupPromise) return;

  console.log("[spellcheck] warm-up iniciando…");
  warmupPromise = (async () => {
    try {
      const start = performance.now();
      const size = await invoke<number>("spell_size");
      console.log(
        `[spellcheck] backend ativo: ${size.toLocaleString("pt-BR")} palavras (${(performance.now() - start).toFixed(0)}ms)`,
      );

      // Re-aplica dict pessoal
      for (const word of personalDict) {
        try {
          await invoke("spell_add", { word });
        } catch (err) {
          console.warn("[spellcheck] falha ao re-aplicar palavra pessoal:", word, err);
        }
      }

      isReady = true;
    } catch (err) {
      console.error("[spellcheck] warm-up falhou:", err);
      warmupPromise = null;
    }
  })();
}

export function isSpellcheckerReady(): boolean {
  return isReady;
}

/**
 * Verifica se a palavra e' correta. Curta-circuita pelo dict pessoal
 * pra evitar round-trip ao backend pra palavras conhecidas. No browser
 * dev (sem Tauri), retorna true (assume correto pra nao falsamente
 * marcar tudo como erro).
 */
export async function isCorrect(word: string): Promise<boolean> {
  if (!isTauri()) return true;
  if (personalDict.has(word.toLowerCase())) return true;
  try {
    return await invoke<boolean>("spell_check", { word });
  } catch (err) {
    console.warn("[spellcheck] check falhou:", err);
    return true;
  }
}

/**
 * Pede sugestoes ao backend. Retorna array de ate' 8 candidatos
 * ordenados por edit distance (asc) + alfabetico (tiebreaker).
 *
 * Backend faz a iteracao em ~5-15ms — nao precisamos de cache
 * extra aqui.
 */
export async function suggest(word: string): Promise<string[]> {
  if (!isTauri()) return [];
  if (personalDict.has(word.toLowerCase())) return [];
  try {
    return await invoke<string[]>("spell_suggest", { word });
  } catch (err) {
    console.warn("[spellcheck] suggest falhou:", err);
    return [];
  }
}

export function addToPersonalDict(word: string): void {
  const normalized = word.trim();
  if (!normalized) return;
  personalDict.add(normalized.toLowerCase());
  savePersonalDict();
  // Notifica backend pra que checks subsequentes ja considerem essa
  // palavra como correta sem round-trip pelo localStorage.
  if (isTauri()) {
    invoke("spell_add", { word: normalized }).catch((err) => {
      console.warn("[spellcheck] add falhou:", err);
    });
  }
}

export function isInPersonalDict(word: string): boolean {
  return personalDict.has(word.toLowerCase());
}

export function getPersonalDictSize(): number {
  return personalDict.size;
}

export function removeFromPersonalDict(word: string): void {
  const lower = word.toLowerCase();
  if (!personalDict.has(lower)) return;
  personalDict.delete(lower);
  savePersonalDict();
  if (isTauri()) {
    invoke("spell_remove", { word: lower }).catch((err) => {
      console.warn("[spellcheck] remove falhou:", err);
    });
  }
}
