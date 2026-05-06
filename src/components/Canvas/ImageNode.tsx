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

type ResizeDir = "nw" | "ne" | "se" | "sw";

const RESIZE_HANDLES: { dir: ResizeDir; cursor: string }[] = [
  { dir: "nw", cursor: "nwse-resize" },
  { dir: "ne", cursor: "nesw-resize" },
  { dir: "se", cursor: "nwse-resize" },
  { dir: "sw", cursor: "nesw-resize" },
];

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
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
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
  const snap = (value: number) =>
    canvasSnapToGrid
      ? Math.round(value / canvasGridSize) * canvasGridSize
      : value;

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
        updateImage(image.id, {
          x: snap(orig.origX + dx),
          y: snap(orig.origY + dy),
        });
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

  const onResizeDown = (dir: ResizeDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    const origW = image.w;
    const origH = image.h;
    const aspect = origW / origH;
    startDrag({
      onMove: (ev) => {
        const dx = (ev.clientX - startX) / viewport.zoom;
        const dy = (ev.clientY - startY) / viewport.zoom;
        const signX = dir.includes("e") ? 1 : -1;
        const signY = dir.includes("s") ? 1 : -1;
        // Mantém aspect ratio
        const delta = Math.abs(dx) > Math.abs(dy) * aspect
          ? signX * dx
          : signY * dy * aspect;
        const w = Math.max(40, origW + delta);
        const h = Math.max(40, w / aspect);
        updateImage(image.id, {
          x: dir.includes("w") ? origX + origW - w : origX,
          y: dir.includes("n") ? origY + origH - h : origY,
          w,
          h,
        });
      },
      onCancel: () => {
        updateImage(image.id, { x: origX, y: origY, w: origW, h: origH });
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
          onMouseDown={(e) => onResizeDown("se", e)}
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
      {isSelected &&
        RESIZE_HANDLES.filter((handle) => handle.dir !== "se").map((handle) => (
          <ImageResizeHandle
            key={handle.dir}
            dir={handle.dir}
            cursor={handle.cursor}
            zoom={viewport.zoom}
            onMouseDown={(e) => onResizeDown(handle.dir, e)}
          />
        ))}
    </div>
  );
}

function ImageResizeHandle({
  dir,
  cursor,
  zoom,
  onMouseDown,
}: {
  dir: ResizeDir;
  cursor: string;
  zoom: number;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const size = 9 / zoom;
  const half = size / 2;
  const style: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: 999,
    background: "var(--accent)",
    border: `${1 / zoom}px solid var(--bg-panel)`,
    boxShadow: "var(--shadow-sm)",
    cursor,
  };
  if (dir.includes("n")) style.top = -half;
  if (dir.includes("s")) style.bottom = -half;
  if (dir.includes("w")) style.left = -half;
  if (dir.includes("e")) style.right = -half;
  return <div data-image-action onMouseDown={onMouseDown} style={style} />;
}
