/**
 * Worker dedicado pro spellcheck. Roda Typo.js + dicionario Hunspell
 * pt-BR fora da main thread.
 *
 * Historico de engines tentadas:
 *  - nspell: explodia com "Too many properties to enumerate" no V8.
 *    Causa: indexa cada palavra+variacao morfologica como propriedade
 *    de objeto JS; pt-BR tem 300k+ palavras, o V8 desiste.
 *  - hunspell-asm: build pra browser e' UMD legacy, incompativel com
 *    Vite + Worker `type: 'module'`. O loadModule importa hard-coded
 *    a versao Node.
 *  - typo-js (atual): pure JS mas usa abordagem diferente — expande
 *    afixos em RUNTIME (so' quando voce chama check/suggest), nao
 *    pre-computa tudo. Sem explosao de propriedades. Funciona em
 *    qualquer ambiente JS.
 *
 * Protocolo de mensagens (igual ao anterior):
 *  - init: dispara load do dic (idempotente). Worker emite 'ready' apos.
 *  - suggest/correct: aguarda init, processa, devolve com mesmo `id`.
 *  - add: adiciona palavra ao runtime (dict pessoal).
 */
import Typo from "typo-js";

let speller: Typo | null = null;
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
    console.log("[spellcheck.worker] init: fetching dict files...");
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
    const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
    console.log(
      `[spellcheck.worker] aff=${aff.length} chars, dic=${dic.length} chars. Inicializando Typo…`,
    );

    const startCompile = performance.now();
    // Typo("pt_BR", affData, dicData, settings?) — passa null no dictionary
    // path porque ja' temos os conteudos como string. Settings vazio = default.
    speller = new Typo("pt_BR", aff, dic, { platform: "any" });
    console.log(
      `[spellcheck.worker] Typo pronto em ${(performance.now() - startCompile).toFixed(0)}ms.`,
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
      // Typo nao tem API publica de add — usamos hack: empurra direto na
      // dict interna. Se a engine nao subiu ainda, descarta; o facade
      // re-aplica no evento 'ready'.
      if (speller) {
        // Typo guarda palavras conhecidas em `dictionaryTable` (Map-like).
        // Adicionar uma entry com flags vazias = palavra correta sem
        // afixacao adicional.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalTable = (speller as any).dictionaryTable;
        if (internalTable) internalTable[msg.word.toLowerCase()] = null;
      }
      return;
    }
    // suggest / correct precisam de engine pronta
    await init();
    if (msg.type === "suggest") {
      // Typo.suggest(word, limit) — limit default 5, queremos 8.
      const result = speller!.suggest(msg.word, 8);
      // Typo retorna array de strings ou as vezes wrap weird; normalizamos.
      const suggestions = Array.isArray(result)
        ? result.map((s) => (typeof s === "string" ? s : String(s)))
        : [];
      self.postMessage({ type: "suggest", id: msg.id, suggestions });
      return;
    }
    if (msg.type === "correct") {
      // Typo.check(word) retorna true se palavra correta.
      const correct = speller!.check(msg.word);
      self.postMessage({ type: "correct", id: msg.id, correct });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = "id" in msg ? msg.id : -1;
    self.postMessage({ type: "error", id, message });
  }
};
