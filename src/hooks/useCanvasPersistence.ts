import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useCanvasStore } from "../store/useCanvasStore";
import { loadCanvas, saveCanvas } from "../lib/canvas";

/**
 * Hook global: carrega o canvas do arquivo ativo (sidecar
 * `<file>.canvas.json`) e mantém-no em sincronia com a store.
 *
 * - Cada `.md` tem seu próprio canvas; trocar de arquivo flusha o anterior
 *   e hidrata o doc do novo.
 * - Debounce 1s em mudanças de cards/arrows/texts/strokes/images.
 * - Viewport tem debounce 3s (muda muito com pan/zoom, evita IO excessivo).
 */
export function useCanvasPersistence() {
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const hydrate = useCanvasStore((s) => s.hydrate);
  const reset = useCanvasStore((s) => s.reset);

  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Flush pendências do arquivo anterior ANTES de trocar. Sem isso, um
    // timer em flight salvaria os dados novos no sidecar do arquivo antigo.
    const prevFile = hydratedFor.current;
    if (prevFile && prevFile !== activeFilePath) {
      if (cardTimer.current) {
        clearTimeout(cardTimer.current);
        cardTimer.current = null;
      }
      if (vpTimer.current) {
        clearTimeout(vpTimer.current);
        vpTimer.current = null;
      }
      saveCanvas(prevFile, useCanvasStore.getState().toDoc());
    }
    // Bloqueia persistência até o novo doc ser hidratado
    hydratedFor.current = null;

    (async () => {
      if (!activeFilePath) {
        reset();
        hydratedFor.current = null;
        return;
      }
      const doc = await loadCanvas(activeFilePath);
      if (cancelled) return;
      hydrate(activeFilePath, doc);
      hydratedFor.current = activeFilePath;
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFilePath, hydrate, reset]);

  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state, prev) => {
      const file = hydratedFor.current;
      if (!file || file !== state.filePath) return;

      const entitiesChanged =
        state.cards !== prev.cards ||
        state.arrows !== prev.arrows ||
        state.texts !== prev.texts ||
        state.strokes !== prev.strokes ||
        state.images !== prev.images;
      const vpChanged = state.viewport !== prev.viewport;

      if (entitiesChanged) {
        if (cardTimer.current) clearTimeout(cardTimer.current);
        cardTimer.current = setTimeout(() => {
          saveCanvas(file, useCanvasStore.getState().toDoc());
        }, 1000);
      }
      if (vpChanged) {
        if (vpTimer.current) clearTimeout(vpTimer.current);
        vpTimer.current = setTimeout(() => {
          saveCanvas(file, useCanvasStore.getState().toDoc());
        }, 3000);
      }
    });
    return () => {
      unsub();
      if (cardTimer.current) clearTimeout(cardTimer.current);
      if (vpTimer.current) clearTimeout(vpTimer.current);
      const file = hydratedFor.current;
      if (file) saveCanvas(file, useCanvasStore.getState().toDoc());
    };
  }, []);
}
