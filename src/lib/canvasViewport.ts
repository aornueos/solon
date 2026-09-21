import { useCanvasStore } from "../store/useCanvasStore";
import type { CanvasViewport } from "../types/canvas";
import { Rect, strokeRect, textRect } from "./canvasGeom";

/**
 * Retângulo da superfície do canvas na tela. Todo cálculo de viewport
 * (`viewport.x/y`) é relativo a este retângulo, não à janela: o canvas
 * divide a tela com sidebar, titlebar e status bar.
 */
export function canvasSurfaceRect(from?: Element | null): DOMRect | null {
  if (typeof document === "undefined") return null;
  const surface =
    from?.closest(".canvas-surface") ??
    document.querySelector(".canvas-surface");
  return surface instanceof HTMLElement ? surface.getBoundingClientRect() : null;
}

/** Tamanho da superfície, com a janela como último recurso. */
function surfaceSize(rect: DOMRect | null): { w: number; h: number } {
  if (rect) return { w: rect.width, h: rect.height };
  if (typeof window === "undefined") return { w: 0, h: 0 };
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Converte coordenadas de tela (clientX/clientY) para a superfície. */
export function clientToSurface(
  clientX: number,
  clientY: number,
  rect: DOMRect | null,
): { x: number; y: number } {
  if (!rect) return { x: clientX, y: clientY };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** Caixas de todas as entidades com geometria — a base do enquadramento. */
export function contentBoxes(): Rect[] {
  const { cards, images, texts, strokes } = useCanvasStore.getState();
  const boxes: Rect[] = [];
  for (const card of cards) {
    boxes.push({ x: card.x, y: card.y, w: card.w, h: card.h });
  }
  for (const image of images) {
    boxes.push({ x: image.x, y: image.y, w: image.w, h: image.h });
  }
  for (const text of texts) boxes.push(textRect(text));
  for (const stroke of strokes) {
    const box = strokeRect(stroke);
    if (box) boxes.push(box);
  }
  return boxes;
}

const FIT_PADDING = 80;
const FIT_MIN_ZOOM = 0.15;
const FIT_MAX_ZOOM = 1.2;

/**
 * Viewport que enquadra todo o conteúdo dentro de `surface`. Retorna o
 * viewport neutro quando o canvas está vazio. Única implementação: atalho,
 * toolbar e painel precisam concordar no mesmo enquadramento.
 */
export function fitAllViewport(surface: DOMRect | null): CanvasViewport {
  const boxes = contentBoxes();
  if (boxes.length === 0) return { x: 0, y: 0, zoom: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }

  const w = maxX - minX + FIT_PADDING * 2;
  const h = maxY - minY + FIT_PADDING * 2;
  const { w: screenW, h: screenH } = surfaceSize(surface);
  const zoom = Math.min(
    FIT_MAX_ZOOM,
    Math.max(FIT_MIN_ZOOM, Math.min(screenW / w, screenH / h)),
  );
  return {
    zoom,
    x: -(minX - FIT_PADDING) * zoom + (screenW - w * zoom) / 2,
    y: -(minY - FIT_PADDING) * zoom + (screenH - h * zoom) / 2,
  };
}

/** Passo de zoom ancorado no centro da superfície. */
export function zoomStep(direction: 1 | -1, from?: Element | null) {
  const { w, h } = surfaceSize(canvasSurfaceRect(from));
  useCanvasStore.getState().zoomAt(w / 2, h / 2, direction * 200);
}

/**
 * Vai para um nível de zoom exato mantendo o que está no centro da tela.
 * Diferente de resetar o viewport, que joga a vista de volta à origem do
 * mundo e faz o usuário perder o lugar onde estava.
 */
export function zoomToLevel(level: number, from?: Element | null) {
  const { w, h } = surfaceSize(canvasSurfaceRect(from));
  const { viewport, setViewport } = useCanvasStore.getState();
  const worldCx = (w / 2 - viewport.x) / viewport.zoom;
  const worldCy = (h / 2 - viewport.y) / viewport.zoom;
  setViewport({
    zoom: level,
    x: w / 2 - worldCx * level,
    y: h / 2 - worldCy * level,
  });
}
