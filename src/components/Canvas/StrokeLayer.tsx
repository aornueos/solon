import { useCanvasStore } from "../../store/useCanvasStore";
import { CanvasStroke } from "../../types/canvas";

/**
 * SVG com os traços de free-draw. Renderizado dentro do world container
 * (coords já estão em world space).
 *
 * Recebe `liveStroke` opcional: o traço que está sendo desenhado *agora*
 * (antes de ser commitado na store). Evita re-commit a cada pixel.
 */
export function StrokeLayer({
  worldWidth,
  worldHeight,
  liveStroke,
}: {
  worldWidth: number;
  worldHeight: number;
  liveStroke?: CanvasStroke | null;
}) {
  const { strokes, selectedId, selectedIds, select, tool, eraseById } =
    useCanvasStore();

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
}

function pointsToPath(pts: number[]): string | null {
  if (pts.length < 2) return null;
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) {
    d += ` L ${pts[i]} ${pts[i + 1]}`;
  }
  return d;
}
