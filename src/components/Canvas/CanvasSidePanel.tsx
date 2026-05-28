import {
  CopyPlus,
  Crosshair,
  Grid3X3,
  GripVertical,
  LocateFixed,
  Maximize,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  CANVAS_DRAW_WIDTHS,
  CANVAS_GRID_SIZES,
  CANVAS_TEXT_SIZES,
  useAppStore,
} from "../../store/useAppStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startDrag } from "../../lib/drag";
import { strokeRect, textRect } from "../../lib/canvasGeom";
import { DRAW_COLORS } from "../../types/canvas";

const PANEL_W = 236;
const PANEL_STORAGE_KEY = "solon:canvasSidePanelPosition";

type PanelPosition = { x: number; y: number };

function loadPosition(): PanelPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function savePosition(pos: PanelPosition | null) {
  if (typeof window === "undefined") return;
  if (!pos) {
    localStorage.removeItem(PANEL_STORAGE_KEY);
    return;
  }
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(pos));
}

export function CanvasSidePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(() =>
    loadPosition(),
  );
  const panelRef = useRef<HTMLElement | null>(null);

  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const drawColor = useCanvasStore((s) => s.drawColor);
  const setDrawColor = useCanvasStore((s) => s.setDrawColor);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const cards = useCanvasStore((s) => s.cards);
  const texts = useCanvasStore((s) => s.texts);
  const images = useCanvasStore((s) => s.images);
  const strokes = useCanvasStore((s) => s.strokes);
  const viewport = useCanvasStore((s) => s.viewport);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const select = useCanvasStore((s) => s.select);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const removeSelected = useCanvasStore((s) => s.removeSelected);

  const canvasGridEnabled = useAppStore((s) => s.canvasGridEnabled);
  const setCanvasGridEnabled = useAppStore((s) => s.setCanvasGridEnabled);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const setCanvasSnapToGrid = useAppStore((s) => s.setCanvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const setCanvasGridSize = useAppStore((s) => s.setCanvasGridSize);
  const canvasDefaultTextSize = useAppStore((s) => s.canvasDefaultTextSize);
  const setCanvasDefaultTextSize = useAppStore((s) => s.setCanvasDefaultTextSize);
  const canvasDefaultDrawWidth = useAppStore((s) => s.canvasDefaultDrawWidth);
  const setCanvasDefaultDrawWidth = useAppStore((s) => s.setCanvasDefaultDrawWidth);
  const canvasDefaultColor = useAppStore((s) => s.canvasDefaultColor);
  const setCanvasDefaultColor = useAppStore((s) => s.setCanvasDefaultColor);

  const selectionCount = selectedIds.size || (selectedId ? 1 : 0);

  const floatingStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 12, top: 64 };

  const clampPosition = (next: PanelPosition, width = PANEL_W): PanelPosition => {
    const surface = panelRef.current?.closest(".canvas-surface") as HTMLElement | null;
    const rect = surface?.getBoundingClientRect();
    const maxX = Math.max(8, (rect?.width ?? window.innerWidth) - width - 8);
    const maxY = Math.max(8, (rect?.height ?? window.innerHeight) - 56);
    return {
      x: Math.max(8, Math.min(maxX, next.x)),
      y: Math.max(8, Math.min(maxY, next.y)),
    };
  };

  const startPanelDrag = (e: React.MouseEvent, width = PANEL_W) => {
    e.preventDefault();
    e.stopPropagation();
    const el = panelRef.current;
    const surface = el?.closest(".canvas-surface") as HTMLElement | null;
    const surfaceRect = surface?.getBoundingClientRect();
    const rect = el?.getBoundingClientRect();
    if (!rect || !surfaceRect) return;

    const orig = {
      x: rect.left - surfaceRect.left,
      y: rect.top - surfaceRect.top,
      clientX: e.clientX,
      clientY: e.clientY,
    };

    startDrag({
      onMove: (ev) => {
        const next = clampPosition(
          {
            x: orig.x + ev.clientX - orig.clientX,
            y: orig.y + ev.clientY - orig.clientY,
          },
          width,
        );
        setPosition(next);
      },
      onEnd: (ev) => {
        const next = clampPosition(
          {
            x: orig.x + ev.clientX - orig.clientX,
            y: orig.y + ev.clientY - orig.clientY,
          },
          width,
        );
        setPosition(next);
        savePosition(next);
      },
    });
  };

  const resetPanelPosition = () => {
    setPosition(null);
    savePosition(null);
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

  const applyColor = (color: string) => {
    setCanvasDefaultColor(color);
    setDrawColor(color);
    const s = useCanvasStore.getState();
    if (!s.selectedId) return;
    const kind = s.findSelectionKind(s.selectedId);
    if (kind !== "text" && kind !== "stroke") return;
    s.pushHistory();
    if (kind === "text") s.updateText(s.selectedId, { color });
    else s.updateStroke(s.selectedId, { color });
  };

  const getSurfaceRect = () => {
    const surface = panelRef.current?.closest(".canvas-surface") as HTMLElement | null;
    return surface?.getBoundingClientRect() ?? null;
  };

  const fitAll = () => {
    const strokeBoxes = strokes
      .map(strokeRect)
      .filter((box): box is { x: number; y: number; w: number; h: number } => !!box);
    const boxes = [
      ...cards,
      ...images,
      ...texts.map(textRect),
      ...strokeBoxes,
    ];
    if (boxes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const padding = 90;
    const rect = getSurfaceRect();
    const screenW = rect?.width ?? window.innerWidth;
    const screenH = rect?.height ?? window.innerHeight;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const zoom = Math.min(1.25, Math.max(0.15, Math.min(screenW / w, screenH / h)));
    setViewport({
      zoom,
      x: -(minX - padding) * zoom + (screenW - w * zoom) / 2,
      y: -(minY - padding) * zoom + (screenH - h * zoom) / 2,
    });
  };

  const zoomStep = (direction: 1 | -1) => {
    const rect = getSurfaceRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    zoomAt(cx, cy, direction * 200);
  };

  if (collapsed) {
    return (
      <button
        ref={(node) => {
          panelRef.current = node;
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setCollapsed(false)}
        title="Abrir ajustes do canvas"
        aria-label="Abrir ajustes do canvas"
        className="absolute z-20 h-9 w-9 flex items-center justify-center transition-colors"
        style={{
          ...floatingStyle,
          background: "var(--bg-panel)",
          border: "2px solid var(--border-strong)",
          borderRadius: 0,
          boxShadow: "var(--shadow-flat-sm)",
          color: "var(--text-secondary)",
        }}
      >
        <PanelRightOpen size={15} />
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute z-20 px-3 py-3 flex flex-col gap-3"
      style={{
        ...floatingStyle,
        width: PANEL_W,
        background: "var(--bg-panel)",
        border: "2px solid var(--border-strong)",
        borderRadius: 0,
        boxShadow: "var(--shadow-flat-sm)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 -mx-3 -mt-3 px-3 py-2"
        style={{ borderBottom: "2px solid var(--border-strong)" }}
      >
        <button
          onMouseDown={(e) => startPanelDrag(e)}
          title="Mover painel"
          aria-label="Mover painel"
          className="h-7 w-7 flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border-strong)",
            borderRadius: 0,
          }}
        >
          <GripVertical size={14} />
        </button>
        <div className="flex-1 text-center">
          <span className="solon-plaque">Canvas</span>
        </div>
        <button
          onClick={resetPanelPosition}
          title="Voltar para canto"
          aria-label="Voltar para canto"
          className="solon-dialog-close"
          style={{ width: 26, height: 26 }}
        >
          <LocateFixed size={13} />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          title="Recolher ajustes do canvas"
          aria-label="Recolher ajustes do canvas"
          className="solon-dialog-close"
          style={{ width: 26, height: 26 }}
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <PanelSection title="Vista">
        <div className="grid grid-cols-4 gap-1">
          <IconChoice title="Aproximar" onClick={() => zoomStep(-1)}>
            <ZoomIn size={13} />
          </IconChoice>
          <IconChoice title="Afastar" onClick={() => zoomStep(1)}>
            <ZoomOut size={13} />
          </IconChoice>
          <IconChoice title="Enquadrar tudo" onClick={fitAll}>
            <Maximize size={13} />
          </IconChoice>
          <IconChoice
            title="Resetar viewport"
            onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          >
            <Crosshair size={13} />
          </IconChoice>
        </div>
        <div
          className="tabular-nums text-center py-1"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text-primary)",
            border: "1.5px solid var(--border-strong)",
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
          }}
        >
          {Math.round(viewport.zoom * 100)}%
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

      <PanelSection title="Cor padrão">
        <div className="flex items-center gap-1.5">
          <Palette size={13} style={{ color: "var(--text-muted)" }} />
          <div className="flex items-center gap-1">
            {DRAW_COLORS.map((color) => {
              const active =
                drawColor === color.value || canvasDefaultColor === color.value;
              return (
                <button
                  key={color.value || "auto"}
                  title={color.label}
                  aria-label={`Cor ${color.label}`}
                  aria-pressed={active}
                  onClick={() => applyColor(color.value)}
                  className="h-5 w-5 rounded-full transition-transform"
                  style={{
                    background:
                      color.value ||
                      "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
                    border: active
                      ? "2px solid var(--text-primary)"
                      : "1px solid var(--border)",
                    transform: active ? "scale(1.08)" : "scale(1)",
                  }}
                />
              );
            })}
          </div>
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
      </PanelSection>

      {selectionCount > 0 && (
        <PanelSection title="Selecionado">
          <div className="grid grid-cols-3 gap-1">
            <IconChoice title="Duplicar seleção" onClick={duplicateSelected}>
              <CopyPlus size={13} />
            </IconChoice>
            <IconChoice title="Limpar seleção" onClick={() => select(null)}>
              <RotateCcw size={13} />
            </IconChoice>
            <IconChoice title="Excluir seleção" danger onClick={removeSelected}>
              <Trash2 size={13} />
            </IconChoice>
          </div>
          <span className="text-[0.66rem]" style={{ color: "var(--text-muted)" }}>
            Cor, linha e texto também aplicam ao item selecionado.
          </span>
        </PanelSection>
      )}
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
      <div>
        <span className="solon-caps--sm">{title}</span>
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
      aria-pressed={active}
      onClick={onClick}
      className="px-2 py-1 transition-colors tabular-nums"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: active
          ? "1.5px solid var(--accent)"
          : "1.5px solid var(--border-strong)",
        borderRadius: 0,
        fontFamily: "var(--font-mono)",
        fontSize: "0.7rem",
      }}
    >
      {children}
    </button>
  );
}

function IconChoice({
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
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-8 flex items-center justify-center transition-colors"
      style={{
        background: "transparent",
        color: danger ? "var(--danger)" : "var(--text-secondary)",
        border: "1.5px solid var(--border-strong)",
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? "var(--danger)"
          : "var(--bg-hover)";
        if (danger) e.currentTarget.style.color = "var(--text-inverse)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger
          ? "var(--danger)"
          : "var(--text-secondary)";
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
  // Toggle brutalist: caixa quadrada com ✓ quando ativo, em vez do
  // switch-track redondo. Mantem familia visual do app.
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-1.5"
      style={{
        color: checked ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: "var(--font-display)",
        fontSize: "0.74rem",
      }}
    >
      {icon}
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 14,
          height: 14,
          background: checked ? "var(--accent)" : "transparent",
          border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: 0,
          color: "var(--text-inverse)",
          fontSize: 10,
          lineHeight: 1,
        }}
        aria-hidden
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
