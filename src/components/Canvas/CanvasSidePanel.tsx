import {
  Grid3X3,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Type,
  Eraser,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import {
  CANVAS_DEFAULT_TOOLS,
  CANVAS_DRAW_WIDTHS,
  CANVAS_GRID_SIZES,
  CANVAS_TEXT_SIZES,
  useAppStore,
} from "../../store/useAppStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { CANVAS_TOOL_ORDER, CanvasTool } from "../../types/canvas";

const TOOL_ICON: Record<CanvasTool, React.ReactNode> = {
  select: <MousePointer2 size={13} />,
  arrow: <MoveUpRight size={13} />,
  draw: <Pencil size={13} />,
  text: <Type size={13} />,
  eraser: <Eraser size={13} />,
};

const TOOL_LABEL: Record<CanvasTool, string> = {
  select: "Selecionar",
  arrow: "Seta",
  draw: "Linha",
  text: "Texto",
  eraser: "Borracha",
};

export function CanvasSidePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const selectedId = useCanvasStore((s) => s.selectedId);

  const canvasGridEnabled = useAppStore((s) => s.canvasGridEnabled);
  const setCanvasGridEnabled = useAppStore((s) => s.setCanvasGridEnabled);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const setCanvasSnapToGrid = useAppStore((s) => s.setCanvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const setCanvasGridSize = useAppStore((s) => s.setCanvasGridSize);
  const canvasDefaultTool = useAppStore((s) => s.canvasDefaultTool);
  const setCanvasDefaultTool = useAppStore((s) => s.setCanvasDefaultTool);
  const canvasDefaultTextSize = useAppStore((s) => s.canvasDefaultTextSize);
  const setCanvasDefaultTextSize = useAppStore((s) => s.setCanvasDefaultTextSize);
  const canvasDefaultDrawWidth = useAppStore((s) => s.canvasDefaultDrawWidth);
  const setCanvasDefaultDrawWidth = useAppStore((s) => s.setCanvasDefaultDrawWidth);

  const chooseTool = (next: CanvasTool) => {
    setCanvasDefaultTool(next);
    setTool(next);
  };

  const applyWidth = (width: number) => {
    setCanvasDefaultDrawWidth(width);
    useCanvasStore.getState().setDrawWidth(width);
    const s = useCanvasStore.getState();
    if (!s.selectedId) return;
    const kind = s.findSelectionKind(s.selectedId);
    if (kind !== "arrow" && kind !== "stroke") return;
    s.pushHistory();
    if (kind === "arrow") s.updateArrow(s.selectedId, { width });
    else s.updateStroke(s.selectedId, { width });
  };

  const applyTextSize = (size: number) => {
    setCanvasDefaultTextSize(size);
    const s = useCanvasStore.getState();
    if (!s.selectedId || s.findSelectionKind(s.selectedId) !== "text") return;
    s.pushHistory();
    s.updateText(s.selectedId, { size, height: undefined });
  };

  if (collapsed) {
    return (
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setCollapsed(false)}
        title="Abrir ajustes do canvas"
        aria-label="Abrir ajustes do canvas"
        className="absolute right-3 top-16 z-20 h-9 w-9 rounded-lg shadow-md flex items-center justify-center transition-colors"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <PanelRightOpen size={15} />
      </button>
    );
  }

  return (
    <aside
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute right-3 top-16 z-20 w-56 rounded-lg shadow-md px-3 py-3 flex flex-col gap-3"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[0.6rem] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          Canvas
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Recolher ajustes do canvas"
          aria-label="Recolher ajustes do canvas"
          className="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text-muted)",
          }}
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <PanelSection title="Ferramenta">
        <div className="grid grid-cols-5 gap-1">
          {CANVAS_TOOL_ORDER.map((item, index) => (
            <button
              key={item}
              title={`${index + 1}. ${TOOL_LABEL[item]}`}
              aria-label={TOOL_LABEL[item]}
              aria-pressed={tool === item}
              onClick={() => chooseTool(item)}
              className="h-8 rounded-md flex items-center justify-center transition-colors"
              style={{
                background:
                  tool === item ? "var(--bg-inverse)" : "var(--bg-hover)",
                color:
                  tool === item ? "var(--text-inverse)" : "var(--text-secondary)",
              }}
            >
              {TOOL_ICON[item]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {CANVAS_DEFAULT_TOOLS.slice(0, 4).map((item) => (
            <SmallChoice
              key={item}
              active={canvasDefaultTool === item}
              onClick={() => setCanvasDefaultTool(item)}
            >
              {TOOL_LABEL[item]}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Grade">
        <div className="flex items-center justify-between gap-2">
          <Toggle
            icon={<Grid3X3 size={12} />}
            label="Grade"
            checked={canvasGridEnabled}
            onChange={setCanvasGridEnabled}
          />
          <Toggle
            label="Snap"
            checked={canvasSnapToGrid}
            onChange={setCanvasSnapToGrid}
          />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_GRID_SIZES.map((size) => (
            <SmallChoice
              key={size}
              active={canvasGridSize === size}
              onClick={() => setCanvasGridSize(size)}
            >
              {size}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Linha e seta">
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_DRAW_WIDTHS.map((width) => (
            <SmallChoice
              key={width}
              active={canvasDefaultDrawWidth === width || drawWidth === width}
              onClick={() => applyWidth(width)}
            >
              {width}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Texto">
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_TEXT_SIZES.map((size) => (
            <SmallChoice
              key={size}
              active={canvasDefaultTextSize === size}
              onClick={() => applyTextSize(size)}
            >
              {size}
            </SmallChoice>
          ))}
        </div>
        {selectedId && (
          <span className="text-[0.66rem]" style={{ color: "var(--text-muted)" }}>
            Aplica tambem ao item selecionado.
          </span>
        )}
      </PanelSection>
    </aside>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div
        className="text-[0.6rem] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function SmallChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2 py-1 text-[0.68rem] transition-colors"
      style={{
        background: active ? "var(--bg-active)" : "var(--bg-hover)",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("inline-flex items-center gap-1.5 text-[0.7rem]")}
      style={{ color: checked ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      {icon}
      <span
        className="w-7 h-4 rounded-full relative"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform"
          style={{
            background: "var(--bg-panel)",
            transform: checked ? "translateX(12px)" : "translateX(0)",
          }}
        />
      </span>
      {label}
    </button>
  );
}
