import { useEffect, useRef, useState } from "react";
import { CanvasImage } from "../../types/canvas";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { resolveImageUrl } from "../../lib/canvasImages";
import { startDrag } from "../../lib/drag";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

interface Props {
  image: CanvasImage;
}

export function ImageNode({ image }: Props) {
  const {
    updateImage,
    removeImage,
    select,
    selectedId,
    selectedIds,
    snapshotSelection,
    translateSelection,
    viewport,
    tool,
    linkingFromId,
    beginLink,
    completeLink,
    pushHistory,
  } = useCanvasStore();
  const rootFolder = useAppStore((s) => s.rootFolder);
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const isSelected = selectedId === image.id;
  const isInGroup = selectedId !== image.id && selectedIds.has(image.id);

  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setMissing(false);
    setUrl(null);
    (async () => {
      const u = await resolveImageUrl(rootFolder, image.src);
      if (!alive) return;
      if (!u) {
        setMissing(true);
        setUrl(null);
        return;
      }
      setMissing(false);
      setUrl(u);
    })();
    return () => {
      alive = false;
    };
  }, [rootFolder, image.src]);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-image-action]")) return;

    if (tool === "eraser") {
      e.stopPropagation();
      removeImage(image.id);
      return;
    }
    // Link em progresso (iniciado por outro card/texto/imagem via
    // botao Link2 ou em arrow tool) → completar aqui, independente
    // do tool atual. Sem isso, "card → imagem" falhava em select mode.
    if (linkingFromId && linkingFromId !== image.id) {
      e.stopPropagation();
      e.preventDefault();
      completeLink(image.id);
      return;
    }
    if (tool === "arrow") {
      e.stopPropagation();
      e.preventDefault();
      if (linkingFromId) completeLink(image.id);
      else beginLink(image.id);
      return;
    }
    if (tool !== "select") return;

    e.stopPropagation();

    // Group drag: preserva a selecao multipla e translada tudo junto.
    const currentIds = useCanvasStore.getState().selectedIds;
    const isGroupDrag = currentIds.size > 1 && currentIds.has(image.id);

    if (isGroupDrag) {
      const snapshot = snapshotSelection();
      const orig = { startX: e.clientX, startY: e.clientY };
      pushHistory();
      dragState.current = {
        startX: orig.startX,
        startY: orig.startY,
        origX: image.x,
        origY: image.y,
      };
      startDrag({
        onMove: (ev) => {
          const dx = (ev.clientX - orig.startX) / viewport.zoom;
          const dy = (ev.clientY - orig.startY) / viewport.zoom;
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
    select(image.id);
    pushHistory();

    const orig = {
      startX: e.clientX,
      startY: e.clientY,
      origX: image.x,
      origY: image.y,
    };
    dragState.current = orig;

    startDrag({
      onMove: (ev) => {
        if (!dragState.current) return;
        const dx = (ev.clientX - orig.startX) / viewport.zoom;
        const dy = (ev.clientY - orig.startY) / viewport.zoom;
        updateImage(image.id, { x: orig.origX + dx, y: orig.origY + dy });
      },
      onEnd: () => {
        dragState.current = null;
      },
      onCancel: () => {
        dragState.current = null;
        updateImage(image.id, { x: orig.origX, y: orig.origY });
      },
    });
  };

  const onResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    const startX = e.clientX;
    const origW = image.w;
    const origH = image.h;
    const aspect = origW / origH;
    startDrag({
      onMove: (ev) => {
        const dw = (ev.clientX - startX) / viewport.zoom;
        // Mantém aspect ratio
        const dh = dw / aspect;
        updateImage(image.id, {
          w: Math.max(40, origW + dw),
          h: Math.max(40, origH + dh),
        });
      },
      onCancel: () => {
        updateImage(image.id, { w: origW, h: origH });
      },
    });
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={clsx(
        "group",
        tool === "select"
          ? "cursor-grab active:cursor-grabbing"
          : tool === "eraser"
          ? "cursor-cell"
          : "cursor-default",
      )}
      style={{
        position: "absolute",
        left: image.x,
        top: image.y,
        width: image.w,
        height: image.h,
      }}
    >
      {missing ? (
        <div
          className="w-full h-full flex items-center justify-center italic text-xs rounded"
          style={{
            color: "var(--danger)",
            background: "var(--bg-panel-2)",
            border: "1px dashed var(--danger)",
          }}
        >
          Imagem não encontrada
        </div>
      ) : url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="w-full h-full object-contain rounded shadow-sm select-none"
          style={
            isSelected
              ? { outline: "2px solid var(--accent)" }
              : isInGroup
              ? { outline: "2px dashed var(--selection-ring)" }
              : undefined
          }
        />
      ) : (
        <div
          className="w-full h-full rounded animate-pulse"
          style={{ background: "var(--bg-hover)" }}
        />
      )}

      {isSelected && (
        <div
          data-image-action
          className="absolute flex gap-0.5 rounded px-1 py-0.5"
          style={{
            top: -28 / viewport.zoom,
            left: 0,
            transform: `scale(${1 / viewport.zoom})`,
            transformOrigin: "top left",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            title="Excluir"
            onClick={(e) => {
              e.stopPropagation();
              removeImage(image.id);
            }}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--danger)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-inverse)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {isSelected && (
        <div
          data-image-action
          onMouseDown={onResizeDown}
          className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
          style={{
            // Hachura diagonal usando a cor accent — stripes alternados
            // de accent/transparente via linear-gradient. Mantém a
            // affordance visual do canto de resize sem hardcode de hex.
            background:
              "repeating-linear-gradient(135deg, var(--accent) 0 2px, transparent 2px 4px)",
          }}
        />
      )}
    </div>
  );
}
