import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize,
  Crosshair,
  MousePointer2,
  Pencil,
  Type,
  MoveUpRight,
  Eraser,
} from "lucide-react";
import { useRef } from "react";
import clsx from "clsx";
import { useCanvasStore } from "../../store/useCanvasStore";
import { DRAW_COLORS } from "../../types/canvas";

export function CanvasToolbar() {
  const {
    viewport,
    setViewport,
    addCard,
    cards,
    texts,
    images,
    zoomAt,
    tool,
    setTool,
    drawColor,
    setDrawColor,
    drawWidth,
    setDrawWidth,
  } = useCanvasStore();

  const rootRef = useRef<HTMLDivElement>(null);

  const getCanvasRect = () => {
    // A toolbar está *dentro* do container canvas — seu offsetParent é a
    // superfície. Subimos até achar .canvas-surface pra medir o retângulo
    // real do canvas e não a janela inteira.
    const el = rootRef.current;
    if (!el) return null;
    const surface = el.closest(".canvas-surface") as HTMLElement | null;
    return surface?.getBoundingClientRect() ?? null;
  };

  const fitAll = () => {
    const boxes: { x: number; y: number; w: number; h: number }[] = [
      ...cards,
      ...images,
      ...texts.map((t) => ({ x: t.x, y: t.y, w: t.size * 4, h: t.size })),
    ];
    if (boxes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const padding = 80;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const rect = getCanvasRect();
    const screenW = rect?.width ?? window.innerWidth - 280;
    const screenH = rect?.height ?? window.innerHeight - 120;
    const zoom = Math.min(1.2, Math.min(screenW / w, screenH / h));
    setViewport({
      zoom,
      x: -(minX - padding) * zoom + (screenW - (w - padding * 2) * zoom) / 2,
      y: -(minY - padding) * zoom + (screenH - (h - padding * 2) * zoom) / 2,
    });
  };

  const zoomStep = (dir: 1 | -1) => {
    const rect = getCanvasRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    zoomAt(cx, cy, dir * 200);
  };

  return (
    <div
      ref={rootRef}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full shadow-md px-2 py-1.5"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
      }}
    >
      <ToolBtn
        title="Selecionar (V)"
        active={tool === "select"}
        onClick={() => setTool("select")}
      >
        <MousePointer2 size={13} />
      </ToolBtn>
      <ToolBtn
        title="Desenhar (P)"
        active={tool === "draw"}
        onClick={() => setTool("draw")}
      >
        <Pencil size={13} />
      </ToolBtn>
      <ToolBtn
        title="Texto (T)"
        active={tool === "text"}
        onClick={() => setTool("text")}
      >
        <Type size={13} />
      </ToolBtn>
      <ToolBtn
        title="Seta (A) — clique em 2 cards para conectar"
        active={tool === "arrow"}
        onClick={() => setTool("arrow")}
      >
        <MoveUpRight size={13} />
      </ToolBtn>
      <ToolBtn
        title="Borracha (E) — clique em qualquer item para apagar"
        active={tool === "eraser"}
        onClick={() => setTool("eraser")}
      >
        <Eraser size={13} />
      </ToolBtn>
      <Divider />
      <Btn title="Novo card (N)" onClick={() => addCard()}>
        <Plus size={14} />
        <span className="text-[0.72rem]">Card</span>
      </Btn>
      <Divider />

      {(tool === "draw" || tool === "text") && (
        <>
          <div className="flex items-center gap-1 pl-0.5 pr-1">
            {/* "Auto" (value vazio) e theme-aware tanto pra texto quanto
                pra stroke — o StrokeLayer/FloatingText mapeiam vazio pra
                var(--text-primary) na hora de renderizar. Antes a gente
                filtrava Auto em draw mode, mas com a migracao agora ela
                vale pros dois e e o default visualmente correto. */}
            {DRAW_COLORS.map((c) => (
                <button
                  key={c.value || "auto"}
                  title={c.label}
                  onClick={() => setDrawColor(c.value)}
                  style={{
                    background:
                      c.value ||
                      "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
                    borderColor:
                      drawColor === c.value
                        ? "var(--text-primary)"
                        : "var(--border)",
                  }}
                  className={clsx(
                    "w-4 h-4 rounded-full border transition-transform",
                    drawColor === c.value ? "scale-110" : "hover:scale-110",
                  )}
                />
              ))}
          </div>
          {tool === "draw" && (
            <>
              <Divider />
              <div className="flex items-center gap-1 px-1">
                {[1.5, 3, 6].map((w) => (
                  <button
                    key={w}
                    title={`Espessura ${w}px`}
                    onClick={() => setDrawWidth(w)}
                    className={clsx(
                      "rounded-full transition-opacity",
                      drawWidth === w ? "opacity-100" : "opacity-40 hover:opacity-70",
                    )}
                    style={{
                      width: Math.max(8, w + 4),
                      height: Math.max(8, w + 4),
                      background: "var(--text-secondary)",
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <Divider />
        </>
      )}

      <Btn title="Zoom out (-)" onClick={() => zoomStep(1)}>
        <ZoomOut size={14} />
      </Btn>
      <span
        className="text-[0.68rem] tabular-nums w-10 text-center"
        style={{ color: "var(--text-muted)" }}
      >
        {Math.round(viewport.zoom * 100)}%
      </span>
      <Btn title="Zoom in (+)" onClick={() => zoomStep(-1)}>
        <ZoomIn size={14} />
      </Btn>
      <Divider />
      <Btn title="Centralizar tudo (F)" onClick={fitAll}>
        <Maximize size={14} />
      </Btn>
      <Btn
        title="Resetar viewport"
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
      >
        <Crosshair size={14} />
      </Btn>
    </div>
  );
}

function Btn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
      style={{
        background: active ? "var(--bg-inverse)" : "transparent",
        color: active ? "var(--text-inverse)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-4"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
