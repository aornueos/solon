import { useEffect, useRef, useState } from "react";
import { CanvasText, DRAW_COLORS } from "../../types/canvas";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startDrag } from "../../lib/drag";
import { Trash2, Palette, Bold, Minus, Plus } from "lucide-react";
import clsx from "clsx";

interface Props {
  text: CanvasText;
  /** Força entrar em modo edição logo após criação (click-to-place). */
  autoEdit?: boolean;
}

/**
 * Texto cru flutuante (sem card). Renderizado em world coords.
 */
export function FloatingText({ text, autoEdit }: Props) {
  const {
    updateText,
    removeText,
    select,
    selectedId,
    selectedIds,
    snapshotSelection,
    translateSelection,
    viewport,
    tool,
  } = useCanvasStore();

  const isSelected = selectedId === text.id;
  const isInGroup = selectedId !== text.id && selectedIds.has(text.id);
  const [editing, setEditing] = useState(!!autoEdit);
  const [showPalette, setShowPalette] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!showPalette) return;
    const onClick = () => setShowPalette(false);
    const id = window.setTimeout(
      () => document.addEventListener("click", onClick, { once: true }),
      0,
    );
    return () => window.clearTimeout(id);
  }, [showPalette]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (editing) return;
    if (tool !== "select") return;
    if ((e.target as HTMLElement).closest("[data-text-action]")) return;

    e.stopPropagation();

    // Group drag: preserva a selecao multipla e translada tudo junto.
    // Mesmo padrao do Card.tsx — ver la pra detalhes.
    const currentIds = useCanvasStore.getState().selectedIds;
    const isGroupDrag = currentIds.size > 1 && currentIds.has(text.id);

    if (isGroupDrag) {
      const snapshot = snapshotSelection();
      const orig = { startX: e.clientX, startY: e.clientY };
      dragState.current = {
        startX: orig.startX,
        startY: orig.startY,
        origX: text.x,
        origY: text.y,
        moved: false,
      };
      startDrag({
        onMove: (ev) => {
          const dx = (ev.clientX - orig.startX) / viewport.zoom;
          const dy = (ev.clientY - orig.startY) / viewport.zoom;
          if (dragState.current && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
            dragState.current.moved = true;
          }
          translateSelection(snapshot, dx, dy);
        },
        onEnd: () => {
          dragState.current = null;
        },
        onCancel: () => {
          dragState.current = null;
          translateSelection(snapshot, 0, 0);
        },
      });
      return;
    }

    // Single-drag
    select(text.id);

    const orig = {
      startX: e.clientX,
      startY: e.clientY,
      origX: text.x,
      origY: text.y,
      moved: false,
    };
    dragState.current = orig;

    startDrag({
      onMove: (ev) => {
        if (!dragState.current) return;
        const dx = (ev.clientX - orig.startX) / viewport.zoom;
        const dy = (ev.clientY - orig.startY) / viewport.zoom;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragState.current.moved = true;
        updateText(text.id, { x: orig.origX + dx, y: orig.origY + dy });
      },
      onEnd: () => {
        dragState.current = null;
      },
      onCancel: () => {
        dragState.current = null;
        updateText(text.id, { x: orig.origX, y: orig.origY });
      },
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setEditing(true);
  };

  // Cor de render: vazio ("Auto") ou o legado "#2a2420" (Tinta sepia escuro
  // que era o default antigo) viram `var(--text-primary)` — assim canvases
  // criados em tema claro continuam legiveis ao trocar pra dark. Cores
  // deliberadas (sangue, indigo, marcador, floresta) sao preservadas porque
  // sao escolhas explicitas do usuario.
  const renderColor =
    !text.color || text.color === "#2a2420"
      ? "var(--text-primary)"
      : text.color;

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: text.x,
    top: text.y,
    color: renderColor,
    fontSize: text.size,
    fontWeight: text.bold ? 700 : 400,
    lineHeight: 1.25,
    fontFamily: "'EB Garamond', Georgia, serif",
    whiteSpace: "pre-wrap",
    minWidth: 40,
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={clsx(
        "group",
        tool === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
      style={{
        ...commonStyle,
        // Destaque visual pra selecao: primaria (outline solid) ou grupo
        // (outline dashed). Sem isso, FloatingText nao indicava visualmente
        // que foi capturado num marquee — o usuario so descobria ao tentar
        // arrastar.
        ...(isSelected
          ? {
              outline: "1px solid var(--selection-ring)",
              outlineOffset: "2px",
            }
          : isInGroup
          ? {
              outline: "1px dashed var(--selection-ring)",
              outlineOffset: "2px",
            }
          : null),
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={text.text}
          onChange={(e) => updateText(text.id, { text: e.target.value })}
          onBlur={() => {
            setEditing(false);
            if (!text.text.trim()) removeText(text.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              if (!text.text.trim()) removeText(text.id);
            }
            e.stopPropagation();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Digite…"
          style={{
            font: "inherit",
            color: "inherit",
            fontWeight: "inherit",
            lineHeight: "inherit",
            background: "transparent",
            border: "1px dashed var(--accent-2)",
            padding: "2px 4px",
            resize: "none",
            outline: "none",
            minWidth: 140,
            minHeight: text.size * 1.4,
            overflow: "hidden",
          }}
          rows={Math.max(1, text.text.split("\n").length)}
        />
      ) : (
        <span>
          {text.text || (
            <span className="italic opacity-50">(texto vazio)</span>
          )}
        </span>
      )}

      {/* Ações quando selecionado */}
      {isSelected && !editing && (
        <div
          data-text-action
          className="absolute left-0 flex items-center gap-0.5 rounded px-1 py-0.5"
          style={{
            top: -28 / viewport.zoom,
            transform: `scale(${1 / viewport.zoom})`,
            transformOrigin: "top left",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TinyBtn
            title="Cor"
            onClick={(e) => {
              e.stopPropagation();
              setShowPalette((v) => !v);
            }}
          >
            <Palette size={11} />
          </TinyBtn>
          <TinyBtn
            title="Negrito"
            active={text.bold}
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { bold: !text.bold });
            }}
          >
            <Bold size={11} />
          </TinyBtn>
          <TinyBtn
            title="Menor"
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { size: Math.max(10, text.size - 2) });
            }}
          >
            <Minus size={11} />
          </TinyBtn>
          <TinyBtn
            title="Maior"
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { size: Math.min(96, text.size + 2) });
            }}
          >
            <Plus size={11} />
          </TinyBtn>
          <div
            className="w-px h-3.5 mx-0.5"
            style={{ background: "var(--border-subtle)" }}
          />
          <TinyBtn
            title="Excluir"
            danger
            onClick={(e) => {
              e.stopPropagation();
              removeText(text.id);
            }}
          >
            <Trash2 size={11} />
          </TinyBtn>

          {showPalette && (
            <div
              className="absolute top-full left-0 mt-1 flex gap-1 rounded px-1.5 py-1"
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {DRAW_COLORS.map((c) => (
                <button
                  key={c.value || "auto"}
                  title={c.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateText(text.id, { color: c.value });
                    setShowPalette(false);
                  }}
                  style={{
                    // Swatch "Auto" (value vazio) usa um gradient diagonal
                    // light↔dark pra sinalizar "adapta ao tema" — sem isso
                    // o circulo ficaria transparente e o usuario nao
                    // identificaria a opcao.
                    background:
                      c.value ||
                      "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
                    border: "1px solid var(--border)",
                  }}
                  className="w-4 h-4 rounded-full hover:scale-110 transition-transform"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TinyBtn({
  children,
  onClick,
  title,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  // 3 estados — active (preenchido com accent-2), hover (danger ou neutro),
  // idle (transparente + text-muted). No light tema o accent-2 é âmbar
  // claro; no dark tema é âmbar saturado — ambos lêem como "ON".
  const bg = active
    ? "var(--accent-2)"
    : hovered
    ? danger
      ? "var(--danger)"
      : "var(--bg-hover)"
    : "transparent";
  const fg = active
    ? "var(--text-inverse)"
    : hovered
    ? danger
      ? "var(--text-inverse)"
      : "var(--text-secondary)"
    : "var(--text-muted)";
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="p-1 rounded transition-colors"
      style={{ background: bg, color: fg }}
    >
      {children}
    </button>
  );
}
