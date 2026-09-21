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
import {
  canvasSurfaceRect,
  fitAllViewport,
  zoomStep,
} from "../../lib/canvasViewport";

const TOOL_META: Record<
  CanvasTool,
  { title: string; hint?: string; icon: React.ReactNode }
> = {
  select: { title: "Selecionar", icon: <MousePointer2 size={14} /> },
  arrow: {
    title: "Seta",
    hint: "clique em dois itens para conectar",
    icon: <MoveUpRight size={14} />,
  },
  draw: { title: "Desenhar", icon: <Pencil size={14} /> },
  text: { title: "Texto", icon: <Type size={14} /> },
  eraser: {
    title: "Borracha",
    hint: "clique num item para apagar",
    icon: <Eraser size={14} />,
  },
};

const STROKE_WIDTHS = [1.5, 3, 6];

const barStyle: React.CSSProperties = {
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-md)",
};

/**
 * Chrome principal do canvas: ferramentas, criação e controles de vista.
 *
 * A barra de cima tem largura fixa por construção. Tudo que depende da
 * ferramenta ativa ou da seleção vive numa segunda barra abaixo dela —
 * com os dois grupos na mesma pílula centralizada, selecionar um card
 * reposicionava todos os botões e o alvo saía de baixo do cursor.
 */
export function CanvasToolbar() {
  const tool = useCanvasStore((s) => s.tool);
  const zoom = useCanvasStore((s) => s.viewport.zoom);
  const selectionCount = useCanvasStore(
    (s) => s.selectedIds.size || (s.selectedId ? 1 : 0),
  );
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setTool = useCanvasStore((s) => s.setTool);
  const addCard = useCanvasStore((s) => s.addCard);

  const rootRef = useRef<HTMLDivElement>(null);

  const showToolOptions = tool === "draw" || tool === "text";
  const showSelection = selectionCount > 0;

  return (
    <div
      ref={rootRef}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5"
    >
      <div className="flex items-center gap-1 px-2 py-1.5" style={barStyle}>
        {CANVAS_TOOL_ORDER.map((canvasTool, index) => {
          const meta = TOOL_META[canvasTool];
          const shortcut = `(${index + 1})`;
          return (
            <ToolBtn
              key={canvasTool}
              title={
                meta.hint
                  ? `${meta.title} ${shortcut} — ${meta.hint}`
                  : `${meta.title} ${shortcut}`
              }
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

        <Divider />

        <Btn title="Afastar (−)" onClick={() => zoomStep(1, rootRef.current)}>
          <ZoomOut size={14} />
        </Btn>
        <span
          className="text-[0.68rem] tabular-nums w-10 text-center"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <Btn title="Aproximar (+)" onClick={() => zoomStep(-1, rootRef.current)}>
          <ZoomIn size={14} />
        </Btn>

        <Divider />

        <Btn
          title="Enquadrar tudo (F)"
          onClick={() =>
            setViewport(fitAllViewport(canvasSurfaceRect(rootRef.current)))
          }
        >
          <Maximize size={14} />
        </Btn>
        <Btn
          title="Voltar ao início do canvas"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        >
          <Crosshair size={14} />
        </Btn>
      </div>

      {(showToolOptions || showSelection) && (
        <div className="flex items-center gap-1 px-2 py-1" style={barStyle}>
          {showToolOptions && <ToolOptions tool={tool} />}
          {showToolOptions && showSelection && <Divider />}
          {showSelection && <SelectionActions count={selectionCount} />}
        </div>
      )}
    </div>
  );
}

/** Cor vale para caneta e texto; espessura só para a caneta. */
function ToolOptions({ tool }: { tool: CanvasTool }) {
  const drawColor = useCanvasStore((s) => s.drawColor);
  const setDrawColor = useCanvasStore((s) => s.setDrawColor);
  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const setDrawWidth = useCanvasStore((s) => s.setDrawWidth);

  return (
    <>
      <div className="flex items-center gap-1 px-0.5">
        {DRAW_COLORS.map((c) => (
          <button
            key={c.value || "auto"}
            title={c.value ? c.label : "Auto — acompanha o tema"}
            aria-label={`Cor ${c.label}`}
            aria-pressed={drawColor === c.value}
            onClick={() => setDrawColor(c.value)}
            style={{
              background:
                c.value ||
                "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
              borderColor:
                drawColor === c.value ? "var(--text-primary)" : "var(--border)",
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
          <div className="flex items-center gap-1.5 px-1">
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                title={`Traço de ${w}px`}
                aria-label={`Traço de ${w}px`}
                aria-pressed={drawWidth === w}
                onClick={() => setDrawWidth(w)}
                className={clsx(
                  "rounded-full transition-opacity",
                  drawWidth === w
                    ? "opacity-100"
                    : "opacity-40 hover:opacity-70",
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
    </>
  );
}

function SelectionActions({ count }: { count: number }) {
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const bringSelectionToFront = useCanvasStore((s) => s.bringSelectionToFront);
  const sendSelectionToBack = useCanvasStore((s) => s.sendSelectionToBack);
  const removeSelected = useCanvasStore((s) => s.removeSelected);

  return (
    <>
      <span
        className="px-1 text-[0.7rem] tabular-nums"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {count === 1 ? "1 item" : `${count} itens`}
      </span>
      <Btn title="Duplicar (Ctrl+D)" onClick={duplicateSelected}>
        <CopyPlus size={14} />
      </Btn>
      <Btn title="Trazer para frente" onClick={bringSelectionToFront}>
        <BringToFront size={14} />
      </Btn>
      <Btn title="Enviar para trás" onClick={sendSelectionToBack}>
        <SendToBack size={14} />
      </Btn>
      <Btn title="Excluir (Del)" danger onClick={removeSelected}>
        <Trash2 size={14} />
      </Btn>
    </>
  );
}

function Btn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={clsx(
        "solon-canvas-btn flex items-center gap-1 px-2 py-1",
        danger && "solon-canvas-btn--danger",
      )}
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
      className="solon-canvas-btn flex items-center justify-center w-8 h-7"
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-4 mx-0.5 flex-shrink-0"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
