import { useMemo } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { textRect } from "../../lib/canvasGeom";

type Box = { id: string; x: number; y: number; w: number; h: number };

export function SelectionOverlay() {
  const cards = useCanvasStore((s) => s.cards);
  const texts = useCanvasStore((s) => s.texts);
  const images = useCanvasStore((s) => s.images);
  const strokes = useCanvasStore((s) => s.strokes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const viewport = useCanvasStore((s) => s.viewport);

  const ids = useMemo(() => {
    const set = new Set(selectedIds);
    if (selectedId) set.add(selectedId);
    return set;
  }, [selectedId, selectedIds]);

  const boxes = useMemo(() => {
    if (ids.size === 0) return [];
    const result: Box[] = [];
    for (const c of cards) {
      if (ids.has(c.id)) result.push({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h });
    }
    for (const t of texts) {
      if (ids.has(t.id)) result.push({ id: t.id, ...textRect(t) });
    }
    for (const img of images) {
      if (ids.has(img.id)) {
        result.push({ id: img.id, x: img.x, y: img.y, w: img.w, h: img.h });
      }
    }
    for (const stroke of strokes) {
      if (!ids.has(stroke.id)) continue;
      const box = strokeBox(stroke.points);
      if (box) result.push({ id: stroke.id, ...box });
    }
    return result;
  }, [cards, images, ids, strokes, texts]);

  if (boxes.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 34 }}>
      {boxes.map((box) => {
        const isPrimary = selectedId === box.id;
        return (
          <div
            key={box.id}
            style={{
              position: "absolute",
              left: box.x * viewport.zoom + viewport.x,
              top: box.y * viewport.zoom + viewport.y,
              width: Math.max(1, box.w * viewport.zoom),
              height: Math.max(1, box.h * viewport.zoom),
              border: isPrimary
                ? "2px solid var(--accent)"
                : "2px dashed var(--selection-ring)",
              borderRadius: 6,
              boxShadow: isPrimary ? "0 0 0 1px var(--bg-panel)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function strokeBox(points: number[]) {
  if (points.length < 2) return null;
  let minX = points[0];
  let minY = points[1];
  let maxX = points[0];
  let maxY = points[1];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}
