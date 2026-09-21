import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { strokeRect, textRect } from "../../lib/canvasGeom";
import { startDrag } from "../../lib/drag";

const MINIMAP_W = 168;
const MINIMAP_H = 112;
const HIDDEN_STORAGE_KEY = "solon:canvasMinimapHidden";

function loadHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mede a superfície do canvas, não a janela. O retângulo de "onde você
 * está" é `tamanho da superfície / zoom`: medir a janela inteira o fazia
 * desenhar uma área maior que a visível pela largura da sidebar e dos
 * painéis, e o clique para navegar caía deslocado pela mesma margem.
 */
function useSurfaceSize(ref: React.MutableRefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const surface = ref.current?.closest(".canvas-surface");
    if (!(surface instanceof HTMLElement)) return;
    const measure = () => {
      const rect = surface.getBoundingClientRect();
      setSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function CanvasMinimap() {
  const [hidden, setHidden] = useState<boolean>(() => loadHidden());
  const rootRef = useRef<HTMLElement | null>(null);
  const setRootRef = (node: HTMLElement | null) => {
    rootRef.current = node;
  };
  const surface = useSurfaceSize(rootRef);

  const cards = useCanvasStore((s) => s.cards);
  const texts = useCanvasStore((s) => s.texts);
  const images = useCanvasStore((s) => s.images);
  const strokes = useCanvasStore((s) => s.strokes);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Sem localStorage o minimapa apenas volta a aparecer na próxima sessão.
    }
  }, [hidden]);

  const data = useMemo(() => {
    const boxes = [
      ...cards.map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })),
      ...images.map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })),
      ...texts.map(textRect),
      ...strokes.map(strokeRect).filter((box) => box !== null),
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
    return {
      boxes,
      world,
      scale,
      offsetX: (MINIMAP_W - world.w * scale) / 2,
      offsetY: (MINIMAP_H - world.h * scale) / 2,
    };
  }, [cards, images, strokes, texts]);

  if (hidden) {
    return (
      <button
        ref={setRootRef}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setHidden(false)}
        title="Mostrar minimapa"
        aria-label="Mostrar minimapa"
        className="solon-canvas-btn solon-canvas-btn--outline absolute right-3 bottom-3 z-20 h-9 w-9 flex items-center justify-center"
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <MapIcon size={15} />
      </button>
    );
  }

  if (!data) return null;

  const visible = {
    x: (-viewport.x / viewport.zoom - data.world.x) * data.scale + data.offsetX,
    y: (-viewport.y / viewport.zoom - data.world.y) * data.scale + data.offsetY,
    w: (surface.w / viewport.zoom) * data.scale,
    h: (surface.h / viewport.zoom) * data.scale,
  };

  /** Centraliza a vista no ponto do mundo sob o cursor. */
  const centerOn = (clientX: number, clientY: number, rect: DOMRect) => {
    const worldX = (clientX - rect.left - data.offsetX) / data.scale + data.world.x;
    const worldY = (clientY - rect.top - data.offsetY) / data.scale + data.world.y;
    setViewport({
      x: surface.w / 2 - worldX * viewport.zoom,
      y: surface.h / 2 - worldY * viewport.zoom,
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    centerOn(event.clientX, event.clientY, rect);
    startDrag({ onMove: (ev) => centerOn(ev.clientX, ev.clientY, rect) });
  };

  return (
    <div
      ref={setRootRef}
      className="absolute right-3 bottom-3 z-20 group"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-full h-full overflow-hidden cursor-pointer"
        style={{
          background: "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
        }}
        onPointerDown={onPointerDown}
        title="Clique ou arraste para navegar pelo canvas"
      >
        <svg width={MINIMAP_W} height={MINIMAP_H} aria-hidden>
          {data.boxes.map((box, index) => (
            <rect
              key={index}
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
            fill="var(--marquee-fill)"
            stroke="var(--accent)"
            strokeWidth={1.5}
            rx={3}
          />
        </svg>
      </div>
      <button
        onClick={() => setHidden(true)}
        title="Ocultar minimapa"
        aria-label="Ocultar minimapa"
        className="solon-canvas-btn solon-canvas-btn--outline absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-pill)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
