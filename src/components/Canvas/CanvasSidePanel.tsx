import {
  Grid3X3,
  GripVertical,
  LocateFixed,
  PanelRightClose,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CANVAS_DRAW_WIDTHS,
  CANVAS_GRID_SIZES,
  CANVAS_TEXT_SIZES,
  useAppStore,
} from "../../store/useAppStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startDrag } from "../../lib/drag";
import { DRAW_COLORS } from "../../types/canvas";

const PANEL_W = 236;
const PANEL_STORAGE_KEY = "solon:canvasSidePanelPosition";
const COLLAPSED_STORAGE_KEY = "solon:canvasSidePanelCollapsed";

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

/** Recolhido por padrão: o canvas abre inteiro e o painel entra sob demanda. */
function loadCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Ajustes do canvas: grade e os valores usados por caneta, seta e texto.
 *
 * Zoom, enquadramento e ações de seleção ficam só na toolbar — este painel
 * já os repetia botão a botão, e dois lugares para o mesmo controle é um
 * lugar a mais para eles divergirem.
 */
export function CanvasSidePanel() {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [position, setPosition] = useState<PanelPosition | null>(() =>
    loadPosition(),
  );
  const panelRef = useRef<HTMLElement | null>(null);

  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const drawColor = useCanvasStore((s) => s.drawColor);
  const setDrawColor = useCanvasStore((s) => s.setDrawColor);
  const selectionCount = useCanvasStore(
    (s) => s.selectedIds.size || (s.selectedId ? 1 : 0),
  );

  const canvasGridEnabled = useAppStore((s) => s.canvasGridEnabled);
  const setCanvasGridEnabled = useAppStore((s) => s.setCanvasGridEnabled);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const setCanvasSnapToGrid = useAppStore((s) => s.setCanvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const setCanvasGridSize = useAppStore((s) => s.setCanvasGridSize);
  const canvasDefaultTextSize = useAppStore((s) => s.canvasDefaultTextSize);
  const setCanvasDefaultTextSize = useAppStore((s) => s.setCanvasDefaultTextSize);
  const canvasDefaultDrawWidth = useAppStore((s) => s.canvasDefaultDrawWidth);
  const setCanvasDefaultDrawWidth = useAppStore(
    (s) => s.setCanvasDefaultDrawWidth,
  );
  const setCanvasDefaultColor = useAppStore((s) => s.setCanvasDefaultColor);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // Sem localStorage o painel apenas não lembra o estado entre sessões.
    }
  }, [collapsed]);

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
    const positionAt = (ev: MouseEvent) =>
      clampPosition(
        {
          x: orig.x + ev.clientX - orig.clientX,
          y: orig.y + ev.clientY - orig.clientY,
        },
        width,
      );

    startDrag({
      onMove: (ev) => setPosition(positionAt(ev)),
      onEnd: (ev) => {
        const next = positionAt(ev);
        setPosition(next);
        savePosition(next);
      },
      onCancel: () => {
        setPosition(position);
      },
    });
  };

  const resetPanelPosition = () => {
    setPosition(null);
    savePosition(null);
  };

  /**
   * Os três controles abaixo gravam o padrão para novos itens e, quando há
   * um item compatível selecionado, também o repintam. Daí o rótulo da
   * seção mudar conforme a seleção.
   */
  const applyWidth = (width: number) => {
    setCanvasDefaultDrawWidth(width);
    const s = useCanvasStore.getState();
    s.setDrawWidth(width);
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

  if (collapsed) {
    return (
      <button
        ref={(node) => {
          panelRef.current = node;
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setCollapsed(false)}
        title="Ajustes do canvas"
        aria-label="Ajustes do canvas"
        aria-expanded={false}
        className="solon-canvas-btn solon-canvas-btn--outline absolute z-20 h-9 w-9 flex items-center justify-center"
        style={{
          ...floatingStyle,
          background: "var(--bg-panel)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <SlidersHorizontal size={15} />
      </button>
    );
  }

  const scope = selectionCount === 1 ? "selection" : "default";

  return (
    <aside
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute z-20 px-3 py-3 flex flex-col gap-3.5"
      style={{
        ...floatingStyle,
        width: PANEL_W,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex items-center gap-1 -mx-3 -mt-3 px-2 py-2"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <button
          onMouseDown={(e) => startPanelDrag(e)}
          title="Mover painel"
          aria-label="Mover painel"
          className="solon-canvas-btn h-7 w-7 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <div className="flex-1 text-center">
          <span className="solon-plaque">Ajustes</span>
        </div>
        <button
          onClick={resetPanelPosition}
          title="Voltar o painel para o canto"
          aria-label="Voltar o painel para o canto"
          className="solon-canvas-btn h-7 w-7 flex items-center justify-center"
        >
          <LocateFixed size={13} />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          title="Recolher ajustes"
          aria-label="Recolher ajustes"
          aria-expanded
          className="solon-canvas-btn h-7 w-7 flex items-center justify-center"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <PanelSection title="Grade">
        <div className="flex items-center justify-between gap-2">
          <Toggle
            icon={<Grid3X3 size={12} />}
            label="Mostrar"
            checked={canvasGridEnabled}
            onChange={setCanvasGridEnabled}
          />
          <Toggle
            label="Alinhar"
            checked={canvasSnapToGrid}
            onChange={setCanvasSnapToGrid}
          />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_GRID_SIZES.map((size) => (
            <SmallChoice
              key={size}
              active={canvasGridSize === size}
              label={`Grade de ${size} pixels`}
              onClick={() => setCanvasGridSize(size)}
            >
              {size}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        title="Cor"
        note={scope === "selection" ? "aplica ao item selecionado" : undefined}
      >
        <div className="flex items-center gap-1.5">
          {DRAW_COLORS.map((color) => (
            <button
              key={color.value || "auto"}
              title={color.value ? color.label : "Auto — acompanha o tema"}
              aria-label={`Cor ${color.label}`}
              aria-pressed={drawColor === color.value}
              onClick={() => applyColor(color.value)}
              className="h-5 w-5 rounded-full transition-transform"
              style={{
                background:
                  color.value ||
                  "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
                border:
                  drawColor === color.value
                    ? "2px solid var(--text-primary)"
                    : "1px solid var(--border)",
                transform: drawColor === color.value ? "scale(1.08)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        title="Traço e seta"
        note={scope === "selection" ? "aplica ao item selecionado" : undefined}
      >
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_DRAW_WIDTHS.map((width) => (
            <SmallChoice
              key={width}
              active={drawWidth === width || canvasDefaultDrawWidth === width}
              label={`Traço de ${width} pixels`}
              onClick={() => applyWidth(width)}
            >
              {width}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        title="Texto"
        note={scope === "selection" ? "aplica ao item selecionado" : undefined}
      >
        <div className="grid grid-cols-4 gap-1">
          {CANVAS_TEXT_SIZES.map((size) => (
            <SmallChoice
              key={size}
              active={canvasDefaultTextSize === size}
              label={`Texto de ${size} pixels`}
              onClick={() => applyTextSize(size)}
            >
              {size}
            </SmallChoice>
          ))}
        </div>
      </PanelSection>
    </aside>
  );
}

function PanelSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="solon-caps--sm">{title}</span>
        {note && (
          <span
            className="text-[0.62rem] italic truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function SmallChoice({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="px-2 py-1 transition-colors tabular-nums"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.7rem",
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
      className="inline-flex items-center gap-1.5"
      style={{
        color: checked ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: "var(--font-ui)",
        fontSize: "0.74rem",
      }}
    >
      {icon}
      <span
        className="relative inline-block transition-colors"
        style={{
          width: 26,
          height: 15,
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--accent)" : "var(--border-strong)",
        }}
        aria-hidden
      >
        <span
          className="absolute transition-transform"
          style={{
            top: 2,
            left: 2,
            width: 11,
            height: 11,
            borderRadius: "var(--radius-pill)",
            background: "var(--bg-panel)",
            transform: checked ? "translateX(11px)" : "translateX(0)",
          }}
        />
      </span>
      {label}
    </button>
  );
}
