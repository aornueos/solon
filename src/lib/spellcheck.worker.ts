/**
 * Worker dedicado pro spellcheck. Roda nspell + dicionario Hunspell pt-BR
 * fora da main thread.
 *
 * Por que worker? `NSpell(aff, dic)` parsea ~4.4MB do .dic sincronamente
 * em ~8-10s na maquina do user. Na main thread isso travava o app
 * inteiro (UI freeze). No worker, parsing acontece em paralelo e a main
 * thread fica responsiva.
 *
 * Protocolo de mensagens:
 *  - init: dispara load do dic (idempotente). Worker emite 'ready' apos.
 *  - suggest/correct: aguarda init, processa, devolve com mesmo `id`.
 *  - add: adiciona palavra ao runtime do nspell (dict pessoal).
 *  - error: erro generico; main thread loga e rejeita o pending.
 *
 * Cada request tem um `id` numerico — main thread casa request/response
 * via Map<id, deferredPromise>. Bem-vindo ao mundo de RPC manual.
 */
import NSpell from "nspell";

let speller: NSpell | null = null;
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
    const [affRes, dicRes] = await Promise.all([
      fetch("/dict/pt.aff"),
      fetch("/dict/pt.dic"),
    ]);
    if (!affRes.ok || !dicRes.ok) {
      throw new Error(
        `Falha ao carregar dicionario: aff=${affRes.status}, dic=${dicRes.status}. Verifique public/dict/pt.{aff,dic}.`,
      );
    }
    const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
    // Esse construtor e' o gargalo (~8-10s). Aqui no worker nao bloqueia
    // a main thread.
    speller = NSpell(aff, dic);
    self.postMessage({ type: "ready" });
  })();

  try {
    await initPromise;
  } catch (err) {
    // Reset pra permitir retry numa proxima request.
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
      if (speller) speller.add(msg.word);
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
      const correct = speller!.correct(msg.word);
      self.postMessage({ type: "correct", id: msg.id, correct });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = "id" in msg ? msg.id : -1;
    self.postMessage({ type: "error", id, message });
  }
};
