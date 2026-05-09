import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { serializeDocument } from "../lib/frontmatter";
import { flushEditor } from "../lib/editorRef";
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

    const flushNow = async (): Promise<boolean> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Flush sync do trabalho pendente do Editor (turndown + setFileBody).
      // Sem isso, Ctrl+S logo apos digitar gravaria a versao 180ms
      // atrasada — o user perderia as ultimas teclas.
      flushEditor();
      const s = useAppStore.getState();
      if (!s.activeFilePath) return false;
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
        return true;
      } catch {
        // saveFile ja toasta erro internamente. Volta pra dirty pra
        // sinalizar que ainda ha pendencia.
        const after = useAppStore.getState();
        if (after.activeFilePath === s.activeFilePath) {
          after.setSaveStatus("dirty");
        }
        return false;
      }
    };

    const unsub = useAppStore.subscribe((state, prev) => {
      // Troca de arquivo: flusha pendência do arquivo anterior (mesmo
      // com auto-save desligado — trocar arquivo SEM salvar perderia o
      // trabalho silenciosamente, o que e' pior que ignorar a pref).
      // Nota: o Editor.tsx ja chama flushEditor() internamente no useEffect
      // de troca de path, entao quando este subscribe roda o `prev.fileBody`
      // ja' contem o body atualizado do arquivo anterior.
      if (state.activeFilePath !== prev.activeFilePath) {
        const shouldFlushPrevious =
          !!prev.activeFilePath &&
          (prev.saveStatus === "dirty" ||
            (timer !== null && prev.saveStatus !== "saved"));
        if (shouldFlushPrevious) {
          if (timer) clearTimeout(timer);
          timer = null;
          const content = serializeDocument(prev.sceneMeta, prev.fileBody);
          void saveFile(prev.activeFilePath!, content).catch(() => {
            // saveFile ja mostrou toast. Evita unhandled rejection neste
            // flush fire-and-forget durante troca de arquivo.
          });
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
        void (async () => {
          const ok = await flushNow();
          if (ok && useAppStore.getState().activeFilePath) {
            useAppStore
              .getState()
              .pushToast("success", "Salvo", FORCE_FLUSH_HINT_MS);
          }
        })();
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
