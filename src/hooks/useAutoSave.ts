import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { serializeDocument } from "../lib/frontmatter";
import { useFileSystem } from "./useFileSystem";

const DEBOUNCE_MS = 1200;
/** Flush forçado (Ctrl+S): mostra um "Salvo" verde pra dar feedback. */
const FORCE_FLUSH_HINT_MS = 1500;

/**
 * Auto-save centralizado:
 *  - Escuta mudanças em fileBody e sceneMeta do store.
 *  - Quando mudam, debounce 1.2s e grava o arquivo inteiro (frontmatter + body).
 *  - Quando o arquivo ativo troca, flusha imediatamente a pendência do arquivo anterior.
 *  - Ctrl+S força flush imediato.
 */
export function useAutoSave() {
  const { saveFile } = useFileSystem();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flushNow = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const s = useAppStore.getState();
      if (!s.activeFilePath) return;
      const content = serializeDocument(s.sceneMeta, s.fileBody);
      s.setSaveStatus("saving");
      try {
        await saveFile(s.activeFilePath, content);
        // Re-le o estado: o user pode ter trocado de arquivo durante o
        // await, e dar setSaveStatus("saved") ai sobreescreveria o status
        // do arquivo novo. So marcamos como salvo se ainda estamos no
        // mesmo path.
        const after = useAppStore.getState();
        if (after.activeFilePath === s.activeFilePath) {
          after.setSaveStatus("saved");
        }
      } catch {
        // saveFile ja toasta erro internamente. Volta pra dirty pra
        // sinalizar que ainda ha pendencia.
        useAppStore.getState().setSaveStatus("dirty");
      }
    };

    const unsub = useAppStore.subscribe((state, prev) => {
      // Troca de arquivo: flusha pendência do arquivo anterior (mesmo
      // com auto-save desligado — trocar arquivo SEM salvar perderia o
      // trabalho silenciosamente, o que e' pior que ignorar a pref).
      if (state.activeFilePath !== prev.activeFilePath) {
        if (timer && prev.activeFilePath) {
          clearTimeout(timer);
          timer = null;
          const content = serializeDocument(prev.sceneMeta, prev.fileBody);
          saveFile(prev.activeFilePath, content);
        }
        // Reset do status visual quando troca de arquivo. Sem isso, abrir
        // arquivo B logo apos salvar A mostraria "Salvo" pro arquivo B
        // que nem foi tocado ainda.
        state.setSaveStatus(state.activeFilePath ? "idle" : "idle");
        return;
      }
      // Só body ou meta disparam save
      const bodyChanged = state.fileBody !== prev.fileBody;
      const metaChanged = state.sceneMeta !== prev.sceneMeta;
      if (!bodyChanged && !metaChanged) return;
      if (timer) clearTimeout(timer);
      // Marca dirty ja — debounce decide quando virar `saving`.
      if (state.saveStatus !== "saving" && state.saveStatus !== "dirty") {
        state.setSaveStatus("dirty");
      }
      // Pref `autoSaveEnabled` desligada: deixa dirty parado. Ctrl+S
      // continua funcionando porque tem listener proprio (flushNow
      // direto). Visualmente o user ve "Editado" persistente — feedback
      // explicito de que ha pendencia.
      if (!state.autoSaveEnabled) return;
      timer = setTimeout(flushNow, DEBOUNCE_MS);
    });

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        flushNow();
        // Confirmação visual — sem isso o usuário não sabe se o Ctrl+S
        // surtiu efeito (o debounce já salvaria em 1.2s de qualquer forma).
        if (useAppStore.getState().activeFilePath) {
          useAppStore
            .getState()
            .pushToast("success", "Salvo", FORCE_FLUSH_HINT_MS);
        }
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      unsub();
      if (timer) {
        clearTimeout(timer);
        flushNow();
      }
      document.removeEventListener("keydown", onKey);
    };
  }, [saveFile]);
}
