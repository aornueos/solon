import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { useCanvasStore } from "../store/useCanvasStore";
import { makeSnapshot } from "../lib/sceneSnapshot";

/**
 * Mantém os scene cards do canvas sincronizados com edições feitas no editor.
 *
 * Sempre que o `sceneMeta` ou `fileBody` da cena ativa mudar na store,
 * propaga um novo snapshot para todos os cards que apontam para o mesmo
 * arquivo. Debounce curto (300ms) para não spammar em cada keystroke.
 */
export function useSceneCardSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useAppStore.subscribe((state, prev) => {
      const contentChanged =
        state.sceneMeta !== prev.sceneMeta ||
        state.fileBody !== prev.fileBody ||
        state.activeFileName !== prev.activeFileName;
      if (!contentChanged) return;
      if (!state.activeFilePath || !state.activeFileName) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = useAppStore.getState();
        if (!s.activeFilePath || !s.activeFileName) return;
        const snap = makeSnapshot(s.activeFileName, s.sceneMeta, s.fileBody);
        useCanvasStore
          .getState()
          .updateSceneSnapshotByPath(s.activeFilePath, snap);
      }, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);
}
