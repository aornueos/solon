/**
 * Worker dedicado pro spellcheck. Roda Hunspell (compilado em WASM) +
 * dicionario pt-BR fora da main thread.
 *
 * Por que Hunspell-asm e nao nspell? O nspell (puro JS) explodia no
 * dicionario pt-BR com "Too many properties to enumerate" — o V8 tem
 * limite de propriedades por objeto e o nspell estoura ao indexar
 * 300k+ palavras com regras morfologicas complexas (conjugacoes,
 * generos, etc).
 *
 * Hunspell-asm usa o Hunspell oficial em C++ compilado pra WebAssembly.
 * Mesmo motor que LibreOffice/Firefox/etc usam — sem limite por
 * propriedade JS, performance previsivel, lida com dict de qualquer
 * tamanho.
 *
 * Protocolo de mensagens (igual ao anterior):
 *  - init: dispara load do dic (idempotente). Worker emite 'ready' apos.
 *  - suggest/correct: aguarda init, processa, devolve com mesmo `id`.
 *  - add: adiciona palavra ao runtime do hunspell (dict pessoal).
 */
import { loadModule } from "hunspell-asm";

interface HunspellInstance {
  spell(word: string): boolean;
  suggest(word: string): string[];
  addWord(word: string): void;
  dispose(): void;
}

let speller: HunspellInstance | null = null;
let initPromise: Promise<void> | null = null;

type ReqInit = { type: "init" };
type ReqSuggest = { type: "suggest"; id: number; word: string };
type ReqCorrect = { type: "correct"; id: number; word: string };
type ReqAdd = { type: "add"; word: string };
type Request = ReqInit | ReqSuggest | ReqCorrect | ReqAdd;

async function init(): Promise<void> {
  if (speller) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[spellcheck.worker] init: loading hunspell-asm WASM...");
    const startWasm = performance.now();
    const factory = await loadModule();
    console.log(
      `[spellcheck.worker] WASM ready in ${(performance.now() - startWasm).toFixed(0)}ms`,
    );

    console.log("[spellcheck.worker] fetching dict files...");
    const startFetch = performance.now();
    const [affRes, dicRes] = await Promise.all([
      fetch("/dict/pt.aff"),
      fetch("/dict/pt.dic"),
    ]);
    console.log(
      `[spellcheck.worker] fetch done in ${(performance.now() - startFetch).toFixed(0)}ms — aff=${affRes.status}, dic=${dicRes.status}`,
    );
    if (!affRes.ok || !dicRes.ok) {
      throw new Error(
        `Falha ao carregar dicionario: aff=${affRes.status}, dic=${dicRes.status}. Verifique public/dict/pt.{aff,dic}.`,
      );
    }

    // hunspell-asm precisa dos arquivos como Uint8Array — ele monta no
    // virtual filesystem do emscripten e passa o path pro Hunspell.
    const [affBuf, dicBuf] = await Promise.all([
      affRes.arrayBuffer(),
      dicRes.arrayBuffer(),
    ]);
    console.log(
      `[spellcheck.worker] aff=${affBuf.byteLength} bytes, dic=${dicBuf.byteLength} bytes. Inicializando Hunspell…`,
    );

    const startCompile = performance.now();
    const affPath = factory.mountBuffer(new Uint8Array(affBuf), "pt.aff");
    const dicPath = factory.mountBuffer(new Uint8Array(dicBuf), "pt.dic");
    speller = factory.create(affPath, dicPath) as HunspellInstance;
    console.log(
      `[spellcheck.worker] Hunspell pronto em ${(performance.now() - startCompile).toFixed(0)}ms.`,
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

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      await init();
      return;
    }
    if (msg.type === "add") {
      // 'add' nao precisa esperar init — se a engine ainda nao subiu,
      // a palavra e' descartada. O facade re-aplica o personal dict no
      // evento 'ready', entao nada se perde permanentemente.
      if (speller) speller.addWord(msg.word);
      return;
    }
    // suggest / correct precisam de engine pronta
    await init();
    if (msg.type === "suggest") {
      const suggestions = speller!.suggest(msg.word).slice(0, 8);
      self.postMessage({ type: "suggest", id: msg.id, suggestions });
      return;
    }
    if (msg.type === "correct") {
      // Hunspell.spell retorna true pra palavra correta.
      const correct = speller!.spell(msg.word);
      self.postMessage({ type: "correct", id: msg.id, correct });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = "id" in msg ? msg.id : -1;
    self.postMessage({ type: "error", id, message });
  }
};
