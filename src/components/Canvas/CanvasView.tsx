import { memo, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowLayer";
import { StrokeLayer } from "./StrokeLayer";
import { FloatingText } from "./FloatingText";
import { ImageNode } from "./ImageNode";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasSidePanel } from "./CanvasSidePanel";
import { CanvasMinimap } from "./CanvasMinimap";
import {
  CANVAS_TOOL_ORDER,
  CanvasStroke,
  DEFAULT_TEXT_SIZE,
  SCENE_DND_MIME,
} from "../../types/canvas";
import { readSceneSnapshot } from "../../lib/sceneSnapshot";
import { saveImageForCanvas } from "../../lib/canvasImages";
import { startDrag } from "../../lib/drag";
import { textRect } from "../../lib/canvasGeom";
import {
  CANVAS_EMPTY_LINK_EVENT,
  CanvasEmptyLinkDetail,
} from "../../lib/canvasLinkDrag";
import {
  clientToSurface,
  fitAllViewport,
  neighbourId,
  rectOf,
  revealRect,
  zoomStep,
  zoomToLevel,
} from "../../lib/canvasViewport";
import { isSelectionToggle } from "../../lib/canvasSelectionInput";

/** Setas do teclado, em delta unitario. */
const NUDGE_KEYS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

/**
 * Canvas infinito do projeto.
 *
 * Ferramentas:
 *  - select: arrastar o fundo dá pan, duplo clique cria, arrastar um item
 *    o move;
 *  - draw: pressionar no fundo começa um traço, soltar o grava;
 *  - text: clicar no fundo cria um texto flutuante já em edição;
 *  - arrow: clicar em dois itens os conecta;
 *  - eraser: clicar num item o apaga.
 *
 * Atalhos: 1–5 (ferramentas, na ordem da toolbar), V/P/T/A/E, N (card),
 * F (enquadrar), +/− (zoom), 0 (100%), Ctrl+D (duplicar), Ctrl+C/X/V,
 * Ctrl+Z/Y, Delete (apagar seleção), Esc (voltar para select).
 * Shift ou Ctrl/Cmd somam à seleção, no clique e no marquee.
 *
 * Com o foco na superfície: Tab percorre os itens em ordem de leitura,
 * as setas movem a seleção e Enter abre o item para edição.
 */
export function CanvasView() {
  const viewport = useCanvasStore((s) => s.viewport);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const panBy = useCanvasStore((s) => s.panBy);
  const select = useCanvasStore((s) => s.select);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const linkingFromId = useCanvasStore((s) => s.linkingFromId);
  const cancelLink = useCanvasStore((s) => s.cancelLink);
  const addCard = useCanvasStore((s) => s.addCard);
  const addSceneCard = useCanvasStore((s) => s.addSceneCard);
  const updateSceneSnapshotByPath = useCanvasStore(
    (s) => s.updateSceneSnapshotByPath,
  );
  const removeSelected = useCanvasStore((s) => s.removeSelected);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const addStroke = useCanvasStore((s) => s.addStroke);
  const addText = useCanvasStore((s) => s.addText);
  const addImage = useCanvasStore((s) => s.addImage);
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const drawColor = useCanvasStore((s) => s.drawColor);
  const setDrawColor = useCanvasStore((s) => s.setDrawColor);
  const drawWidth = useCanvasStore((s) => s.drawWidth);
  const setDrawWidth = useCanvasStore((s) => s.setDrawWidth);
  const selectMany = useCanvasStore((s) => s.selectMany);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const activeView = useAppStore((s) => s.activeView);
  const canvasGridEnabled = useAppStore((s) => s.canvasGridEnabled);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const canvasDefaultTool = useAppStore((s) => s.canvasDefaultTool);
  const canvasDefaultTextSize = useAppStore((s) => s.canvasDefaultTextSize);
  const canvasDefaultDrawWidth = useAppStore((s) => s.canvasDefaultDrawWidth);
  const canvasDefaultColor = useAppStore((s) => s.canvasDefaultColor);
  const canvasDblClickCreates = useAppStore((s) => s.canvasDblClickCreates);
  const pushToast = useAppStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const panning = useRef<{ startX: number; startY: number } | null>(null);
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef({ dx: 0, dy: 0 });
  const zoomFrame = useRef<number | null>(null);
  const pendingZoom = useRef({ x: 0, y: 0, delta: 0 });

  // Traço em progresso. Fica no estado local para não gravar na store a
  // cada pixel; só o mouseup faz o commit.
  const [liveStroke, setLiveStroke] = useState<CanvasStroke | null>(null);
  const liveStrokeRef = useRef<CanvasStroke | null>(null);
  const [justCreatedTextId, setJustCreatedTextId] = useState<string | null>(null);
  const [emptyLinkMenu, setEmptyLinkMenu] = useState<{
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  /** Retângulo de marquee selection em screen coords (null = inativo). */
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // A geometria do marquee é escrita direto no DOM durante o arrasto, não
  // via setState: um re-render da CanvasView por pointermove arrasta junto
  // todos os cards, setas e traços. O state marquee acima só controla o
  // mount do elemento.
  const marqueeRef = useRef<HTMLDivElement | null>(null);

  const snap = (value: number) =>
    canvasSnapToGrid
      ? Math.round(value / canvasGridSize) * canvasGridSize
      : value;

  const schedulePanBy = (dx: number, dy: number) => {
    pendingPan.current.dx += dx;
    pendingPan.current.dy += dy;
    if (panFrame.current != null) return;
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = null;
      const { dx, dy } = pendingPan.current;
      pendingPan.current = { dx: 0, dy: 0 };
      if (dx || dy) panBy(dx, dy);
    });
  };

  // Zoom coalescido em rAF, espelhando `schedulePanBy`. O wheel dispara
  // dezenas de eventos por segundo; aplicar um `zoomAt` por evento
  // re-renderizava o canvas inteiro. Como `zoomAt` e exponencial no delta,
  // somar os deltas e aplicar uma vez por frame da o mesmo resultado:
  // exp(-(d1+d2)k) = exp(-d1 k) · exp(-d2 k).
  const scheduleZoom = (clientX: number, clientY: number, deltaY: number) => {
    pendingZoom.current.x = clientX;
    pendingZoom.current.y = clientY;
    pendingZoom.current.delta += deltaY;
    if (zoomFrame.current != null) return;
    zoomFrame.current = requestAnimationFrame(() => {
      zoomFrame.current = null;
      const { x, y, delta } = pendingZoom.current;
      pendingZoom.current = { x: 0, y: 0, delta: 0 };
      if (!delta) return;
      // O retangulo e lido uma vez por frame: durante o pan o transform
      // ja invalidou o layout, e um getBoundingClientRect por evento de
      // wheel forcaria um reflow sincrono a cada notch.
      const rect = containerRef.current?.getBoundingClientRect() ?? null;
      const point = clientToSurface(x, y, rect);
      zoomAt(point.x, point.y, delta);
    });
  };

  useEffect(() => {
    return () => {
      if (panFrame.current != null) cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
      pendingPan.current = { dx: 0, dy: 0 };
      if (zoomFrame.current != null) cancelAnimationFrame(zoomFrame.current);
      zoomFrame.current = null;
      pendingZoom.current = { x: 0, y: 0, delta: 0 };
    };
  }, []);

  useEffect(() => {
    if (activeView !== "canvas") return;
    setTool(canvasDefaultTool);
    setDrawWidth(canvasDefaultDrawWidth);
    setDrawColor(canvasDefaultColor);
  }, [
    activeFilePath,
    activeView,
    canvasDefaultColor,
    canvasDefaultDrawWidth,
    canvasDefaultTool,
    setDrawColor,
    setDrawWidth,
    setTool,
  ]);

  // Wheel = zoom (com ctrl) ou pan trackpad
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 30) {
        scheduleZoom(e.clientX, e.clientY, e.deltaY);
      } else {
        schedulePanBy(-e.deltaX, -e.deltaY);
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

      // Tab, setas e Enter só valem com o foco na própria superfície. Num
      // botão da toolbar ou noutro painel, o teclado precisa continuar
      // fazendo o de sempre — e Tab preso no canvas seria uma armadilha.
      const onSurface = document.activeElement === containerRef.current;

      if (e.key === "Escape") {
        setEmptyLinkMenu(null);
        cancelLink();
        select(null);
        setTool("select");
        // Devolve o foco ao documento: é assim que se sai do ciclo do Tab.
        if (onSurface) containerRef.current?.blur();
      }

      if (e.key === "Tab" && onSurface) {
        e.preventDefault();
        const st = useCanvasStore.getState();
        const next = neighbourId(st.selectedId, e.shiftKey ? -1 : 1);
        if (!next) return;
        st.select(next);
        const rect = rectOf(next);
        if (rect) revealRect(rect, containerRef.current);
        return;
      }

      if (e.key === "Enter" && onSurface) {
        const st = useCanvasStore.getState();
        if (!st.selectedId) return;
        e.preventDefault();
        st.requestEdit(st.selectedId);
        return;
      }

      const nudge = NUDGE_KEYS[e.key];
      if (nudge && onSurface) {
        const st = useCanvasStore.getState();
        if (!st.selectedId && st.selectedIds.size === 0) return;
        e.preventDefault();
        // Com o snap ligado o passo é uma célula, pra não quebrar o
        // alinhamento que o snap acabou de garantir. Sem snap, 1px e
        // 10px com Shift, como em qualquer editor vetorial.
        const step = canvasSnapToGrid
          ? canvasGridSize
          : e.shiftKey
            ? 10
            : 1;
        st.nudgeSelection(nudge.dx * step, nudge.dy * step);
        const rect = st.selectedId ? rectOf(st.selectedId) : null;
        if (rect) revealRect(rect, containerRef.current);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Le estado FRESCO (não o closure do effect, que pode estar stale) —
        // considera seleção primaria E grupo de marquee.
        const st = useCanvasStore.getState();
        if (!st.selectedId && st.selectedIds.size === 0) return;
        removeSelected();
      }
      if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const state = useCanvasStore.getState();
        const ids = [
          ...state.cards.map((item) => item.id),
          ...state.texts.map((item) => item.id),
          ...state.images.map((item) => item.id),
          ...state.strokes.map((item) => item.id),
          ...state.arrows.map((item) => item.id),
        ];
        state.selectMany(ids, ids[0] ?? null);
        return;
      }
      // Refazer aceita Ctrl+Shift+Z e Ctrl+Y: a convenção difere entre
      // Windows e macOS e não custa atender às duas.
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
        e.preventDefault();
        duplicateSelected();
        return;
      }
      // Copiar e recortar blocos do canvas. O guard typing acima já devolve
      // o comportamento nativo durante a edição de texto.
      if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
        const st = useCanvasStore.getState();
        if (!st.selectedId && st.selectedIds.size === 0) return;
        e.preventDefault();
        st.copySelected();
        return;
      }
      if ((e.key === "x" || e.key === "X") && (e.ctrlKey || e.metaKey)) {
        const st = useCanvasStore.getState();
        if (!st.selectedId && st.selectedIds.size === 0) return;
        e.preventDefault();
        st.copySelected();
        st.removeSelected();
        return;
      }
      // Ctrl+V fica de fora de propósito: o listener de paste trata o caso,
      // dando prioridade a uma imagem do sistema e caindo no clipboard
      // interno do canvas quando não há nenhuma.
      if (e.ctrlKey || e.metaKey) return;

      const numericTool = CANVAS_TOOL_ORDER[Number(e.key) - 1];
      if (numericTool) {
        e.preventDefault();
        setTool(numericTool);
        return;
      }

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
        const el = containerRef.current;
        if (!el) return;
        useCanvasStore
          .getState()
          .setViewport(fitAllViewport(el.getBoundingClientRect()));
        return;
      }
      // Zoom pelo teclado, ancorado no centro da superficie. `=` cobre o
      // teclado onde `+` exige Shift.
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomStep(-1, containerRef.current);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomStep(1, containerRef.current);
        return;
      }
      // Volta a 100% sem perder o lugar: o que estava no centro continua no
      // centro. Resetar o viewport (botão da toolbar) joga para a origem.
      if (e.key === "0") {
        e.preventDefault();
        zoomToLevel(1, containerRef.current);
        return;
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
    duplicateSelected,
    addCard,
    cancelLink,
    select,
    setTool,
    canvasSnapToGrid,
    canvasGridSize,
  ]);

  // Refresca snapshots de cenas ao (re)entrar no canvas
  useEffect(() => {
    if (activeView !== "canvas") return;
    const sceneCards = useCanvasStore
      .getState()
      .cards.filter((c) => c.kind === "scene" && c.scenePath);
    if (sceneCards.length === 0) return;
    let alive = true;
    const paths = Array.from(new Set(sceneCards.map((c) => c.scenePath!)));
    (async () => {
      for (const p of paths) {
        if (!alive) return;
        const name = p.split(/[\\/]/).pop() ?? p;
        const snap = await readSceneSnapshot(p, name);
        if (!alive) return;
        updateSceneSnapshotByPath(p, snap);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeView, updateSceneSnapshotByPath]);

  // Paste de imagens (somente quando canvas visível e nada focado)
  useEffect(() => {
    if (activeView !== "canvas") return;
    // Salva + posiciona uma imagem no centro da viewport (escala se grande).
    const placeImageFile = async (file: File) => {
      const { src, width, height } = await saveImageForCanvas(rootFolder!, file);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerWX = (rect.width / 2 - viewport.x) / viewport.zoom;
      const centerWY = (rect.height / 2 - viewport.y) / viewport.zoom;
      const maxSide = 420;
      let w = width;
      let h = height;
      if (Math.max(w, h) > maxSide) {
        const r = maxSide / Math.max(w, h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      addImage({ src, x: centerWX - w / 2, y: centerWY - h / 2, w, h });
    };

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

      // 1) Bitmap direto no clipboard: "Copiar imagem", capturas de tela,
      //    editores de imagem.
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (!item.type.startsWith("image/")) continue;
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          try {
            await placeImageFile(file);
          } catch (err) {
            console.error("Erro ao colar imagem:", err);
            pushToast(
              "error",
              err instanceof Error ? err.message : "Não foi possível colar a imagem.",
            );
          }
          return; // só a primeira
        }
      }

      // 2) Sem bitmap: imagem da web copiada como <img src> (text/html) ou
      //    como URL/data-uri (text/plain). Copiar do navegador com Ctrl+C
      //    costuma cair aqui. Baixa e posiciona.
      const html = e.clipboardData?.getData("text/html") ?? "";
      const plain = (e.clipboardData?.getData("text/plain") ?? "").trim();
      let url: string | null = null;
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) url = m[1];
      else if (/^data:image\//i.test(plain)) url = plain;
      else if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?\S*)?$/i.test(plain))
        url = plain;
      if (!url) {
        // 3) Nada de imagem no sistema: cola os blocos copiados no canvas.
        useCanvasStore.getState().pasteClipboard();
        return;
      }

      e.preventDefault();
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Conteúdo não é imagem");
        const ext = (blob.type.split("/")[1] || "png").split("+")[0];
        await placeImageFile(new File([blob], `colada.${ext}`, { type: blob.type }));
      } catch (err) {
        console.error("Erro ao baixar imagem da web:", err);
        pushToast(
          "error",
          'Não foi possível baixar a imagem da web (rede/CORS). Dica: botão direito na imagem → "Copiar imagem", depois cole.',
        );
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [activeView, rootFolder, viewport.x, viewport.y, viewport.zoom, addImage, pushToast]);

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
    const sceneSnapshot = await readSceneSnapshot(payload.path, payload.name);
    if (!sceneSnapshot) return;
    addSceneCard({
      scenePath: payload.path,
      sceneName: payload.name,
      snapshot: sceneSnapshot,
      x: snap(worldX - 130),
      y: snap(worldY - 75),
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

  // O viewport é lido por getState em vez de entrar nas dependências: ele
  // muda a cada pan, e re-registrar o listener por frame é caro.
  useEffect(() => {
    const onEmptyLink = (event: Event) => {
      const { clientX, clientY } = (event as CustomEvent<CanvasEmptyLinkDetail>).detail;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vp = useCanvasStore.getState().viewport;
      const wx = (clientX - rect.left - vp.x) / vp.zoom;
      const wy = (clientY - rect.top - vp.y) / vp.zoom;
      setEmptyLinkMenu({
        screenX: clientX - rect.left,
        screenY: clientY - rect.top,
        worldX: snap(wx),
        worldY: snap(wy),
      });
    };
    window.addEventListener(CANVAS_EMPTY_LINK_EVENT, onEmptyLink);
    return () => window.removeEventListener(CANVAS_EMPTY_LINK_EVENT, onEmptyLink);
  }, [canvasSnapToGrid, canvasGridSize]);

  const createLinkedItem = (kind: "text" | "card") => {
    if (!emptyLinkMenu) return;
    const state = useCanvasStore.getState();
    if (!state.linkingFromId) return;

    if (kind === "text") {
      const id = addText({
        x: emptyLinkMenu.worldX,
        y: emptyLinkMenu.worldY,
        text: "",
        size: canvasDefaultTextSize || DEFAULT_TEXT_SIZE,
        color: drawColor,
      });
      setJustCreatedTextId(id);
      state.completeLink(id);
    } else {
      const id = addCard({
        x: snap(emptyLinkMenu.worldX - 110),
        y: snap(emptyLinkMenu.worldY - 60),
      });
      state.completeLink(id);
    }

    setEmptyLinkMenu(null);
    setTool("select");
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
        schedulePanBy(
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
    // A cor vazia ("Auto") é preservada: o StrokeLayer a resolve para
    // var(--text-primary) ao renderizar, então o traço acompanha o tema.
    const stroke: CanvasStroke = {
      id: "__live__",
      points: [start.x, start.y],
      color: drawColor,
      width: drawWidth,
    };
    liveStrokeRef.current = stroke;
    setLiveStroke(stroke);
    let strokeFrame: number | null = null;
    const scheduleLiveStroke = () => {
      if (strokeFrame != null) return;
      strokeFrame = requestAnimationFrame(() => {
        strokeFrame = null;
        const cur = liveStrokeRef.current;
        if (!cur) return;
        setLiveStroke({ ...cur, points: cur.points.slice() });
      });
    };
    const clearLiveStrokeFrame = () => {
      if (strokeFrame != null) cancelAnimationFrame(strokeFrame);
      strokeFrame = null;
    };

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
        scheduleLiveStroke();
      },
      onEnd: () => {
        clearLiveStrokeFrame();
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
        clearLiveStrokeFrame();
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
    // Com o modificador, o retângulo SOMA à seleção em vez de substituí-la
    // — permite juntar grupos distantes em duas passadas.
    const additive = isSelectionToggle(e);
    // Daqui em diante o state não é mais tocado durante o arrasto: a
    // geometria vai direto para o DOM pela ref.
    setMarquee({ x: startX, y: startY, w: 0, h: 0 });

    startDrag({
      onMove: (ev) => {
        const x = Math.min(startX, ev.clientX - rect.left);
        const y = Math.min(startY, ev.clientY - rect.top);
        const w = Math.abs(ev.clientX - rect.left - startX);
        const h = Math.abs(ev.clientY - rect.top - startY);
        const node = marqueeRef.current;
        if (node) {
          node.style.left = `${x}px`;
          node.style.top = `${y}px`;
          node.style.width = `${w}px`;
          node.style.height = `${h}px`;
        }
      },
      onEnd: (ev) => {
        const endX = ev.clientX - rect.left;
        const endY = ev.clientY - rect.top;
        const x0 = Math.min(startX, endX);
        const y0 = Math.min(startY, endY);
        const x1 = Math.max(startX, endX);
        const y1 = Math.max(startY, endY);
        setMarquee(null);

        // Clique sem arrasto de verdade limpa a seleção — a não ser que o
        // usuário esteja somando, quando não mexer é o esperado.
        if (x1 - x0 < 3 && y1 - y0 < 3) {
          if (!additive) select(null);
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
        // Uma seta entra na seleção quando os dois cards-extremo entram: um
        // marquee sobre o espaço vazio entre cards distantes não deve
        // arrastar junto a seta que passa por cima. O mapa por id evita um
        // find() por seta.
        const cardById = new Map(cards.map((c) => [c.id, c]));
        for (const a of arrows) {
          const fromCard = cardById.get(a.from);
          const toCard = cardById.get(a.to);
          if (!fromCard || !toCard) continue;
          const fromHit = hit(fromCard.x, fromCard.y, fromCard.w, fromCard.h);
          const toHit = hit(toCard.x, toCard.y, toCard.w, toCard.h);
          if (fromHit && toHit) ids.push(a.id);
        }

        if (additive) {
          const merged = new Set(useCanvasStore.getState().selectedIds);
          for (const id of ids) merged.add(id);
          const next = [...merged];
          selectMany(next, next.length === 1 ? next[0] : null);
        } else {
          selectMany(ids, ids[0] ?? null);
        }
      },
      onCancel: () => {
        setMarquee(null);
      },
    });
  };

  const onBgMouseDown = (e: React.MouseEvent) => {
    if (emptyLinkMenu) {
      setEmptyLinkMenu(null);
      cancelLink();
    }

    // Fecha qualquer edição de texto em curso antes de tratar o mousedown.
    // O preventDefault de startMarquee/startDrawStroke cancelaria a troca de
    // foco do clique e o campo continuaria em edição; o blur explícito
    // dispara o commit e tira o caret antes disso.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === "TEXTAREA" ||
        active.tagName === "INPUT" ||
        // O texto flutuante edita num contenteditable, não num textarea.
        active.isContentEditable) &&
      active.closest(".canvas-surface")
    ) {
      active.blur();
    }

    // Clicar no fundo põe o foco na superfície, senão Tab e setas não
    // teriam onde começar: o `preventDefault` logo abaixo cancelaria a
    // mudança de foco que o clique faria sozinho.
    containerRef.current?.focus({ preventScroll: true });

    const isPanTrigger = spaceDown.current || e.button === 1;
    if (isPanTrigger) return startPan(e);

    if (tool === "draw") return startDrawStroke(e);

    if (tool === "text") {
      e.preventDefault();
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      // A cor pode ser "" (Auto): o FloatingText a resolve para
      // var(--text-primary) ao renderizar.
      const id = addText({
        x: snap(x),
        y: snap(y),
        text: "",
        size: canvasDefaultTextSize || DEFAULT_TEXT_SIZE,
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

    // Com a borracha, clicar no vazio não faz nada: abrir um marquee aqui
    // contradiz o modelo de "borracha = clique no item para apagar".
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
    if (canvasDblClickCreates === "card") {
      addCard({ x: snap(x - 110), y: snap(y - 60) });
      return;
    }
    // Duplo clique cria um texto solto: mais leve que um card para uma
    // anotação. O card continua em N, na toolbar e nos ajustes.
    const id = addText({
      x: snap(x),
      y: snap(y),
      text: "",
      size: canvasDefaultTextSize || DEFAULT_TEXT_SIZE,
      color: drawColor,
    });
    setJustCreatedTextId(id);
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
      role="application"
      tabIndex={0}
      aria-label="Canvas do projeto. Tab percorre os itens, setas movem a seleção, Enter edita, Esc sai."
      aria-describedby="canvas-keyboard-hint"
      className="canvas-surface relative w-full h-full overflow-hidden select-none"
      style={{ cursor: bgCursor }}
    >
      <p id="canvas-keyboard-hint" className="sr-only">
        Com o foco no canvas, Tab e Shift+Tab percorrem os itens em ordem de
        leitura, as setas movem a seleção, Enter abre o item para edição e
        Esc limpa a seleção e devolve o foco à página.
      </p>

      {!activeFilePath && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div
            className="text-center px-6 py-4 flex flex-col items-center gap-2"
            style={{
              color: "var(--text-secondary)",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-md)",
              fontFamily: "var(--font-ui)",
              fontSize: "0.9rem",
              fontStyle: "italic",
            }}
          >
            <span style={{ color: "var(--accent)", fontSize: 22 }} aria-hidden>
              ❦
            </span>
            {rootFolder
              ? "Abra um arquivo para ver seu canvas."
              : "Abra uma pasta para começar."}
          </div>
        </div>
      )}

      {/* Sem arquivo aberto não ha canvas pra editar — mostrar ferramentas
          sobre a mensagem de "abra uma pasta" so oferece controles inertes. */}
      {activeFilePath && (
        <>
          <CanvasToolbar />
          <CanvasSidePanel />
          <CanvasMinimap />
        </>
      )}

      {/* World container */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          width: 0,
          height: 0,
        }}
      >
        {/* Dot-grid DENTRO do mundo (move/escala via o transform do pai =
            compositor, sem repaint). Antes ficava no .canvas-surface com
            background-position atualizado a cada frame de pan — repintava
            o radial-gradient fullscreen 60x/s, causando o stutter. Agora
            é uma layer estática gigante; o pan é só translate na GPU.
            O quadrado cobre +-100k unidades de mundo (suficiente pra
            qualquer projeto real).

            `translateZ(0)` promove o grid a uma CAMADA COMPOSTA própria,
            separada da camada de conteudo (cards/setas/textos). Sem isso, os
            200000x200000px do grid inchavam a camada do container do mundo, e
            QUALQUER update dentro dela (arrastar seta/card) re-rasterizava uma
            textura gigantesca → stutter. Isolado, o conteudo re-rasteriza numa
            camada pequena e o grid só repinta em zoom. */}
        {canvasGridEnabled && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: -100000,
              top: -100000,
              width: 200000,
              height: 200000,
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--dot-grid) 1px, transparent 1px)",
              backgroundSize: `${canvasGridSize}px ${canvasGridSize}px`,
              pointerEvents: "none",
              transform: "translateZ(0)",
            }}
          />
        )}
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

        <CanvasImagesLayer />
        <CanvasCardsLayer />

        <ArrowLayer
          worldWidth={10000}
          worldHeight={10000}
          frozenPreviewPoint={
            emptyLinkMenu
              ? { x: emptyLinkMenu.worldX, y: emptyLinkMenu.worldY }
              : null
          }
        />

        <CanvasTextsLayer justCreatedTextId={justCreatedTextId} />
      </div>

      {marquee && (
        <div
          ref={marqueeRef}
          className="absolute pointer-events-none"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: "var(--marquee-fill)",
            border: "1px solid var(--marquee-stroke)",
            zIndex: 35,
          }}
        />
      )}

      {emptyLinkMenu && (
        <div
          data-canvas-link-menu
          className="absolute z-[80] min-w-40 p-1"
          style={{
            left: Math.min(emptyLinkMenu.screenX + 10, window.innerWidth - 180),
            top: Math.min(emptyLinkMenu.screenY + 10, window.innerHeight - 110),
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-ui)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full px-3 py-1.5 text-left transition-colors"
            style={{
              color: "var(--text-primary)",
              borderLeft: "3px solid transparent",
              fontSize: "0.82rem",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.borderLeftColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderLeftColor = "transparent";
            }}
            onClick={(e) => {
              e.stopPropagation();
              createLinkedItem("text");
            }}
          >
            Novo texto
          </button>
          <button
            className="block w-full px-3 py-1.5 text-left transition-colors"
            style={{
              color: "var(--text-primary)",
              borderLeft: "3px solid transparent",
              fontSize: "0.82rem",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.borderLeftColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderLeftColor = "transparent";
            }}
            onClick={(e) => {
              e.stopPropagation();
              createLinkedItem("card");
            }}
          >
            Novo card
          </button>
        </div>
      )}

      {(linkingFromId || tool === "arrow") && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 z-10"
          style={{
            background: "var(--bg-inverse)",
            color: "var(--text-inverse)",
            border: "1px solid var(--bg-inverse)",
            borderRadius: "var(--radius-pill)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.78rem",
            fontStyle: "italic",
          }}
        >
          {linkingFromId
            ? "Clique no destino ou arraste para o vazio (Esc p/ cancelar)"
            : "Clique em 2 itens para conectar (cards, textos, imagens, traços)"}
        </div>
      )}

      {tool === "eraser" && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 z-10"
          style={{
            background: "var(--danger)",
            color: "var(--text-inverse)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-pill)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.78rem",
            fontStyle: "italic",
          }}
        >
          Borracha — clique em qualquer item para apagar (V p/ voltar)
        </div>
      )}
    </div>
  );
}

const CanvasImagesLayer = memo(function CanvasImagesLayer() {
  const images = useCanvasStore((s) => s.images);
  return (
    <>
      {images.map((img) => (
        <ImageNode key={img.id} image={img} />
      ))}
    </>
  );
});

const CanvasCardsLayer = memo(function CanvasCardsLayer() {
  const cards = useCanvasStore((s) => s.cards);
  return (
    <>
      {cards.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </>
  );
});

const CanvasTextsLayer = memo(function CanvasTextsLayer({
  justCreatedTextId,
}: {
  justCreatedTextId: string | null;
}) {
  const texts = useCanvasStore((s) => s.texts);
  return (
    <>
      {texts.map((text) => (
        <FloatingText
          key={text.id}
          text={text}
          autoEdit={justCreatedTextId === text.id}
        />
      ))}
    </>
  );
});
