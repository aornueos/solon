import { memo } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { CanvasStroke, CardSide } from "../../types/canvas";
import { strokeRect } from "../../lib/canvasGeom";
import { startCanvasLinkDrag } from "../../lib/canvasLinkDrag";

/**
 * SVG com os traços de free-draw. Renderizado dentro do world container
 * (coords já estão em world space).
 *
 * Recebe `liveStroke` opcional: o traço que está sendo desenhado *agora*
 * (antes de ser commitado na store). Evita re-commit a cada pixel.
 */
export const StrokeLayer = memo(function StrokeLayer({
  worldWidth,
  worldHeight,
  liveStroke,
}: {
  worldWidth: number;
  worldHeight: number;
  liveStroke?: CanvasStroke | null;
}) {
  const strokes = useCanvasStore((s) => s.strokes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const select = useCanvasStore((s) => s.select);
  const toggleInSelection = useCanvasStore((s) => s.toggleInSelection);
  const tool = useCanvasStore((s) => s.tool);
  const eraseById = useCanvasStore((s) => s.eraseById);
  const linkingFromId = useCanvasStore((s) => s.linkingFromId);
  const linkingFromSide = useCanvasStore((s) => s.linkingFromSide);
  const zoom = useCanvasStore((s) => s.viewport.zoom || 1);
  const beginLink = useCanvasStore((s) => s.beginLink);
  const completeLink = useCanvasStore((s) => s.completeLink);

  return (
    <svg
      width={worldWidth}
      height={worldHeight}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {strokes.map((s) => {
        const isSel = selectedId === s.id;
        // Grupo: stroke esta em selectedIds mas nao e o primary.
        // Desenhamos um halo mais fino e com a cor de selection-ring pra
        // diferenciar visualmente do primary.
        const isInGroup = !isSel && selectedIds.has(s.id);
        const isLinkSource = linkingFromId === s.id;
        const isLinkCandidate = linkingFromId !== null && linkingFromId !== s.id;
        const bounds = strokeRect(s);
        const d = pointsToPath(s.points);
        if (!d) return null;
        // Cor de render theme-aware: vazio ("Auto") ou o legado "#2a2420"
        // (Tinta sepia escuro, default antigo) viram var(--text-primary).
        // Mesma logica do FloatingText — strokes criados em tema claro
        // continuam legiveis ao trocar pra dark. Cores deliberadas
        // (sangue, indigo, marcador, floresta) sao preservadas.
        const strokeColor =
          !s.color || s.color === "#2a2420"
            ? "var(--text-primary)"
            : s.color;
        return (
          <g
            key={s.id}
            className="group"
            data-canvas-entity-id={s.id}
            style={{
              pointerEvents:
                tool === "select" || tool === "eraser" ? "auto" : "none",
            }}
          >
            {/* Hit area gorda (transparente) pra facilitar seleção/borracha */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={Math.max(12, s.width + 8)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ cursor: tool === "eraser" ? "cell" : "pointer" }}
              onMouseDown={(e) => {
                if (tool === "eraser") {
                  e.stopPropagation();
                  eraseById(s.id);
                  return;
                }
                if (tool !== "select") return;
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                  toggleInSelection(s.id);
                  return;
                }
                select(s.id);
              }}
            />
            <path
              d={d}
              stroke={strokeColor}
              strokeWidth={s.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isSel || isInGroup ? 0.7 : 1}
              style={{ pointerEvents: "none" }}
            />
            {isSel && (
              <path
                d={d}
                stroke="var(--accent)"
                strokeWidth={s.width + 4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
                style={{ pointerEvents: "none" }}
              />
            )}
            {isInGroup && (
              <path
                d={d}
                stroke="var(--selection-ring)"
                strokeWidth={s.width + 3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.35}
                strokeDasharray="4 3"
                style={{ pointerEvents: "none" }}
              />
            )}
            {bounds && tool !== "eraser" && (
              <StrokeConnectionDots
                entityId={s.id}
                rect={bounds}
                isLinkSource={isLinkSource}
                isLinkCandidate={isLinkCandidate}
                linkingFromSide={linkingFromSide}
                zoom={zoom}
                isSelected={isSel}
                onPick={(side) => {
                  if (linkingFromId && linkingFromId !== s.id) {
                    completeLink(s.id, side);
                  } else {
                    beginLink(s.id, side);
                  }
                }}
              />
            )}
          </g>
        );
      })}

      {liveStroke && liveStroke.points.length >= 2 && (
        <path
          d={pointsToPath(liveStroke.points) ?? ""}
          stroke={
            !liveStroke.color || liveStroke.color === "#2a2420"
              ? "var(--text-primary)"
              : liveStroke.color
          }
          strokeWidth={liveStroke.width}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
});

function pointsToPath(pts: number[]): string | null {
  if (pts.length < 2) return null;
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) {
    d += ` L ${pts[i]} ${pts[i + 1]}`;
  }
  return d;
}

function StrokeConnectionDots({
  entityId,
  rect,
  isLinkSource,
  isLinkCandidate,
  linkingFromSide,
  zoom,
  isSelected,
  onPick,
}: {
  entityId: string;
  rect: { x: number; y: number; w: number; h: number };
  isLinkSource: boolean;
  isLinkCandidate: boolean;
  linkingFromSide: CardSide | null;
  zoom: number;
  isSelected: boolean;
  onPick: (side: CardSide) => void;
}) {
  const alwaysShow = isLinkSource || isLinkCandidate || isSelected;
  const radius = 6 / zoom;
  const strokeWidth = 2 / zoom;
  const sides: { side: CardSide; x: number; y: number; title: string }[] = [
    { side: "top", x: rect.x + rect.w / 2, y: rect.y, title: "Conectar pelo topo" },
    { side: "right", x: rect.x + rect.w, y: rect.y + rect.h / 2, title: "Conectar pela direita" },
    { side: "bottom", x: rect.x + rect.w / 2, y: rect.y + rect.h, title: "Conectar pela base" },
    { side: "left", x: rect.x, y: rect.y + rect.h / 2, title: "Conectar pela esquerda" },
  ];

  return (
    <>
      {sides.map(({ side, x, y, title }) => {
        const activeSource = isLinkSource && linkingFromSide === side;
        return (
          <circle
            key={side}
            cx={x}
            cy={y}
            r={radius}
            data-connection-side={side}
            className={alwaysShow ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
            style={{
              cursor: "crosshair",
              fill: activeSource ? "var(--accent)" : "var(--bg-panel)",
              stroke: "var(--accent)",
              strokeWidth,
              pointerEvents: "auto",
              transition: "opacity 120ms ease",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPick(side);
              startCanvasLinkDrag(entityId, e);
            }}
          >
            <title>{title}</title>
          </circle>
        );
      })}
    </>
  );
}
