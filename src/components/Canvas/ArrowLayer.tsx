import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { startDrag } from "../../lib/drag";
import { CardSide } from "../../types/canvas";
import { strokeRect, textRect } from "../../lib/canvasGeom";
import { isSelectionToggle } from "../../lib/canvasSelectionInput";

/**
 * Camada SVG com as setas entre os itens do canvas.
 *
 * Vive dentro do mesmo container transformado dos cards, então a escala e
 * o translate do viewport já se aplicam a ela.
 *
 * Roteamento:
 *  - cada ponta âncora no meio de um lado cardinal (topo, direita, base,
 *    esquerda), escolhido pelo eixo dominante entre os centros;
 *  - a curva é uma bézier cúbica com os pontos de controle extrudados
 *    perpendicularmente ao lado de ancoragem, de forma que a seta entra e
 *    sai em 90° e desenha um arco sem o usuário precisar curvá-la;
 *  - `bend` desloca os dois pontos de controle de uma vez, arrastando o
 *    meio da curva. Duplo clique no handle o zera.
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
  const zoom = useCanvasStore((s) => s.viewport.zoom || 1);
  const tool = useCanvasStore((s) => s.tool);
  const linkingFromId = useCanvasStore((s) => s.linkingFromId);
  const linkingFromSide = useCanvasStore((s) => s.linkingFromSide);
  // setArrowBend é usado pelo handler de drag (`onBendMouseDown` definido
  // aqui no top-level, passado como prop pro ArrowNode pra evitar
  // re-criar função por seta). Action refs são estáveis entre renders.
  const setArrowBend = useCanvasStore((s) => s.setArrowBend);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  // Mapa id → Rect de tudo que pode ser extremo de uma seta: card, texto,
  // imagem e traço. Pré-construído para não custar uma busca linear por
  // seta a cada render.
  const rectById = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const c of cards) map.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h });
    for (const im of images) map.set(im.id, { x: im.x, y: im.y, w: im.w, h: im.h });
    for (const t of texts) map.set(t.id, textRect(t));
    for (const st of strokes) {
      const rect = strokeRect(st);
      if (rect) map.set(st.id, rect);
    }
    return map;
  }, [cards, editorFontFamily, images, strokes, texts]);

  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origDx: number;
    origDy: number;
  } | null>(null);

  // Sem o useCallback este handler ganha identidade nova a cada render da
  // camada e invalida o memo de todos os ArrowNode. setArrowBend é uma ref
  // estável da store, então a identidade se mantém de fato.
  const onBendMouseDown = useCallback((
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
  }, [setArrowBend]);

  // Medidas em world coords divididas pelo zoom, para manter espessura e
  // alvo de clique constantes na tela: a 50%, 1,5 world px viram menos de
  // um pixel e a seta some.
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
        return (
          <ArrowNode
            key={a.id}
            arrow={a}
            from={from}
            to={to}
            zoom={zoom}
            tool={tool}
            hitStroke={hitStroke}
            handleR={handleR}
            handleStroke={handleStroke}
            onBendMouseDown={onBendMouseDown}
          />
        );
      })}

      {linkingFromId && (
        <LinkPreview
          sourceRect={rectById.get(linkingFromId)}
          fromSide={linkingFromSide}
          zoom={zoom}
          frozenPreviewPoint={frozenPreviewPoint}
        />
      )}
    </svg>
  );
});

/**
 * Prévia tracejada enquanto o usuário puxa uma seta. Vive fora da
 * ArrowLayer de propósito: o pointermove atualiza só este path, não a lista
 * inteira de setas. Ancora no lado escolhido em `fromSide` ou, sem ele, no
 * lado que encara o cursor.
 */
function LinkPreview({
  sourceRect,
  fromSide,
  zoom,
  frozenPreviewPoint,
}: {
  sourceRect: Rect | undefined;
  fromSide: Side | null;
  zoom: number;
  frozenPreviewPoint?: { x: number; y: number } | null;
}) {
  // O path é atualizado por setAttribute no pointermove, sem setState e
  // sem re-render por frame.
  const pathRef = useRef<SVGPathElement | null>(null);

  const buildD = useCallback(
    (target: { x: number; y: number } | null | undefined) => {
      if (!sourceRect || !target) return "";
      const { p1, cp1, cp2, p2 } = routeArrowToPoint(
        sourceRect,
        target,
        fromSide ?? undefined,
      );
      return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;
    },
    [sourceRect, fromSide],
  );

  useEffect(() => {
    // Com o menu de link-no-vazio aberto a prévia fica congelada.
    if (frozenPreviewPoint) return;
    const surface = document.querySelector(".canvas-surface") as HTMLElement | null;
    if (!surface) return;
    const surfaceRect = surface.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      const { viewport: vp } = useCanvasStore.getState();
      const target = {
        x: (e.clientX - surfaceRect.left - vp.x) / vp.zoom,
        y: (e.clientY - surfaceRect.top - vp.y) / vp.zoom,
      };
      const node = pathRef.current;
      if (node) node.setAttribute("d", buildD(target));
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [frozenPreviewPoint, buildD]);

  if (!sourceRect) return null;
  const dash = 8 / zoom;
  return (
    <path
      ref={pathRef}
      d={frozenPreviewPoint ? buildD(frozenPreviewPoint) : ""}
      fill="none"
      strokeWidth={2 / zoom}
      strokeLinecap="round"
      strokeDasharray={`${dash} ${dash * 0.6}`}
      markerEnd="url(#arrowhead-selected)"
      style={{ pointerEvents: "none", stroke: "var(--accent)", opacity: 0.7 }}
    />
  );
}

/**
 * Uma seta. Memoizada por (arrow, from, to, zoom, tool); mudanças de
 * seleção entram por seletores derivados booleanos, então selecionar uma
 * seta não recalcula a rota das outras.
 */
type ArrowNodeProps = {
  arrow: ReturnType<typeof useCanvasStore.getState>["arrows"][number];
  from: Rect;
  to: Rect;
  zoom: number;
  tool: ReturnType<typeof useCanvasStore.getState>["tool"];
  hitStroke: number;
  handleR: number;
  handleStroke: number;
  onBendMouseDown: (
    e: React.MouseEvent,
    args: { id: string; origDx: number; origDy: number },
  ) => void;
};

const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

// Arrastar um card reconstrói o mapa `rectById` inteiro, com objetos Rect
// novos. Com a comparação por referência do memo padrão, toda seta
// re-renderizaria e recalcularia a rota por frame de arrasto. Comparando
// os retângulos por valor, as setas que não tocam o card movido pulam o
// render; qualquer diferença real ainda re-renderiza.
function arrowNodePropsEqual(prev: ArrowNodeProps, next: ArrowNodeProps): boolean {
  return (
    prev.arrow === next.arrow &&
    prev.zoom === next.zoom &&
    prev.tool === next.tool &&
    prev.hitStroke === next.hitStroke &&
    prev.handleR === next.handleR &&
    prev.handleStroke === next.handleStroke &&
    prev.onBendMouseDown === next.onBendMouseDown &&
    sameRect(prev.from, next.from) &&
    sameRect(prev.to, next.to)
  );
}

const ArrowNode = memo(function ArrowNode({
  arrow: a,
  from,
  to,
  zoom,
  tool,
  hitStroke,
  handleR,
  handleStroke,
  onBendMouseDown,
}: ArrowNodeProps) {
  const isSel = useCanvasStore((s) => s.selectedId === a.id);
  // Grupo: seta capturada por marquee (ambos os cards endpoint dentro)
  // mas não e primary. Sem esse visual, setas em multi-seleção ficavam
  // invisiveis ao olho — usuário não sabia que Delete iria apaga-las.
  const isInGroup = useCanvasStore(
    (s) => s.selectedId !== a.id && s.selectedIds.has(a.id),
  );
  const select = useCanvasStore((s) => s.select);
  const toggleInSelection = useCanvasStore((s) => s.toggleInSelection);
  const removeArrow = useCanvasStore((s) => s.removeArrow);
  const setArrowBend = useCanvasStore((s) => s.setArrowBend);

  const route = useMemo(
    () =>
      routeArrow(from, to, a.bend, {
        fromSide: a.fromSide,
        toSide: a.toSide,
      }),
    [from, to, a.bend, a.fromSide, a.toSide],
  );
  const { p1, cp1, cp2, p2 } = route;
  const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;

  const arrowStroke = Math.max(1, a.width ?? 2) / zoom;
  const selectedStroke = Math.max(arrowStroke + 0.75 / zoom, 2.5 / zoom);

  // Ponto médio da cubic bezier (t=0.5):
  // B(0.5) = 0.125·P0 + 0.375·P1 + 0.375·P2 + 0.125·P3
  const handleX = 0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x;
  const handleY = 0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y;

  return (
    <g
      style={{
        pointerEvents:
          tool === "select" || tool === "eraser" ? "auto" : "none",
      }}
    >
      {/* Faixa invisível e larga, para o clique não exigir precisão. */}
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
          if (isSelectionToggle(e)) {
            toggleInSelection(a.id);
            return;
          }
          select(a.id);
        }}
        onDoubleClick={(e) => {
          // Duplo clique endireita a seta em vez de apagá-la. Apagar num
          // gesto que se usa para acertar um alvo fino dispara sem querer;
          // Delete, a borracha e a barra de seleção cobrem a remoção e
          // estão à vista.
          e.stopPropagation();
          if (tool === "eraser") return;
          setArrowBend(a.id, null);
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
}, arrowNodePropsEqual);

// ---------------- roteamento -----------------

type Rect = { x: number; y: number; w: number; h: number };
type Side = CardSide;

/**
 * Qual lado de `r` encara o centro de `other`.
 *
 * Compara o delta cru, sem normalizar por meia-largura e meia-altura. A
 * normalização inverte a intuição em retângulos: num card 220x120, um
 * alvo 50px à direita e 50px abaixo daria ny > nx e sairia pela base,
 * mesmo com o usuário puxando na horizontal.
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

// Respiro pra fora da borda — a seta nasce/termina FORA da caixa, não colada
// (nem por dentro, sobre o texto). Combina com os dots de conexão (que ja'
// ficam fora).
const ANCHOR_GAP = 7;

/**
 * Ponto de ancoragem no meio do lado `side`, afastado para fora pelo gap.
 * É fixo e coincide com o ponto de conexão daquele lado: deixá-lo deslizar
 * em direção ao alvo faz a cauda da seta escorregar durante o arrasto.
 */
function sideAnchor(r: Rect, side: Side) {
  let p: { x: number; y: number };
  switch (side) {
    case "top":
      p = { x: r.x + r.w / 2, y: r.y };
      break;
    case "bottom":
      p = { x: r.x + r.w / 2, y: r.y + r.h };
      break;
    case "left":
      p = { x: r.x, y: r.y + r.h / 2 };
      break;
    case "right":
      p = { x: r.x + r.w, y: r.y + r.h / 2 };
      break;
  }
  return extrude(p, side, ANCHOR_GAP);
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

  const p1 = sideAnchor(from, fromSide);
  const p2 = sideAnchor(to, toSide);

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
 * Versão para a prévia: o destino é um ponto (o cursor) em vez de um
 * retângulo. `overrideFromSide` força o lado de saída quando o usuário já
 * escolheu um ponto de conexão; sem ele, o lado vem do vetor origem→cursor.
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
    // Mesmo critério de `sideFacing`: delta cru, sem normalizar.
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

  const p1 = sideAnchor(from, fromSide);
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
