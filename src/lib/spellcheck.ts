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
      await invoke<number>("spell_size");

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
  return word.trim().toLocaleLowerCase("pt-BR");
}

export function shouldSpellcheckWord(word: string): boolean {
  const normalized = normalizeSpellWord(word);
  if (normalized.length < 3) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (!/^[\p{L}\p{M}]+$/u.test(word)) return false;
  if (/^\p{Lu}/u.test(word)) return false;
  if (personalDict.has(normalized)) return false;
  return true;
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
