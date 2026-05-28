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
  CopyPlus,
  BringToFront,
  SendToBack,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import clsx from "clsx";
import { useCanvasStore } from "../../store/useCanvasStore";
import { CANVAS_TOOL_ORDER, CanvasTool, DRAW_COLORS } from "../../types/canvas";

const TOOL_META: Record<
  CanvasTool,
  { title: string; icon: React.ReactNode }
> = {
  select: { title: "Selecionar", icon: <MousePointer2 size={13} /> },
  arrow: { title: "Seta", icon: <MoveUpRight size={13} /> },
  draw: { title: "Desenhar", icon: <Pencil size={13} /> },
  text: { title: "Texto", icon: <Type size={13} /> },
  eraser: { title: "Borracha", icon: <Eraser size={13} /> },
};

export function CanvasToolbar() {
  // Seletores granulares. Antes assinava `useCanvasStore()` cru — a
  // toolbar re-renderizava a CADA mutação da store (pan/zoom/drag de
  // card/stroke/edição). Agora só re-renderiza no que de fato é exibido:
  // tool, draw*, zoom (não viewport inteiro), selectionCount (derivado).
  const tool = useCanvasStore((s) => s.tool);
  const drawColor = useCanvasStore((s) => s.drawColor);
  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const zoom = useCanvasStore((s) => s.viewport.zoom);
  // Derivado: muda só quando a contagem efetiva muda (não no shuffle
  // interno do Set selectedIds nem em mudanças de outros campos).
  const selectionCount = useCanvasStore(
    (s) => s.selectedIds.size || (s.selectedId ? 1 : 0),
  );
  // Actions têm ref estável em Zustand — subscrever é grátis em renders.
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setTool = useCanvasStore((s) => s.setTool);
  const setDrawColor = useCanvasStore((s) => s.setDrawColor);
  const setDrawWidth = useCanvasStore((s) => s.setDrawWidth);
  const addCard = useCanvasStore((s) => s.addCard);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const bringSelectionToFront = useCanvasStore((s) => s.bringSelectionToFront);
  const sendSelectionToBack = useCanvasStore((s) => s.sendSelectionToBack);
  const removeSelected = useCanvasStore((s) => s.removeSelected);

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
    // cards/texts/images são usados SÓ aqui — leio do snapshot no clique
    // em vez de assinar (essas arrays mudam toda hora; subscrever forçaria
    // re-render da toolbar a cada drag/edição sem necessidade).
    const { cards, texts, images } = useCanvasStore.getState();
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
      x: -(minX - padding) * zoom + (screenW - w * zoom) / 2,
      y: -(minY - padding) * zoom + (screenH - h * zoom) / 2,
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
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1.5"
      style={{
        background: "var(--bg-panel)",
        border: "2px solid var(--border-strong)",
        borderRadius: 0,
        boxShadow: "var(--shadow-flat-sm)",
      }}
    >
      {CANVAS_TOOL_ORDER.map((canvasTool, index) => {
        const meta = TOOL_META[canvasTool];
        const extra =
          canvasTool === "arrow"
            ? " - clique em 2 itens para conectar"
            : canvasTool === "eraser"
              ? " - clique em qualquer item para apagar"
              : "";
        return (
          <ToolBtn
            key={canvasTool}
            title={`${index + 1}. ${meta.title}${extra}`}
            active={tool === canvasTool}
            onClick={() => setTool(canvasTool)}
          >
            {meta.icon}
          </ToolBtn>
        );
      })}
      <Divider />
      <Btn title="Novo card (N)" onClick={() => addCard()}>
        <Plus size={14} />
        <span className="text-[0.72rem]">Card</span>
      </Btn>
      {selectionCount > 0 && (
        <>
          <Divider />
          <Btn title="Duplicar seleção (Ctrl+D)" onClick={duplicateSelected}>
            <CopyPlus size={14} />
          </Btn>
          <Btn title="Trazer para frente" onClick={bringSelectionToFront}>
            <BringToFront size={14} />
          </Btn>
          <Btn title="Enviar para trás" onClick={sendSelectionToBack}>
            <SendToBack size={14} />
          </Btn>
          <Btn title="Excluir seleção (Del)" onClick={removeSelected}>
            <Trash2 size={14} />
          </Btn>
        </>
      )}
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
                  aria-label={`Cor ${c.label}`}
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
                    aria-label={`Espessura ${w}px`}
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
        {Math.round(zoom * 100)}%
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
      aria-label={title}
      className="flex items-center gap-1 px-2 py-1 transition-colors"
      style={{
        color: "var(--text-secondary)",
        border: "1px solid transparent",
        borderRadius: 0,
        fontFamily: "var(--font-display)",
        fontSize: "0.78rem",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.borderColor = "transparent";
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
      aria-label={title}
      aria-pressed={active}
      className="flex items-center gap-1 px-2 py-1 transition-colors"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.borderColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-5 mx-0.5"
      style={{ background: "var(--border-strong)", opacity: 0.6 }}
    />
  );
}
