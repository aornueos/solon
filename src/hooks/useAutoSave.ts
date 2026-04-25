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

    const flushNow = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const s = useAppStore.getState();
      if (!s.activeFilePath) return;
      const content = serializeDocument(s.sceneMeta, s.fileBody);
      saveFile(s.activeFilePath, content);
    };

    const unsub = useAppStore.subscribe((state, prev) => {
      // Troca de arquivo: flusha pendência do arquivo anterior
      if (state.activeFilePath !== prev.activeFilePath) {
        if (timer && prev.activeFilePath) {
          clearTimeout(timer);
          timer = null;
          const content = serializeDocument(prev.sceneMeta, prev.fileBody);
          saveFile(prev.activeFilePath, content);
        }
        return;
      }
      // Só body ou meta disparam save
      const bodyChanged = state.fileBody !== prev.fileBody;
      const metaChanged = state.sceneMeta !== prev.sceneMeta;
      if (!bodyChanged && !metaChanged) return;
      if (timer) clearTimeout(timer);
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
