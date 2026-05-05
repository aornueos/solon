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
  const lineHeight = t.size * 1.25;
  let maxW = 24;
  let visualLines = 0;

  const measure = (value: string) => {
    if (ctx) return ctx.measureText(value || " ").width;
    return Math.max(24, (value || " ").length * t.size * 0.55);
  };

  if (ctx) {
    ctx.font = `${t.bold ? "700 " : ""}${t.size}px 'EB Garamond', Georgia, serif`;
  }

  for (const line of lines) {
    if (!t.width) {
      const w = measure(line || " ");
      if (w > maxW) maxW = w;
      visualLines += 1;
      continue;
    }

    const wrapped = wrapMeasuredLine(line || " ", t.width, measure);
    visualLines += wrapped.lines;
    if (wrapped.maxW > maxW) maxW = wrapped.maxW;
  }

  const w = Math.max(40, t.width ?? maxW);
  const h = Math.max(lineHeight, t.height ?? visualLines * lineHeight);
  return { x: t.x, y: t.y, w, h };
}

function wrapMeasuredLine(
  line: string,
  maxWidth: number,
  measure: (value: string) => number,
): { lines: number; maxW: number } {
  const parts = line.match(/\S+\s*|\s+/g) ?? [" "];
  let lines = 1;
  let lineW = 0;
  let maxW = 0;

  for (const part of parts) {
    const partW = measure(part);
    if (lineW > 0 && lineW + partW > maxWidth) {
      maxW = Math.max(maxW, lineW);
      lines += 1;
      lineW = 0;
    }

    if (partW <= maxWidth) {
      lineW += partW;
      continue;
    }

    for (const ch of part) {
      const chW = measure(ch);
      if (lineW > 0 && lineW + chW > maxWidth) {
        maxW = Math.max(maxW, lineW);
        lines += 1;
        lineW = 0;
      }
      lineW += chW;
    }
  }

  maxW = Math.max(maxW, lineW);
  return { lines, maxW: Math.min(maxWidth, Math.max(24, maxW)) };
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
