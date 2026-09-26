/**
 * Facade do spellcheck — agora 100% backend nativo via Tauri commands.
 *
 * Historia das tentativas:
 *  - nspell (JS): "Too many properties to enumerate" no V8
 *  - hunspell-asm (WASM): build browser é UMD legacy, incompativel
 *    com Vite + Worker type:'module'
 *  - typo-js (JS): mesmo problema do nspell
 *  - Web Worker custom (Set + Levenshtein em JS): funcionava, mas user
 *    não via sugestoes confiaveis; foco é desktop
 *  - **ATUAL**: Rust backend via Tauri invoke (`spell_engine.rs`):
 *    distância de edição ponderada para erros comuns do português,
 *    percorrendo o dicionário ordenado por prefixo. Sem limite V8, sem
 *    WASM, sem worker.
 *
 * Trade: roda só em Tauri (no `npm run dev` puro browser, é no-op).
 * Decisao explicita do user — foco é desktop.
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
import { isTauriRuntime } from "./runtime";

const PERSONAL_DICT_KEY = "solon:spellcheck:personal";

/** Idiomas do corretor: português, inglês ou os dois. */
export type SpellcheckLanguage = "pt-BR" | "en-US" | "pt-BR+en-US";

export const SPELLCHECK_LANGUAGES: { value: SpellcheckLanguage; label: string; hint: string }[] = [
  { value: "pt-BR", label: "Português", hint: "Português do Brasil." },
  { value: "en-US", label: "Inglês", hint: "Inglês americano." },
  {
    value: "pt-BR+en-US",
    label: "Português e inglês",
    hint: "Aceita palavras dos dois idiomas; português sem acento (voce, mes) continua marcado.",
  },
];

let language: SpellcheckLanguage = "pt-BR";
// Trocas de idioma vão em fila: duas chamadas soltas ao backend podiam
// terminar fora de ordem e deixar ativo o idioma anterior.
let languageSync: Promise<unknown> = Promise.resolve();

function syncLanguage(): Promise<unknown> {
  const languages = language.split("+");
  languageSync = languageSync
    .catch(() => undefined)
    .then(() => invoke<number>("spell_set_languages", { languages }));
  return languageSync;
}

/**
 * Troca o idioma do corretor. Os sublinhados são refeitos com o
 * dicionário novo (o cache de palavras é descartado).
 */
export function setSpellcheckLanguage(next: SpellcheckLanguage): void {
  if (next === language) return;
  language = next;
  if (!isTauriRuntime() || !warmupPromise) return;
  void syncLanguage()
    .then(notifyPersonalDictChanged)
    .catch((err) => console.warn("[spellcheck] troca de idioma falhou:", err));
}

let isReady = false;
let warmupPromise: Promise<void> | null = null;
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
    /* storage cheio — ignora */
  }
}

function notifyPersonalDictChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("solon:spellcheck-dict-changed"));
}

/**
 * Warm-up assincrono: dispara um `spell_size` no backend pra forcar a
 * inicializacao das estruturas Lazy do Rust (HashSet + Vec). E' tipo
 * "wake the server up" — o primeiro suggest depois desse warm vai ser
 * fast porque a lista ja esta carregada na memória do processo.
 *
 * Tambem re-aplica o dict pessoal — palavras adicionadas em sessoes
 * anteriores precisam ser re-injetadas no backend (que sobe vazio em
 * cada start).
 *
 * Idempotente: chamadas repetidas retornam o mesmo Promise pendente
 * ou não fazem nada se já completou.
 */
export function ensureSpellchecker(): void {
  if (!isTauriRuntime()) return;
  if (isReady) return;
  if (warmupPromise) return;

  warmupPromise = (async () => {
    try {
      // Escolhe o idioma e já carrega o dicionário dele.
      await syncLanguage();

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

export function normalizeSpellWord(word: string): string {
  return word.trim().toLocaleLowerCase("pt-BR").replace(/[’ʼ]/g, "'");
}

/**
 * Palavra para o corretor: letras, com apóstrofo só no meio ("don't",
 * "d’água"). Hífen separa: "guarda-chuva" são duas palavras.
 */
const SPELL_WORD_SOURCE = "[\\p{L}\\p{M}]+(?:['’ʼ][\\p{L}\\p{M}]+)*";

const SPELL_WORD_EXACT = new RegExp(`^${SPELL_WORD_SOURCE}$`, "u");

/** Expressão nova a cada chamada: ela guarda posição (`g`). */
export function spellWordPattern(): RegExp {
  return new RegExp(SPELL_WORD_SOURCE, "gu");
}

/** A palavra do texto que contém a posição `offset` (inclusive as pontas). */
export function wordAtOffset(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  const pattern = spellWordPattern();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > offset) break;
    const end = match.index + match[0].length;
    if (offset <= end) return { start: match.index, end };
  }
  return null;
}

/**
 * Caractere que representa um nó inline (quebra de linha, comentário) no
 * texto de um bloco. Cada um ocupa uma posição no documento; usando um
 * caractere no lugar, o índice no texto continua sendo a posição no bloco.
 */
export const INLINE_LEAF_CHAR = "\ufffc";

/**
 * A palavra que vem depois de `textBefore` começa frase? Vale o começo do
 * parágrafo e o que vem depois de ponto final, de exclamação, de
 * interrogação ou de reticências — pulando espaço, aspas, parênteses e o
 * travessão do diálogo ("— Nao sei").
 */
export function isSentenceStart(textBefore: string): boolean {
  const trimmed = textBefore.replace(/[\s"'“”‘’«»()[\]—–\-\ufffc]+$/u, "");
  return trimmed === "" || /[.!?…]$/u.test(trimmed);
}

/**
 * Palavra com maiúscula só é checada no começo de frase: no meio da frase
 * ela quase sempre é nome próprio, e personagem inventado viraria erro.
 * Palavra toda em maiúsculas (sigla, grito) não é checada.
 */
export function shouldSpellcheckWord(word: string, atSentenceStart = false): boolean {
  const normalized = normalizeSpellWord(word);
  if (normalized.length < 3) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (!SPELL_WORD_EXACT.test(word)) return false;
  if (/^\p{Lu}/u.test(word)) {
    if (!atSentenceStart) return false;
    if (word === word.toLocaleUpperCase("pt-BR")) return false;
  }
  if (personalDict.has(normalized)) return false;
  return true;
}

/**
 * Aplica à sugestão a caixa da palavra digitada: "Nao" → "Não", não
 * "não". A sugestão vem minúscula do dicionário.
 */
export function matchCase(original: string, suggestion: string): string {
  if (!original || !suggestion) return suggestion;
  // Apóstrofo como estava no texto: o dicionário usa o reto, o editor
  // costuma ter o curvo ("don’t").
  if (original.includes("’")) suggestion = suggestion.replace(/'/g, "’");
  if (original.length > 1 && original === original.toLocaleUpperCase("pt-BR")) {
    return suggestion.toLocaleUpperCase("pt-BR");
  }
  if (/^\p{Lu}/u.test(original)) {
    return suggestion.charAt(0).toLocaleUpperCase("pt-BR") + suggestion.slice(1);
  }
  return suggestion;
}

/**
 * Verifica se a palavra é correta. Curta-circuita pelo dict pessoal
 * pra evitar round-trip ao backend pra palavras conhecidas. No browser
 * dev (sem Tauri), retorna true (assume correto pra não falsamente
 * marcar tudo como erro).
 */
export async function isCorrect(word: string): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  const normalized = normalizeSpellWord(word);
  if (personalDict.has(normalized)) return true;
  try {
    return await invoke<boolean>("spell_check", { word: normalized });
  } catch (err) {
    console.warn("[spellcheck] check falhou:", err);
    return true;
  }
}

export async function checkWords(words: string[]): Promise<Map<string, boolean>> {
  const unique = Array.from(new Set(words.map(normalizeSpellWord)));
  const result = new Map<string, boolean>();
  if (unique.length === 0) return result;
  if (!isTauriRuntime()) {
    for (const word of unique) result.set(word, true);
    return result;
  }

  const pending = unique.filter((word) => !personalDict.has(word));
  for (const word of unique) {
    if (personalDict.has(word)) result.set(word, true);
  }
  if (pending.length === 0) return result;

  try {
    const checks = await invoke<boolean[]>("spell_check_many", {
      words: pending,
    });
    pending.forEach((word, idx) => {
      result.set(word, checks[idx] ?? true);
    });
  } catch (err) {
    console.warn("[spellcheck] batch check falhou:", err);
    for (const word of pending) result.set(word, true);
  }
  return result;
}

/**
 * Pede sugestoes ao backend: no máximo 4, da mais provável para a menos,
 * e só as que ficam perto da melhor (uma correção óbvia vem sozinha).
 * O cálculo roda fora da thread da janela e leva dezenas de ms.
 */
export async function suggest(word: string): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  const normalized = normalizeSpellWord(word);
  if (personalDict.has(normalized)) return [];
  try {
    return await invoke<string[]>("spell_suggest", { word: normalized });
  } catch (err) {
    console.warn("[spellcheck] suggest falhou:", err);
    return [];
  }
}

export function addToPersonalDict(word: string): void {
  const normalized = normalizeSpellWord(word);
  if (!normalized) return;
  personalDict.add(normalized);
  savePersonalDict();
  notifyPersonalDictChanged();
  // Notifica backend pra que checks subsequentes ja considerem essa
  // palavra como correta sem round-trip pelo localStorage.
  if (isTauriRuntime()) {
    invoke("spell_add", { word: normalized }).catch((err) => {
      console.warn("[spellcheck] add falhou:", err);
    });
  }
}

export function isInPersonalDict(word: string): boolean {
  return personalDict.has(normalizeSpellWord(word));
}

export function getPersonalDictSize(): number {
  return personalDict.size;
}

export function getPersonalDictWords(): string[] {
  return [...personalDict].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function clearPersonalDict(): void {
  const words = getPersonalDictWords();
  if (words.length === 0) return;
  personalDict = new Set();
  savePersonalDict();
  notifyPersonalDictChanged();
  if (isTauriRuntime()) {
    for (const word of words) {
      invoke("spell_remove", { word }).catch((err) => {
        console.warn("[spellcheck] remove falhou:", err);
      });
    }
  }
}

export function removeFromPersonalDict(word: string): void {
  const lower = normalizeSpellWord(word);
  if (!personalDict.has(lower)) return;
  personalDict.delete(lower);
  savePersonalDict();
  notifyPersonalDictChanged();
  if (isTauriRuntime()) {
    invoke("spell_remove", { word: lower }).catch((err) => {
      console.warn("[spellcheck] remove falhou:", err);
    });
  }
}
