import type { CanvasStroke, CanvasText } from "../types/canvas";
import { EDITOR_FONT_FAMILIES, useAppStore } from "../store/useAppStore";

export type Rect = { x: number; y: number; w: number; h: number };

/** Contexto 2d reaproveitado entre medições, para não criar um elemento
 *  canvas a cada bbox de texto. */
let measureCtx: CanvasRenderingContext2D | null | undefined;

function getCanvasTextFontFamily(): string {
  const editorFontFamily = useAppStore.getState().editorFontFamily;
  return (
    EDITOR_FONT_FAMILIES.find((option) => option.value === editorFontFamily)?.css ??
    EDITOR_FONT_FAMILIES[0].css
  );
}

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
 * Bbox de um texto flutuante. Mede com `measureText` na mesma fonte, peso
 * e tamanho usados na renderização, então a largura bate ao pixel. Cai
 * numa heurística por contagem de caracteres se o canvas 2d faltar.
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
    ctx.font = `${t.bold ? "700 " : "500 "}${t.size}px ${getCanvasTextFontFamily()}`;
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

export function strokeRect(stroke: CanvasStroke): Rect | null {
  if (stroke.points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < stroke.points.length; i += 2) {
    const x = stroke.points[i];
    const y = stroke.points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const pad = Math.max(8, stroke.width / 2 + 4);
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(16, maxX - minX + pad * 2),
    h: Math.max(16, maxY - minY + pad * 2),
  };
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

