import type { CanvasText } from "../types/canvas";
import { useCanvasStore } from "../store/useCanvasStore";

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Cache do contexto 2d pra medir texto. Reaproveitado entre chamadas
 * pra evitar criar elemento canvas a cada bbox de texto.
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === "undefined") {
    measureCtx = null;
    return null;
  }
  const el = document.createElement("canvas");
  measureCtx = el.getContext("2d");
  return measureCtx;
}

/**
 * Bbox real de um FloatingText. Usa Canvas2D `measureText` na mesma
 * fonte/peso/tamanho do FloatingText, igualando ao pixel a largura
 * renderizada. Fallback heuristico se canvas2d nao estiver disponivel.
 */
export function textRect(t: CanvasText): Rect {
  const lines = (t.text || " ").split("\n");
  const ctx = getMeasureCtx();
  let maxW = 24;
  if (ctx) {
    ctx.font = `${t.bold ? "700 " : ""}${t.size}px 'EB Garamond', Georgia, serif`;
    for (const line of lines) {
      const m = ctx.measureText(line || " ");
      if (m.width > maxW) maxW = m.width;
    }
  } else {
    const maxChars = Math.max(1, ...lines.map((l) => l.length));
    maxW = Math.max(24, maxChars * t.size * 0.55);
  }
  const h = Math.max(t.size * 1.35, lines.length * t.size * 1.35);
  return { x: t.x, y: t.y, w: maxW, h };
}

/**
 * Resolve qualquer id selecionavel para um Rect em world coords. Usado
 * pelo ArrowLayer pra rotear setas que comecam/terminam em textos ou
 * imagens (nao so cards). Retorna `null` quando o id nao corresponde a
 * nada que tenha bbox util (arrows nao tem; strokes ignoramos por agora
 * porque ancorar seta em traço de caneta nao tem semantica clara).
 */
export function getEntityRect(id: string): Rect | null {
  const s = useCanvasStore.getState();
  const c = s.cards.find((x) => x.id === id);
  if (c) return { x: c.x, y: c.y, w: c.w, h: c.h };
  const im = s.images.find((x) => x.id === id);
  if (im) return { x: im.x, y: im.y, w: im.w, h: im.h };
  const t = s.texts.find((x) => x.id === id);
  if (t) return textRect(t);
  return null;
}
