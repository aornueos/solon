import clsx from "clsx";
import type { CSSProperties } from "react";
import { CardSide } from "../../types/canvas";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startCanvasLinkDrag } from "../../lib/canvasLinkDrag";

const SIDES: {
  side: CardSide;
  style: CSSProperties;
  title: string;
}[] = [
  {
    side: "top",
    style: { top: 0, left: "50%", transform: "translate(-50%, -50%)" },
    title: "Conectar pelo topo",
  },
  {
    side: "right",
    style: { top: "50%", left: "100%", transform: "translate(-50%, -50%)" },
    title: "Conectar pela direita",
  },
  {
    side: "bottom",
    style: { top: "100%", left: "50%", transform: "translate(-50%, -50%)" },
    title: "Conectar pela base",
  },
  {
    side: "left",
    style: { top: "50%", left: 0, transform: "translate(-50%, -50%)" },
    title: "Conectar pela esquerda",
  },
];

export function ConnectionDots({
  entityId,
  isLinkSource,
  isLinkCandidate,
  linkingFromSide,
  isSelected,
  onPick,
}: {
  entityId: string;
  isLinkSource: boolean;
  isLinkCandidate: boolean;
  linkingFromSide: CardSide | null;
  isSelected: boolean;
  onPick: (side: CardSide) => void;
}) {
  const alwaysShow = isLinkSource || isLinkCandidate || isSelected;
  const zoom = useCanvasStore((s) => s.viewport.zoom || 1);
  const dotSize = 12 / zoom;
  const border = 2 / zoom;
  const mask = 3 / zoom;

  return (
    <>
      {SIDES.map(({ side, style, title }) => {
        const activeSource = isLinkSource && linkingFromSide === side;
        return (
          <button
            key={side}
            data-connection-dot
            data-card-action
            data-text-action
            data-image-action
            data-connection-side={side}
            title={title}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPick(side);
              startCanvasLinkDrag(entityId, e);
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={clsx(
              "absolute rounded-full transition-opacity",
              alwaysShow ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{
              ...style,
              width: dotSize,
              height: dotSize,
              background: activeSource ? "var(--accent)" : "var(--bg-panel)",
              border: `${border}px solid var(--accent)`,
              cursor: "crosshair",
              zIndex: 30,
              boxShadow: `0 0 0 ${mask}px var(--bg-app), 0 ${1 / zoom}px ${2 / zoom}px rgba(0,0,0,0.18)`,
            }}
          />
        );
      })}
    </>
  );
}
