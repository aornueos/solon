import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowLayer";
import { StrokeLayer } from "./StrokeLayer";
import { FloatingText } from "./FloatingText";
import { ImageNode } from "./ImageNode";
import { CanvasToolbar } from "./CanvasToolbar";
import {
  CanvasStroke,
  DEFAULT_TEXT_SIZE,
  SCENE_DND_MIME,
} from "../../types/canvas";
import { readSceneSnapshot } from "../../lib/sceneSnapshot";
import { saveImageForCanvas } from "../../lib/canvasImages";
import { startDrag } from "../../lib/drag";
import { textRect } from "../../lib/canvasGeom";

/**
 * Infinite canvas Miro-inspired.
 *
 * Modos (tool):
 *  - select (default): drag bg = pan, dblclick = novo card, drag cards/texts/imagens
 *  - draw: mousedown no bg inicia um stroke; arrasta e solta pra commitar
 *  - text: click no bg cria um texto flutuante pronto pra editar
 *
 * Atalhos: V/P/T (tools), N (novo card), F (fit), Ctrl+D (duplicar card),
 * Delete/Backspace (remove selecionado), Esc (volta pra select).
 */
export function CanvasView() {
  const {
    cards,
    texts,
    images,
    viewport,
    zoomAt,
    panBy,
    select,
    selectedId,
    linkingFromId,
    cancelLink,
    addCard,
    addSceneCard,
    updateSceneSnapshotByPath,
    removeSelected,
    duplicateCard,
    addStroke,
    addText,
    addImage,
    tool,
    setTool,
    drawColor,
    drawWidth,
    selectMany,
  } = useCanvasStore();
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const activeView = useAppStore((s) => s.activeView);

  const containerRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const panning = useRef<{ startX: number; startY: number } | null>(null);

  // Stroke em progresso (live) — estado local pra não re-render a store a
  // cada pixel. Commitamos no `mouseup`.
  const [liveStroke, setLiveStroke] = useState<CanvasStroke | null>(null);
  const liveStrokeRef = useRef<CanvasStroke | null>(null);
  const [justCreatedTextId, setJustCreatedTextId] = useState<string | null>(null);

  /** Retângulo de marquee selection em screen coords (null = inativo). */
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Wheel = zoom (com ctrl) ou pan trackpad
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 30) {
        zoomAt(e.clientX, e.clientY, e.deltaY);
      } else {
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, panBy]);

  // Keyboard: space-pan, tools, N/F/Delete/Esc/Ctrl+D
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !typing) {
        spaceDown.current = true;
        document.body.style.cursor = "grab";
      }
      if (typing) return;

      if (e.key === "Escape") {
        cancelLink();
        select(null);
        setTool("select");
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Guarda considera tanto selecao primaria quanto grupo de marquee.
        // Antes, `selectedId = null` (estado normal apos marquee sem primary)
        // fazia Delete virar no-op mesmo com 5 cards selecionados.
        const { selectedIds } = useCanvasStore.getState();
        if (!selectedId && selectedIds.size === 0) return;
        removeSelected();
      }
      // Undo/Redo. Ctrl+Z = undo; Ctrl+Shift+Z OU Ctrl+Y = redo.
      // Convencao multi-plataforma — Windows usa Ctrl+Y, Mac usa Cmd+Shift+Z;
      // a gente aceita os dois pra nao surpreender ninguem.
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) useCanvasStore.getState().redo();
        else useCanvasStore.getState().undo();
        return;
      }
      if ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useCanvasStore.getState().redo();
        return;
      }
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey)) {
        // Ctrl+D duplica cards; em multi-selecao, duplica todos os cards
        // do grupo (outros kinds sao ignorados — stroke/text/image/arrow
        // nao tem "duplicate" no modelo atual).
        const state = useCanvasStore.getState();
        const ids = state.selectedIds.size > 0
          ? [...state.selectedIds]
          : selectedId ? [selectedId] : [];
        const cardIds = ids.filter((id) => state.findSelectionKind(id) === "card");
        if (cardIds.length === 0) return;
        e.preventDefault();
        for (const id of cardIds) duplicateCard(id);
        return;
      }
      if (e.ctrlKey || e.metaKey) return; // ignora outros Ctrl+X

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        addCard();
      }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "p" || e.key === "P") setTool("draw");
      if (e.key === "t" || e.key === "T") setTool("text");
      if (e.key === "a" || e.key === "A") setTool("arrow");
      if (e.key === "e" || e.key === "E") setTool("eraser");
      if (e.key === "f" || e.key === "F") {
        const state = useCanvasStore.getState();
        const boxes = [
          ...state.cards,
          ...state.images,
          ...state.texts.map(textRect),
        ];
        if (boxes.length === 0) {
          state.setViewport({ x: 0, y: 0, zoom: 1 });
          return;
        }
        const minX = Math.min(...boxes.map((b) => b.x));
        const minY = Math.min(...boxes.map((b) => b.y));
        const maxX = Math.max(...boxes.map((b) => b.x + b.w));
        const maxY = Math.max(...boxes.map((b) => b.y + b.h));
        const padding = 80;
        const w = maxX - minX + padding * 2;
        const h = maxY - minY + padding * 2;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const zoom = Math.min(1.2, Math.min(rect.width / w, rect.height / h));
        state.setViewport({
          zoom,
          x: -(minX - padding) * zoom + (rect.width - w * zoom) / 2,
          y: -(minY - padding) * zoom + (rect.height - h * zoom) / 2,
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        document.body.style.cursor = "";
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.body.style.cursor = "";
    };
  }, [
    selectedId,
    removeSelected,
    duplicateCard,
    addCard,
    cancelLink,
    select,
    setTool,
  ]);

  // Refresca snapshots de cenas ao (re)entrar no canvas
  useEffect(() => {
    if (activeView !== "canvas") return;
    const sceneCards = useCanvasStore
      .getState()
      .cards.filter((c) => c.kind === "scene" && c.scenePath);
    if (sceneCards.length === 0) return;
    const paths = Array.from(new Set(sceneCards.map((c) => c.scenePath!)));
    (async () => {
      for (const p of paths) {
        const name = p.split(/[\\/]/).pop() ?? p;
        const snap = await readSceneSnapshot(p, name);
        updateSceneSnapshotByPath(p, snap);
      }
    })();
  }, [activeView, updateSceneSnapshotByPath]);

  // Paste de imagens (somente quando canvas visível e nada focado)
  useEffect(() => {
    if (activeView !== "canvas") return;
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!rootFolder) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        try {
          const { src, width, height } = await saveImageForCanvas(
            rootFolder,
            file,
          );
          // Centraliza a imagem na viewport atual (em world coords)
          const el = containerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const centerWX =
            (rect.width / 2 - viewport.x) / viewport.zoom;
          const centerWY =
            (rect.height / 2 - viewport.y) / viewport.zoom;
          // Escala se imagem for grande demais
          const maxSide = 420;
          let w = width;
          let h = height;
          if (Math.max(w, h) > maxSide) {
            const r = maxSide / Math.max(w, h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          addImage({
            src,
            x: centerWX - w / 2,
            y: centerWY - h / 2,
            w,
            h,
          });
        } catch (err) {
          console.error("Erro ao colar imagem:", err);
        }
        return; // só a primeira imagem
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [activeView, rootFolder, viewport.x, viewport.y, viewport.zoom, addImage]);

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(SCENE_DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(SCENE_DND_MIME);
    if (!raw) return;
    e.preventDefault();
    let payload: { path: string; name: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const worldY = (e.clientY - rect.top - viewport.y) / viewport.zoom;
    const snap = await readSceneSnapshot(payload.path, payload.name);
    if (!snap) return;
    addSceneCard({
      scenePath: payload.path,
      sceneName: payload.name,
      snapshot: snap,
      x: worldX - 130,
      y: worldY - 75,
    });
  };

  const screenToWorld = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  const startPan = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    panning.current = { startX: e.clientX, startY: e.clientY };
    const finish = () => {
      panning.current = null;
      document.body.style.cursor = spaceDown.current ? "grab" : "";
    };
    startDrag({
      onMove: (ev) => {
        if (!panning.current) return;
        panBy(
          ev.clientX - panning.current.startX,
          ev.clientY - panning.current.startY,
        );
        panning.current = { startX: ev.clientX, startY: ev.clientY };
      },
      onEnd: finish,
      onCancel: finish,
    });
  };

  const startDrawStroke = (e: React.MouseEvent) => {
    e.preventDefault();
    const start = screenToWorld(e.clientX, e.clientY);
    // Cor "" (Auto) tambem vale pra strokes — o StrokeLayer resolve
    // empty/"#2a2420" → var(--text-primary) na hora de renderizar, entao
    // o stroke fica theme-aware igual texto. Antes a gente forcava Tinta
    // aqui, mas isso "pintava" o stroke deliberadamente em sepia escuro,
    // perdendo a adaptacao ao dark theme.
    const stroke: CanvasStroke = {
      id: "__live__",
      points: [start.x, start.y],
      color: drawColor,
      width: drawWidth,
    };
    liveStrokeRef.current = stroke;
    setLiveStroke(stroke);

    startDrag({
      onMove: (ev) => {
        const cur = liveStrokeRef.current;
        if (!cur) return;
        const p = screenToWorld(ev.clientX, ev.clientY);
        // Só adiciona se deslocou o suficiente (evita explosão de pontos)
        const lastX = cur.points[cur.points.length - 2];
        const lastY = cur.points[cur.points.length - 1];
        const minDist = 2 / viewport.zoom;
        if (Math.hypot(p.x - lastX, p.y - lastY) < minDist) return;
        cur.points.push(p.x, p.y);
        // Shallow clone pra forçar re-render
        setLiveStroke({ ...cur, points: cur.points.slice() });
      },
      onEnd: () => {
        const cur = liveStrokeRef.current;
        liveStrokeRef.current = null;
        setLiveStroke(null);
        if (!cur) return;
        // Só commita se tem mais de um ponto real
        if (cur.points.length >= 4) {
          addStroke({
            points: cur.points,
            color: cur.color,
            width: cur.width,
          });
        }
      },
      onCancel: () => {
        // Descarta traço incompleto sem commitar
        liveStrokeRef.current = null;
        setLiveStroke(null);
      },
    });
  };

  const startMarquee = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    setMarquee({ x: startX, y: startY, w: 0, h: 0 });

    startDrag({
      onMove: (ev) => {
        const x = Math.min(startX, ev.clientX - rect.left);
        const y = Math.min(startY, ev.clientY - rect.top);
        const w = Math.abs(ev.clientX - rect.left - startX);
        const h = Math.abs(ev.clientY - rect.top - startY);
        setMarquee({ x, y, w, h });
      },
      onEnd: (ev) => {
        const endX = ev.clientX - rect.left;
        const endY = ev.clientY - rect.top;
        const x0 = Math.min(startX, endX);
        const y0 = Math.min(startY, endY);
        const x1 = Math.max(startX, endX);
        const y1 = Math.max(startY, endY);
        setMarquee(null);

        // Clique (sem drag real) = desseleção, não marquee
        if (x1 - x0 < 3 && y1 - y0 < 3) {
          select(null);
          return;
        }

        // Converte screen rect → world rect
        const { viewport: vp, cards, texts, images, strokes, arrows } =
          useCanvasStore.getState();
        const wx0 = (x0 - vp.x) / vp.zoom;
        const wy0 = (y0 - vp.y) / vp.zoom;
        const wx1 = (x1 - vp.x) / vp.zoom;
        const wy1 = (y1 - vp.y) / vp.zoom;

        // AABB-vs-AABB overlap. Retorna true se qualquer canto ou aresta do
        // bbox do item estiver dentro do retângulo do marquee.
        const hit = (x: number, y: number, w: number, h: number) =>
          x + w >= wx0 && x <= wx1 && y + h >= wy0 && y <= wy1;

        // Bbox de um stroke: varre todos os pontos (pairs x,y) e guarda
        // min/max. Strokes podem ser longos, mas são só arrays numéricos
        // então isso é O(n) sem alocação extra.
        const strokeBBox = (pts: number[]) => {
          if (pts.length < 2) return null;
          let minX = pts[0], minY = pts[1];
          let maxX = pts[0], maxY = pts[1];
          for (let i = 2; i < pts.length; i += 2) {
            const px = pts[i];
            const py = pts[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        };

        const ids: string[] = [];
        for (const c of cards) if (hit(c.x, c.y, c.w, c.h)) ids.push(c.id);
        for (const t of texts) {
          const r = textRect(t);
          if (hit(r.x, r.y, r.w, r.h)) ids.push(t.id);
        }
        for (const i of images) if (hit(i.x, i.y, i.w, i.h)) ids.push(i.id);
        for (const s of strokes) {
          const bb = strokeBBox(s.points);
          if (bb && hit(bb.x, bb.y, bb.w, bb.h)) ids.push(s.id);
        }
        // Arrows: seleciona quando ambos os cards-endpoint estão (ao menos
        // parcialmente) dentro do marquee. É o mesmo critério do Figma/Miro
        // — "se os dois nós entraram na seleção, a aresta veio junto". Evita
        // o problema de marquee sobre espaço vazio entre cards distantes
        // acidentalmente selecionar a seta que passa por cima.
        for (const a of arrows) {
          const fromCard = cards.find((c) => c.id === a.from);
          const toCard = cards.find((c) => c.id === a.to);
          if (!fromCard || !toCard) continue;
          const fromHit = hit(fromCard.x, fromCard.y, fromCard.w, fromCard.h);
          const toHit = hit(toCard.x, toCard.y, toCard.w, toCard.h);
          if (fromHit && toHit) ids.push(a.id);
        }

        selectMany(ids);
      },
      onCancel: () => {
        setMarquee(null);
      },
    });
  };

  const onBgMouseDown = (e: React.MouseEvent) => {
    // Commit explicito de qualquer textarea/input em edicao no canvas
    // (FloatingText editing, label de card etc.). Sem isso, o
    // `e.preventDefault()` que viria abaixo (em startMarquee/startDraw)
    // cancela o focus-change do click e o textarea NAO perde o foco —
    // o usuario via "texto continua em edicao mesmo clicando fora".
    // Forcar blur antes do preventDefault dispara o `onBlur` do textarea
    // (que ja faz o commit) e remove o caret antes de processarmos o
    // mousedown como pan/marquee/draw.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === "TEXTAREA" || active.tagName === "INPUT") &&
      active.closest(".canvas-surface")
    ) {
      active.blur();
    }

    const isPanTrigger = spaceDown.current || e.button === 1;
    if (isPanTrigger) return startPan(e);

    if (tool === "draw") return startDrawStroke(e);

    if (tool === "text") {
      e.preventDefault();
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      // Passa `drawColor` (que pode ser "" / Auto, ou um hex deliberado
      // escolhido pelo usuario na toolbar). O FloatingText resolve "" →
      // var(--text-primary) na hora de renderizar.
      const id = addText({
        x,
        y,
        text: "",
        size: DEFAULT_TEXT_SIZE,
        color: drawColor,
      });
      setJustCreatedTextId(id);
      // Depois de criar, volta pro modo select pra facilitar
      setTool("select");
      return;
    }

    if (tool === "arrow") {
      // Click no bg em modo arrow cancela linking em progresso
      if (linkingFromId) cancelLink();
      return;
    }

    // Em modo borracha, click no vazio nao faz nada — eraser so afeta
    // items existentes (clique direto). Marquee aqui daria a sensacao de
    // "estou tentando apagar mas o cursor ta selecionando area" e poluiria
    // o mental model de "borracha = clique pra apagar".
    if (tool === "eraser") {
      return;
    }

    // select mode: drag = marquee, click puro desseleciona
    if (linkingFromId) {
      cancelLink();
      return;
    }
    return startMarquee(e);
  };

  const onBgDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    addCard({ x: x - 110, y: y - 60 });
  };

  const bgCursor =
    tool === "draw"
      ? "crosshair"
      : tool === "text"
      ? "text"
      : tool === "arrow" || linkingFromId
      ? "crosshair"
      : tool === "eraser"
      ? "cell" // sem cursor "eraser" nativo do CSS — `cell` da feedback
      : "default";

  return (
    <div
      ref={containerRef}
      onMouseDown={onBgMouseDown}
      onDoubleClick={onBgDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="canvas-surface relative w-full h-full overflow-hidden select-none"
      style={{
        cursor: bgCursor,
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
    >
      {!activeFilePath && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div
            className="text-center text-sm rounded-lg px-5 py-3 shadow-sm"
            style={{
              color: "var(--text-muted)",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
            }}
          >
            {rootFolder
              ? "Abra um arquivo para ver seu canvas."
              : "Abra uma pasta para começar."}
          </div>
        </div>
      )}

      <CanvasToolbar />

      {/* World container */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          width: 0,
          height: 0,
        }}
      >
        {/* z-order: strokes → images → cards → arrows → floating texts.
            Arrows ficam *acima* dos cards (estilo Miro/Excalidraw). Se o
            arrow ficasse abaixo, cards sobrepostos esconderiam o traço —
            era o motivo de o usuário ver "seta invisível" ao conectar dois
            cards empilhados. O SVG root tem pointer-events:none; só os paths
            com hit-stroke em modo select capturam clique, então o drag de
            card segue funcionando fora da faixa do traço. */}
        <StrokeLayer
          worldWidth={10000}
          worldHeight={10000}
          liveStroke={liveStroke}
        />

        {images.map((img) => (
          <ImageNode key={img.id} image={img} />
        ))}

        {cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}

        <ArrowLayer worldWidth={10000} worldHeight={10000} />

        {texts.map((t) => (
          <FloatingText
            key={t.id}
            text={t}
            autoEdit={justCreatedTextId === t.id}
          />
        ))}
      </div>

      {marquee && (
        <div
          className="absolute pointer-events-none z-15"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: "var(--marquee-fill)",
            border: "1px solid var(--marquee-stroke)",
          }}
        />
      )}

      {(linkingFromId || tool === "arrow") && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[0.72rem] px-3 py-1.5 rounded-full shadow-md z-10"
          style={{
            background: "var(--bg-inverse)",
            color: "var(--text-inverse)",
          }}
        >
          {linkingFromId
            ? "Clique no destino (Esc p/ cancelar)"
            : "Clique em 2 itens para conectar (cards, textos, imagens)"}
        </div>
      )}

      {tool === "eraser" && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[0.72rem] px-3 py-1.5 rounded-full shadow-md z-10"
          style={{
            background: "var(--bg-inverse)",
            color: "var(--text-inverse)",
          }}
        >
          Borracha — clique em qualquer item para apagar (V p/ voltar)
        </div>
      )}
    </div>
  );
}
