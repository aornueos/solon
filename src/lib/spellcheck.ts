/**
 * Facade do spellcheck — comunica com Web Worker dedicado (`./spellcheck.worker.ts`).
 *
 * Engine: hunspell-asm (Hunspell oficial em WASM). Antes era nspell
 * (puro JS), mas estourava com "Too many properties to enumerate" no
 * dicionario pt-BR (~300k palavras com morfologia complexa).
 *
 * Por que worker? Mesmo com hunspell-asm, o load do WASM + parsing
 * do dict leva alguns segundos. Worker isola pra que main thread
 * permaneca responsiva.
 *
 * API publica:
 *  - `ensureSpellchecker()`     — sync, dispara init em background
 *  - `isSpellcheckerReady()`    — sync, retorna se engine ja' carregou
 *  - `suggest(word)`            — async, Promise<string[]> (8 sugestoes max)
 *  - `isCorrect(word)`          — async, Promise<boolean>
 *  - `addToPersonalDict(word)`  — sync, adiciona ao dict pessoal + posta no worker
 *  - `isInPersonalDict(word)`   — sync
 *  - `getPersonalDictSize()`    — sync
 *  - `removeFromPersonalDict(word)` — sync
 *
 * Personal dict (palavras que o user adicionou via "Adicionar ao dict")
 * vive em localStorage + Set local. Checagens sync passam pelo Set
 * antes de tocar no worker — palavras pessoais retornam true/[]
 * imediatamente sem round-trip.
 */

const PERSONAL_DICT_KEY = "solon:spellcheck:personal";

// ─── Worker e protocolo RPC ───
let worker: Worker | null = null;
let isReady = false;
let nextId = 0;

interface PendingHandler {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}
const pending = new Map<number, PendingHandler>();

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

function getOrCreateWorker(): Worker {
  if (worker) return worker;

  console.log("[spellcheck] spawning worker…");
  // `new URL(..., import.meta.url)` e' o padrao Vite pra workers — gera
  // um chunk separado, com cache busting via hash em build de prod.
  // `type: 'module'` permite usar `import` dentro do worker.
  worker = new Worker(
    new URL("./spellcheck.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as
      | { type: "ready" }
      | { type: "suggest"; id: number; suggestions: string[] }
      | { type: "correct"; id: number; correct: boolean }
      | { type: "error"; id: number; message: string };

    if (msg.type === "ready") {
      isReady = true;
      console.log(
        `[spellcheck] worker pronto. Personal dict: ${personalDict.size} palavras.`,
      );
      // Re-aplica personal dict — o worker carregou um speller fresh,
      // ele nao sabe nada das palavras que o user adicionou em sessoes
      // anteriores. Sem isso, palavras adicionadas na ultima sessao
      // voltariam a aparecer como erro.
      for (const word of personalDict) {
        worker?.postMessage({ type: "add", word });
      }
      return;
    }

    if (msg.type === "suggest") {
      const handler = pending.get(msg.id);
      if (handler) {
        handler.resolve(msg.suggestions);
        pending.delete(msg.id);
      }
      return;
    }
    if (msg.type === "correct") {
      const handler = pending.get(msg.id);
      if (handler) {
        handler.resolve(msg.correct);
        pending.delete(msg.id);
      }
      return;
    }
    if (msg.type === "error") {
      console.error("[spellcheck] worker error:", msg.message);
      const handler = pending.get(msg.id);
      if (handler) {
        handler.reject(new Error(msg.message));
        pending.delete(msg.id);
      }
    }
  };

  worker.onerror = (err) => {
    // Frequentemente apenas com `message` em ErrorEvent. Loga tudo que
    // tem pra ajudar a diagnosticar (ex: import path errado, worker
    // file 404, etc).
    console.error("[spellcheck] worker uncaught error:", {
      message: err.message,
      filename: err.filename,
      lineno: err.lineno,
      error: err.error,
    });
  };
  worker.onmessageerror = (err) => {
    console.error("[spellcheck] worker message deserialization error:", err);
  };

  return worker;
}

/**
 * Dispara init do worker em background. Idempotente. Nao espera nem
 * bloqueia — chame e siga. O `isSpellcheckerReady()` vira true quando
 * a engine acabar de carregar (depois de ~8-10s na primeira vez).
 */
export function ensureSpellchecker(): void {
  const w = getOrCreateWorker();
  w.postMessage({ type: "init" });
}

export function isSpellcheckerReady(): boolean {
  return isReady;
}

/**
 * Pede sugestoes ao worker. Resolve com array ate' 8 candidatos
 * (vazio se nao acha sugestao razoavel).
 *
 * Se a palavra esta no dict pessoal, retorna [] sem ir ao worker —
 * fast path que economiza ~5ms por right-click em palavra conhecida.
 *
 * Timeout de 30s e' generoso pra cobrir engine carregando do zero.
 * Em uso normal (engine ja' pronta) responses voltam em <100ms.
 */
export async function suggest(word: string): Promise<string[]> {
  if (personalDict.has(word.toLowerCase())) return [];
  return rpc<string[]>("suggest", { word }, []);
}

export async function isCorrect(word: string): Promise<boolean> {
  if (personalDict.has(word.toLowerCase())) return true;
  return rpc<boolean>("correct", { word }, true);
}

/**
 * Helper de RPC — envia mensagem com id unico, retorna Promise que
 * resolve com a resposta. Em caso de timeout ou erro, retorna o
 * fallback fornecido (nao queremos quebrar a UI por uma falha de
 * spellcheck).
 */
function rpc<T>(
  type: "suggest" | "correct",
  payload: { word: string },
  fallback: T,
): Promise<T> {
  const w = getOrCreateWorker();
  const id = ++nextId;
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        console.warn(`[spellcheck] ${type} timed out for "${payload.word}"`);
        resolve(fallback);
      }
    }, 30000);

    pending.set(id, {
      resolve: (value) => {
        window.clearTimeout(timer);
        resolve(value as T);
      },
      // Erro = fallback silencioso. UI segue normal.
      reject: () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    });

    w.postMessage({ type, id, ...payload });
  });
}

export function addToPersonalDict(word: string): void {
  const normalized = word.trim();
  if (!normalized) return;
  personalDict.add(normalized.toLowerCase());
  savePersonalDict();
  // Posta no worker pra que checks subsequentes ja considerem como
  // correta sem reload. Se o worker ainda nao iniciou, o evento
  // 'ready' re-aplicara o personal dict completo.
  worker?.postMessage({ type: "add", word: normalized });
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
  // nspell tem .remove() mas requer reload pra "esquecer" de verdade
  // se a palavra estava em formas conjugadas. Best effort.
  // (TODO: se virar problema, implementar reload do worker.)
}
