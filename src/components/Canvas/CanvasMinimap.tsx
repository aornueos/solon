import { useMemo } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { strokeRect, textRect } from "../../lib/canvasGeom";

const MINIMAP_W = 168;
const MINIMAP_H = 112;

export function CanvasMinimap() {
  const cards = useCanvasStore((s) => s.cards);
  const texts = useCanvasStore((s) => s.texts);
  const images = useCanvasStore((s) => s.images);
  const strokes = useCanvasStore((s) => s.strokes);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const data = useMemo(() => {
    const strokeBoxes = strokes
      .map(strokeRect)
      .filter((box): box is { x: number; y: number; w: number; h: number } => !!box);
    const boxes = [
      ...cards.map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })),
      ...images.map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })),
      ...texts.map(textRect),
      ...strokeBoxes,
    ];
    if (boxes.length === 0) return null;
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.w));
    const maxY = Math.max(...boxes.map((box) => box.y + box.h));
    const pad = 120;
    const world = {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(1, maxX - minX + pad * 2),
      h: Math.max(1, maxY - minY + pad * 2),
    };
    const scale = Math.min(MINIMAP_W / world.w, MINIMAP_H / world.h);
    const offsetX = (MINIMAP_W - world.w * scale) / 2;
    const offsetY = (MINIMAP_H - world.h * scale) / 2;
    return { boxes, world, scale, offsetX, offsetY };
  }, [cards, images, strokes, texts]);

  if (!data) return null;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const visible = {
    x: (-viewport.x / viewport.zoom - data.world.x) * data.scale + data.offsetX,
    y: (-viewport.y / viewport.zoom - data.world.y) * data.scale + data.offsetY,
    w: (screenW / viewport.zoom) * data.scale,
    h: (screenH / viewport.zoom) * data.scale,
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const worldX = (localX - data.offsetX) / data.scale + data.world.x;
    const worldY = (localY - data.offsetY) / data.scale + data.world.y;
    setViewport({
      x: window.innerWidth / 2 - worldX * viewport.zoom,
      y: window.innerHeight / 2 - worldY * viewport.zoom,
    });
  };

  return (
    <div
      className="absolute right-3 bottom-3 z-20 rounded-lg shadow-md overflow-hidden"
      style={{
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
        border: "1px solid var(--border)",
      }}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Minimapa do canvas"
      role="button"
      tabIndex={0}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H} aria-hidden>
        {data.boxes.map((box, index) => (
          <rect
            key={`${box.x}:${box.y}:${index}`}
            x={(box.x - data.world.x) * data.scale + data.offsetX}
            y={(box.y - data.world.y) * data.scale + data.offsetY}
            width={Math.max(2, box.w * data.scale)}
            height={Math.max(2, box.h * data.scale)}
            rx={2}
            fill="var(--text-muted)"
            opacity={0.55}
          />
        ))}
        <rect
          x={visible.x}
          y={visible.y}
          width={Math.max(8, visible.w)}
          height={Math.max(8, visible.h)}
          fill="transparent"
          stroke="var(--accent)"
          strokeWidth={1.5}
          rx={3}
        />
      </svg>
    </div>
  );
}
