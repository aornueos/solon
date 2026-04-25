import { CanvasDoc, EMPTY_CANVAS } from "../types/canvas";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Cada arquivo `.md` tem seu próprio canvas como sidecar `<file>.canvas.json`
 * ao lado do original. Sobrevive a moves/renames via filesystem ops do
 * próprio app e é git-friendly (não esconde estado em pastas ocultas).
 *
 * Trade-off: poluição do diretório com arquivos `.canvas.json`. Aceitável
 * porque são legíveis, ficam próximos do arquivo-fonte e o Explorer do
 * Solon filtra extensões não-.md/.txt por padrão.
 */
export function canvasPathFor(filePath: string): string {
  return `${filePath}.canvas.json`;
}

/** Carrega o sidecar canvas.json do arquivo ou retorna EMPTY_CANVAS. */
export async function loadCanvas(filePath: string): Promise<CanvasDoc> {
  if (!isTauri) {
    try {
      const raw = localStorage.getItem(`solon:canvas:${filePath}`);
      if (raw) return normalize(JSON.parse(raw));
    } catch {}
    return { ...EMPTY_CANVAS };
  }
  try {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    const full = canvasPathFor(filePath);
    if (!(await exists(full))) return { ...EMPTY_CANVAS };
    const raw = await readTextFile(full);
    return normalize(JSON.parse(raw));
  } catch (err) {
    console.error("Erro ao carregar canvas:", err);
    return { ...EMPTY_CANVAS };
  }
}

export async function saveCanvas(
  filePath: string,
  doc: CanvasDoc,
): Promise<void> {
  if (!isTauri) {
    try {
      localStorage.setItem(`solon:canvas:${filePath}`, JSON.stringify(doc));
    } catch {}
    return;
  }
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(canvasPathFor(filePath), JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error("Erro ao salvar canvas:", err);
  }
}

/** Renomeia o sidecar junto com o `.md` — chamado após rename do arquivo. */
export async function renameCanvasSidecar(
  oldFilePath: string,
  newFilePath: string,
): Promise<void> {
  if (!isTauri) return;
  try {
    const { rename, exists } = await import("@tauri-apps/plugin-fs");
    const oldSidecar = canvasPathFor(oldFilePath);
    const newSidecar = canvasPathFor(newFilePath);
    if (await exists(oldSidecar)) {
      await rename(oldSidecar, newSidecar);
    }
  } catch (err) {
    console.error("Erro ao renomear sidecar canvas:", err);
  }
}

/** Remove o sidecar — chamado após delete do arquivo. */
export async function deleteCanvasSidecar(filePath: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const sidecar = canvasPathFor(filePath);
    if (await exists(sidecar)) {
      await remove(sidecar);
    }
  } catch (err) {
    console.error("Erro ao remover sidecar canvas:", err);
  }
}

function normalize(raw: any): CanvasDoc {
  const base = EMPTY_CANVAS;
  return {
    version: 1,
    cards: Array.isArray(raw?.cards) ? raw.cards : base.cards,
    arrows: Array.isArray(raw?.arrows) ? raw.arrows : base.arrows,
    texts: Array.isArray(raw?.texts) ? raw.texts : base.texts,
    strokes: Array.isArray(raw?.strokes) ? raw.strokes : base.strokes,
    images: Array.isArray(raw?.images) ? raw.images : base.images,
    viewport: {
      x: Number.isFinite(raw?.viewport?.x) ? raw.viewport.x : 0,
      y: Number.isFinite(raw?.viewport?.y) ? raw.viewport.y : 0,
      zoom:
        Number.isFinite(raw?.viewport?.zoom) && raw.viewport.zoom > 0
          ? raw.viewport.zoom
          : 1,
    },
  };
}
