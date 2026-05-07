import { useCanvasStore } from "../store/useCanvasStore";
import { CardSide } from "../types/canvas";
import { startDrag } from "./drag";
import type { MouseEvent as ReactMouseEvent } from "react";

export const CANVAS_EMPTY_LINK_EVENT = "solon:canvas-empty-link";

export type CanvasEmptyLinkDetail = {
  clientX: number;
  clientY: number;
};

export function startCanvasLinkDrag(
  entityId: string,
  startEvent: ReactMouseEvent,
) {
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;

  startDrag({
    onMove: () => {},
    onEnd: (ev) => {
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (moved < 8) return;

      const state = useCanvasStore.getState();
      if (state.linkingFromId !== entityId) return;

      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetEntity = target?.closest("[data-canvas-entity-id]");
      const targetId = targetEntity?.getAttribute("data-canvas-entity-id");
      if (targetId && targetId !== entityId) {
        const side = target
          ?.closest("[data-connection-side]")
          ?.getAttribute("data-connection-side") as CardSide | null;
        state.completeLink(targetId, side ?? undefined);
        return;
      }

      window.dispatchEvent(
        new CustomEvent<CanvasEmptyLinkDetail>(CANVAS_EMPTY_LINK_EVENT, {
          detail: { clientX: ev.clientX, clientY: ev.clientY },
        }),
      );
    },
  });
}
