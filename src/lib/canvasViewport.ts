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

export type EntityRect = { id: string; rect: Rect };

/**
 * Toda entidade do canvas com a sua caixa, em ordem de leitura: de cima
 * para baixo e, no empate, da esquerda para a direita. É a ordem que o Tab
 * percorre, então precisa ser estável e corresponder ao que se vê.
 *
 * Setas entram pelo ponto médio entre os centros das duas pontas — sem
 * isso elas ficariam inalcançáveis por teclado.
 */
export function entityRects(): EntityRect[] {
  const { cards, images, texts, strokes, arrows } = useCanvasStore.getState();
  const out: EntityRect[] = [];
  const byId = new Map<string, Rect>();

  const push = (id: string, rect: Rect) => {
    byId.set(id, rect);
    out.push({ id, rect });
  };

  for (const card of cards) {
    push(card.id, { x: card.x, y: card.y, w: card.w, h: card.h });
  }
  for (const image of images) {
    push(image.id, { x: image.x, y: image.y, w: image.w, h: image.h });
  }
  for (const text of texts) push(text.id, textRect(text));
  for (const stroke of strokes) {
    const rect = strokeRect(stroke);
    if (rect) push(stroke.id, rect);
  }
  for (const arrow of arrows) {
    const from = byId.get(arrow.from);
    const to = byId.get(arrow.to);
    if (!from || !to) continue;
    const cx = (from.x + from.w / 2 + to.x + to.w / 2) / 2;
    const cy = (from.y + from.h / 2 + to.y + to.h / 2) / 2;
    out.push({ id: arrow.id, rect: { x: cx, y: cy, w: 0, h: 0 } });
  }

  return out.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
}

/** Caixas de tudo que ocupa área — a base do enquadramento. */
export function contentBoxes(): Rect[] {
  return entityRects()
    .filter(({ rect }) => rect.w > 0 && rect.h > 0)
    .map(({ rect }) => rect);
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

/** Margem entre o item revelado e a borda da superfície, em px de tela. */
const REVEAL_MARGIN = 48;

/**
 * Faz o pan mínimo para que `rect` (world coords) caiba na tela. No-op se
 * já estiver visível — navegar por teclado não deve mexer na vista quando
 * o próximo item já está à mostra.
 */
export function revealRect(rect: Rect, from?: Element | null) {
  const { w, h } = surfaceSize(canvasSurfaceRect(from));
  if (w === 0 || h === 0) return;
  const { viewport, setViewport } = useCanvasStore.getState();
  const { zoom } = viewport;

  const left = rect.x * zoom + viewport.x;
  const top = rect.y * zoom + viewport.y;
  const right = (rect.x + rect.w) * zoom + viewport.x;
  const bottom = (rect.y + rect.h) * zoom + viewport.y;

  let dx = 0;
  let dy = 0;
  if (left < REVEAL_MARGIN) dx = REVEAL_MARGIN - left;
  else if (right > w - REVEAL_MARGIN) dx = w - REVEAL_MARGIN - right;
  if (top < REVEAL_MARGIN) dy = REVEAL_MARGIN - top;
  else if (bottom > h - REVEAL_MARGIN) dy = h - REVEAL_MARGIN - bottom;

  if (dx === 0 && dy === 0) return;
  setViewport({ x: viewport.x + dx, y: viewport.y + dy });
}

/**
 * Próximo id na ordem de leitura a partir do que está selecionado. Dá a
 * volta nas duas pontas; sem seleção, começa pelo primeiro (ou pelo último
 * quando `step` é negativo).
 */
export function neighbourId(currentId: string | null, step: 1 | -1): string | null {
  const entities = entityRects();
  if (entities.length === 0) return null;
  const index = currentId ? entities.findIndex((e) => e.id === currentId) : -1;
  if (index === -1) return (step === 1 ? entities[0] : entities[entities.length - 1]).id;
  const next = (index + step + entities.length) % entities.length;
  return entities[next].id;
}

/** Caixa de um id, ou null quando ele não existe mais. */
export function rectOf(id: string): Rect | null {
  return entityRects().find((e) => e.id === id)?.rect ?? null;
}
