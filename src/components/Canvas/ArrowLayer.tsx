import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { startDrag } from "../../lib/drag";
import { CanvasText, CardSide } from "../../types/canvas";
import { strokeRect, textRect } from "../../lib/canvasGeom";

// Re-export local com nome curto pra usar nos rects do componente sem
// poluir o escopo principal com `textRect` do canvasGeom.
const textRectInline = (t: CanvasText) => textRect(t);

/**
 * SVG overlay com as arrows entre cards.
 *
 * Renderizado *dentro* do mesmo container transformado dos cards, para
 * que a escala/translate do viewport se aplique automaticamente.
 *
 * Roteamento estilo Miro/Excalidraw:
 *  - cada ponta se conecta no **midpoint do lado cardinal** do card (top,
 *    right, bottom, left) escolhido pelo eixo dominante entre os centros;
 *  - a curva é um *cubic bezier* com control points **extrudados
 *    perpendicularmente** ao lado de ancoragem — o resultado entra/sai
 *    do card em 90° e cria um arco natural mesmo sem o usuário dobrar a
 *    flecha manualmente;
 *  - `a.bend` desloca ambos os control points, arrastando o midpoint da
 *    curva (handle grab sobre a curva). Duplo clique reseta.
 *
 * Antes era um quadratic bezier reta-por-default saindo do edge-intersect
 * entre centros — somia quando os cards se sobrepunham e não dava
 * sensação de direção.
 */
export const ArrowLayer = memo(function ArrowLayer({
  worldWidth,
  worldHeight,
  frozenPreviewPoint,
}: {
  worldWidth: number;
  worldHeight: number;
  frozenPreviewPoint?: { x: number; y: number } | null;
}) {
  const cards = useCanvasStore((s) => s.cards);
  const arrows = useCanvasStore((s) => s.arrows);
  const texts = useCanvasStore((s) => s.texts);
  const strokes = useCanvasStore((s) => s.strokes);
  const images = useCanvasStore((s) => s.images);
  const removeArrow = useCanvasStore((s) => s.removeArrow);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const select = useCanvasStore((s) => s.select);
  const toggleInSelection = useCanvasStore((s) => s.toggleInSelection);
  const setArrowBend = useCanvasStore((s) => s.setArrowBend);
  const viewport = useCanvasStore((s) => s.viewport);
  const tool = useCanvasStore((s) => s.tool);
  const linkingFromId = useCanvasStore((s) => s.linkingFromId);
  const linkingFromSide = useCanvasStore((s) => s.linkingFromSide);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  // Mapa de id → Rect cobrindo cards, texts e images. Antes a gente
  // mapeava so cards, entao setas com endpoint em texto/imagem viravam
  // null e desapareciam silenciosamente. `getEntityRect` resolve por
  // tipo na hora — aqui pre-construimos o mapa pra evitar O(n) por
  // arrow no render.
  const rectById = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const c of cards) map.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h });
    for (const im of images) map.set(im.id, { x: im.x, y: im.y, w: im.w, h: im.h });
    for (const t of texts) map.set(t.id, textRectInline(t));
    for (const st of strokes) {
      const rect = strokeRect(st);
      if (rect) map.set(st.id, rect);
    }
    return map;
  }, [cards, editorFontFamily, images, strokes, texts]);

  // Preview pointilhado enquanto o usuário está "linkando" — sai do card
  // de origem até o cursor. Sem isso o usuário clica e vai cego até o
  // destino sem feedback de pra onde a seta vai.
  //
  // Atualiza direto no pointermove, mas ignora deslocamento sub-pixel em world
  // coords. O rAF anterior economizava render, mas introduzia atraso visível
  // ao arrastar a ponta da seta.
  const [previewWorld, setPreviewWorld] = useState<
    { x: number; y: number } | null
  >(null);
  useEffect(() => {
    if (!linkingFromId) {
      setPreviewWorld(null);
      return;
    }
    if (frozenPreviewPoint) return;

    let frame: number | null = null;
    let last: { x: number; y: number } | null = null;
    let pending: { x: number; y: number } | null = null;

    const commitPreview = (next: { x: number; y: number }) => {
      last = next;
      setPreviewWorld(next);
    };
    const flushPreview = () => {
      frame = null;
      if (!pending) return;
      commitPreview(pending);
      pending = null;
    };
    const surface = document.querySelector(".canvas-surface") as HTMLElement | null;
    if (!surface) return;
    const surfaceRect = surface.getBoundingClientRect();

    const onMove = (e: PointerEvent) => {
      const { viewport: vp } = useCanvasStore.getState();
      const next = {
        x: (e.clientX - surfaceRect.left - vp.x) / vp.zoom,
        y: (e.clientY - surfaceRect.top - vp.y) / vp.zoom,
      };
      if (last && Math.hypot(next.x - last.x, next.y - last.y) < 0.75 / vp.zoom) {
        return;
      }
      pending = next;
      if (!last) {
        flushPreview();
        return;
      }
      if (frame == null) frame = requestAnimationFrame(flushPreview);
    };
    document.addEventListener("pointermove", onMove);
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
    };
  }, [frozenPreviewPoint, linkingFromId]);
  const effectivePreviewWorld = frozenPreviewPoint ?? previewWorld;
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origDx: number;
    origDy: number;
  } | null>(null);

  const onBendMouseDown = (
    e: React.MouseEvent,
    args: { id: string; origDx: number; origDy: number },
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const orig = {
      id: args.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origDx: args.origDx,
      origDy: args.origDy,
    };
    dragRef.current = orig;
    let frame: number | null = null;
    let pendingBend: { dx: number; dy: number } | null = null;
    const flushBend = () => {
      frame = null;
      if (!pendingBend) return;
      setArrowBend(orig.id, pendingBend);
      pendingBend = null;
    };
    const scheduleBend = (bend: { dx: number; dy: number }) => {
      pendingBend = bend;
      if (frame == null) frame = requestAnimationFrame(flushBend);
    };
    const cancelBendFrame = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      pendingBend = null;
    };

    startDrag({
      onMove: (ev) => {
        if (!dragRef.current) return;
        const z = useCanvasStore.getState().viewport.zoom;
        const dxScreen = ev.clientX - orig.startClientX;
        const dyScreen = ev.clientY - orig.startClientY;
        scheduleBend({
          dx: orig.origDx + dxScreen / z,
          dy: orig.origDy + dyScreen / z,
        });
      },
      onEnd: (ev) => {
        cancelBendFrame();
        const z = useCanvasStore.getState().viewport.zoom;
        const dxScreen = ev.clientX - orig.startClientX;
        const dyScreen = ev.clientY - orig.startClientY;
        setArrowBend(orig.id, {
          dx: orig.origDx + dxScreen / z,
          dy: orig.origDy + dyScreen / z,
        });
        dragRef.current = null;
      },
      onCancel: () => {
        cancelBendFrame();
        dragRef.current = null;
        // Reverte o bend pra posição original ao abortar
        setArrowBend(
          orig.id,
          orig.origDx === 0 && orig.origDy === 0
            ? null
            : { dx: orig.origDx, dy: orig.origDy },
        );
      },
    });
  };

  // Larguras em world coords: dividimos por zoom pra manter o traço com
  // espessura visual constante, independente de pan/zoom. Sem isso, em
  // zoom-out (<1), 1.5 world px vira sub-pixel e a arrow some.
  const zoom = viewport.zoom || 1;
  const baseStroke = 2 / zoom;
  const hitStroke = 16 / zoom;
  const handleR = 6 / zoom;
  const handleStroke = 1.5 / zoom;

  return (
    <svg
      width={worldWidth}
      height={worldHeight}
      overflow="visible"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        overflow: "visible",
        // currentColor propaga pros paths/markers sem hardcodar tema.
        color: "var(--text-secondary)",
      }}
    >
      <defs>
        {/* Marker size em strokeWidth units. 8×8 dá uma cabeça proeminente
            mesmo com stroke fino (2px). refX=9 encosta a ponta no endpoint. */}
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
        <marker
          id="arrowhead-selected"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          {/* SVG paint attrs não resolvem var() — usar style prop. */}
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: "var(--accent)" }} />
        </marker>
      </defs>

      {arrows.map((a) => {
        const from = rectById.get(a.from);
        const to = rectById.get(a.to);
        if (!from || !to) return null;
        const isSel = selectedId === a.id;
        // Grupo: seta capturada por marquee (ambos os cards endpoint dentro)
        // mas nao e primary. Sem esse visual, setas em multi-selecao ficavam
        // invisiveis ao olho — usuario nao sabia que Delete iria apaga-las.
        const isInGroup = !isSel && selectedIds.has(a.id);

        const { p1, cp1, cp2, p2 } = routeArrow(from, to, a.bend, {
          fromSide: a.fromSide,
          toSide: a.toSide,
        });
        const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;

        const arrowStroke = Math.max(1, a.width ?? 2) / zoom;
        const selectedStroke = Math.max(arrowStroke + 0.75 / zoom, 2.5 / zoom);

        // Ponto médio da cubic bezier (t=0.5):
        // B(0.5) = 0.125·P0 + 0.375·P1 + 0.375·P2 + 0.125·P3
        const handleX =
          0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x;
        const handleY =
          0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y;

        return (
          <g
            key={a.id}
            style={{
              pointerEvents:
                tool === "select" || tool === "eraser" ? "auto" : "none",
            }}
          >
            {/* Hit area invisível */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={hitStroke}
              fill="none"
              style={{ cursor: tool === "eraser" ? "cell" : "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === "eraser") {
                  removeArrow(a.id);
                  return;
                }
                if (e.ctrlKey || e.metaKey) {
                  toggleInSelection(a.id);
                  return;
                }
                select(a.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeArrow(a.id);
              }}
            />
            <path
              d={d}
              strokeWidth={isSel ? selectedStroke : arrowStroke}
              strokeLinecap="round"
              fill="none"
              markerEnd={`url(#${isSel ? "arrowhead-selected" : "arrowhead"})`}
              style={{
                pointerEvents: "none",
                stroke: isSel
                  ? "var(--accent)"
                  : isInGroup
                  ? "var(--selection-ring)"
                  : "currentColor",
                strokeDasharray: isInGroup ? "5 3" : undefined,
              }}
            />

            {/* Handle de bend quando selecionado */}
            {isSel && (
              <circle
                cx={handleX}
                cy={handleY}
                r={handleR}
                strokeWidth={handleStroke}
                style={{
                  cursor: "grab",
                  fill: "var(--bg-panel)",
                  stroke: "var(--accent)",
                }}
                onMouseDown={(e) =>
                  onBendMouseDown(e, {
                    id: a.id,
                    origDx: a.bend?.dx ?? 0,
                    origDy: a.bend?.dy ?? 0,
                  })
                }
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setArrowBend(a.id, null);
                }}
              >
                <title>Arraste para encurvar · duplo clique para resetar</title>
              </circle>
            )}
          </g>
        );
      })}

      {/* Preview tracejado durante linking. Ancora no lado cardinal da
          origem virado pro cursor e extruda o primeiro control point pra
          manter o mesmo "look" da seta final. */}
      {linkingFromId &&
        effectivePreviewWorld &&
        (() => {
          const src = rectById.get(linkingFromId);
          if (!src) return null;
          const { p1, cp1, cp2, p2 } = routeArrowToPoint(
            src,
            effectivePreviewWorld,
            linkingFromSide ?? undefined,
          );
          const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;
          const dash = 8 / zoom;
          return (
            <path
              d={d}
              fill="none"
              strokeWidth={baseStroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${dash * 0.6}`}
              markerEnd="url(#arrowhead-selected)"
              style={{
                pointerEvents: "none",
                stroke: "var(--accent)",
                opacity: 0.7,
              }}
            />
          );
        })()}
    </svg>
  );
});

// ---------------- roteamento -----------------

type Rect = { x: number; y: number; w: number; h: number };
type Side = CardSide;

/**
 * Qual lado de `r` "encara" o centro de `other`. Compara delta CRU
 * (sem normalizacao) — se o other esta mais a' direita do que abaixo,
 * conecta pelo lado direito.
 *
 * Antes a gente normalizava por meia-largura/altura, o que invertia a
 * intuicao em cards retangulares: pra um card 220x120, half-w=110 e
 * half-h=60. Target 50px direito + 50px baixo dava nx=0.45, ny=0.83 →
 * |ny|>|nx| → escolhia bottom. Bug clasico: usuario puxava horizontal
 * e a flecha desviava pra baixo do alvo.
 *
 * Com delta cru (dx, dy), o mesmo target da' dx=dy=50 → escolhe right
 * (>= prefere horizontal). Comportamento intuitivo.
 */
function sideFacing(r: Rect, other: Rect): Side {
  const rcx = r.x + r.w / 2;
  const rcy = r.y + r.h / 2;
  const ocx = other.x + other.w / 2;
  const ocy = other.y + other.h / 2;
  const dx = ocx - rcx;
  const dy = ocy - rcy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function sidePoint(r: Rect, side: Side) {
  switch (side) {
    case "top":
      return { x: r.x + r.w / 2, y: r.y };
    case "bottom":
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case "left":
      return { x: r.x, y: r.y + r.h / 2 };
    case "right":
      return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
}

function extrude(p: { x: number; y: number }, side: Side, len: number) {
  switch (side) {
    case "top":
      return { x: p.x, y: p.y - len };
    case "bottom":
      return { x: p.x, y: p.y + len };
    case "left":
      return { x: p.x - len, y: p.y };
    case "right":
      return { x: p.x + len, y: p.y };
  }
}

/**
 * Calcula endpoints + control points para o cubic bezier da flecha.
 *
 * `bend` (quando presente) desloca igualmente os dois control points,
 * puxando o midpoint da curva pro lado que o usuário arrastou.
 *
 * `overrides.fromSide`/`toSide` forçam o lado de ancoragem explicitamente
 * (setado quando o usuário clica num dos 4 pontos de conexão do card).
 * Sem override, cai no auto-pick por `sideFacing`.
 */
function routeArrow(
  from: Rect,
  to: Rect,
  bend?: { dx: number; dy: number } | null,
  overrides?: { fromSide?: Side; toSide?: Side },
) {
  const fromSide = overrides?.fromSide ?? sideFacing(from, to);
  const toSide = overrides?.toSide ?? sideFacing(to, from);

  const p1 = sidePoint(from, fromSide);
  const p2 = sidePoint(to, toSide);

  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  // Distância de extrusão: 40% da reta, com piso (cards próximos ainda
  // precisam de curvatura) e teto (evita loops gigantes em arrows longas).
  const outLen = Math.min(180, Math.max(40, dist * 0.4));

  const cp1 = extrude(p1, fromSide, outLen);
  const cp2 = extrude(p2, toSide, outLen);

  if (bend) {
    cp1.x += bend.dx;
    cp1.y += bend.dy;
    cp2.x += bend.dx;
    cp2.y += bend.dy;
  }

  return { p1, cp1, cp2, p2 };
}

/**
 * Versão pra preview de linking: destino é um ponto (cursor) em vez de um
 * card. cp1 extruda do lado cardinal da origem; cp2 fica "sugado" pro
 * cursor, dando uma entrada relativamente perpendicular.
 *
 * `overrideFromSide` força o lado de saída (quando o usuário já clicou num
 * ponto específico de conexão na origem). Sem override, calcula pelo
 * vetor origem→cursor.
 */
function routeArrowToPoint(
  from: Rect,
  target: { x: number; y: number },
  overrideFromSide?: Side,
) {
  let fromSide: Side;
  if (overrideFromSide) {
    fromSide = overrideFromSide;
  } else {
    // Mesmo principio do `sideFacing`: delta CRU (sem normalizar por
    // meia-dimensao). Drag pro lado direito do card → sai pelo lado
    // direito. Antes normalizavamos e em cards largos a flecha desviava
    // pra cima/baixo mesmo quando o cursor estava lateral.
    const fcx = from.x + from.w / 2;
    const fcy = from.y + from.h / 2;
    const dx = target.x - fcx;
    const dy = target.y - fcy;
    fromSide =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? "right"
          : "left"
        : dy >= 0
        ? "bottom"
        : "top";
  }

  const p1 = sidePoint(from, fromSide);
  const p2 = { x: target.x, y: target.y };
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const outLen = Math.min(180, Math.max(40, dist * 0.4));
  const cp1 = extrude(p1, fromSide, outLen);
  // Puxa cp2 um pouco em direção ao cp1 — sem isso a entrada no cursor
  // fica reta e perde o "peso" da curva.
  const cp2 = {
    x: p2.x + (cp1.x - p2.x) * 0.3,
    y: p2.y + (cp1.y - p2.y) * 0.3,
  };
  return { p1, cp1, cp2, p2 };
}
