/**
 * Helper para drags baseados em `mousedown` → `mousemove`/`mouseup` no
 * documento. Centraliza a limpeza dos listeners para evitar:
 *  - handlers vazados quando o usuário solta fora da janela ou a aba perde
 *    foco (listeners ficariam grudados e corromperiam o próximo drag);
 *  - estado fantasma (`dragState.current` não nulo) quando um drag foi
 *    abortado por troca de ferramenta, Esc, unmount, etc.
 *
 * Uso típico dentro de um `onMouseDown`:
 *
 *    startDrag({
 *      onMove: (ev) => updateCard(id, { x: ... }),
 *      onEnd:  () => commit(),
 *      onCancel: () => revert(),
 *    });
 */
export interface DragHandlers {
  /** Chamado a cada `mousemove`. */
  onMove: (e: MouseEvent) => void;
  /** Chamado no `mouseup` bem-sucedido. Sempre recebe o último evento. */
  onEnd?: (e: MouseEvent) => void;
  /** Chamado quando o drag é abortado (blur da janela, Esc). */
  onCancel?: () => void;
}

export interface DragController {
  /** Aborta o drag sem chamar `onEnd` (chama `onCancel`). */
  cancel: () => void;
}

export function startDrag(h: DragHandlers): DragController {
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("blur", onBlur);
  };

  const onMove = (e: MouseEvent) => {
    if (disposed) return;
    h.onMove(e);
  };
  const onUp = (e: MouseEvent) => {
    if (disposed) return;
    dispose();
    h.onEnd?.(e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (disposed) return;
    if (e.key === "Escape") {
      dispose();
      h.onCancel?.();
    }
  };
  const onBlur = () => {
    // Se a janela perder foco durante um drag, abortamos — senão o mouseup
    // nunca dispara (o SO engole) e o próximo mousedown herda o estado.
    if (disposed) return;
    dispose();
    h.onCancel?.();
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  document.addEventListener("keydown", onKey);
  window.addEventListener("blur", onBlur);

  return {
    cancel: () => {
      if (disposed) return;
      dispose();
      h.onCancel?.();
    },
  };
}
