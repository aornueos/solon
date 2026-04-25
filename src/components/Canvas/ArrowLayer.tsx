import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startDrag } from "../../lib/drag";
import { CardSide } from "../../types/canvas";

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
export function ArrowLayer({
  worldWidth,
  worldHeight,
}: {
  worldWidth: number;
  worldHeight: number;
}) {
  const {
    cards,
    arrows,
    removeArrow,
    selectedId,
    selectedIds,
    select,
    setArrowBend,
    viewport,
    tool,
    linkingFromId,
    linkingFromSide,
  } = useCanvasStore();
  const byId = new Map(cards.map((c) => [c.id, c]));

  // Preview pointilhado enquanto o usuário está "linkando" — sai do card
  // de origem até o cursor. Sem isso o usuário clica e vai cego até o
  // destino sem feedback de pra onde a seta vai.
  //
  // Throttle via rAF: `mousemove` em Chromium moderno dispara ~500Hz em
  // mouses gamer; atualizar estado a essa taxa causa re-render inútil (o
  // monitor só redesenha a ~60-120Hz). Coalescemos via rAF pra 1 update
  // por frame.
  const [previewWorld, setPreviewWorld] = useState<
    { x: number; y: number } | null
  >(null);
  useEffect(() => {
    if (!linkingFromId) {
      setPreviewWorld(null);
      return;
    }
    let rafId: number | null = null;
    let pendingEvent: MouseEvent | null = null;

    const flush = () => {
      rafId = null;
      const e = pendingEvent;
      if (!e) return;
      pendingEvent = null;
      const surface = document.querySelector(
        ".canvas-surface",
      ) as HTMLElement | null;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const { viewport: vp } = useCanvasStore.getState();
      setPreviewWorld({
        x: (e.clientX - rect.left - vp.x) / vp.zoom,
        y: (e.clientY - rect.top - vp.y) / vp.zoom,
      });
    };

    const onMove = (e: MouseEvent) => {
      pendingEvent = e;
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [linkingFromId]);
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

    startDrag({
      onMove: (ev) => {
        if (!dragRef.current) return;
        const z = useCanvasStore.getState().viewport.zoom;
        const dxScreen = ev.clientX - orig.startClientX;
        const dyScreen = ev.clientY - orig.startClientY;
        setArrowBend(orig.id, {
          dx: orig.origDx + dxScreen / z,
          dy: orig.origDy + dyScreen / z,
        });
      },
      onEnd: () => {
        dragRef.current = null;
      },
      onCancel: () => {
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
  const selStroke = 2.5 / zoom;
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
        const from = byId.get(a.from);
        const to = byId.get(a.to);
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

        // Ponto médio da cubic bezier (t=0.5):
        // B(0.5) = 0.125·P0 + 0.375·P1 + 0.375·P2 + 0.125·P3
        const handleX =
          0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x;
        const handleY =
          0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y;

        return (
          <g
            key={a.id}
            style={{ pointerEvents: tool === "select" ? "auto" : "none" }}
          >
            {/* Hit area invisível */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={hitStroke}
              fill="none"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                select(a.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeArrow(a.id);
              }}
            />
            <path
              d={d}
              strokeWidth={isSel ? selStroke : baseStroke}
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
        previewWorld &&
        (() => {
          const src = byId.get(linkingFromId);
          if (!src) return null;
          const { p1, cp1, cp2, p2 } = routeArrowToPoint(
            src,
            previewWorld,
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
}

// ---------------- roteamento -----------------

type Rect = { x: number; y: number; w: number; h: number };
type Side = CardSide;

/**
 * Qual lado de `r` "encara" o centro de `other`. Normalizado pelas
 * meia-dimensões para respeitar o aspecto (cards muito largos tendem a
 * conectar horizontalmente, muito altos verticalmente).
 */
function sideFacing(r: Rect, other: Rect): Side {
  const rcx = r.x + r.w / 2;
  const rcy = r.y + r.h / 2;
  const ocx = other.x + other.w / 2;
  const ocy = other.y + other.h / 2;
  const nx = (ocx - rcx) / (r.w / 2 || 1);
  const ny = (ocy - rcy) / (r.h / 2 || 1);
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? "right" : "left";
  return ny >= 0 ? "bottom" : "top";
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
    const fcx = from.x + from.w / 2;
    const fcy = from.y + from.h / 2;
    const nx = (target.x - fcx) / (from.w / 2 || 1);
    const ny = (target.y - fcy) / (from.h / 2 || 1);
    fromSide =
      Math.abs(nx) >= Math.abs(ny)
        ? nx >= 0
          ? "right"
          : "left"
        : ny >= 0
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
