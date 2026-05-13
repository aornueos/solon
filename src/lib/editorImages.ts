import { isSafeAssetSrc, resolveImageUrl, saveImageForCanvas } from "./canvasImages";

const EDITOR_ASSET_PREFIX = ".solon/";

function storageRelFromMarkdown(src: string): string | null {
  const normalized = src.replace(/\\/g, "/");
  if (normalized.startsWith(".solon/assets/")) {
    const rel = normalized.slice(EDITOR_ASSET_PREFIX.length);
    return isSafeAssetSrc(rel) ? rel : null;
  }
  if (normalized.startsWith("assets/")) return isSafeAssetSrc(normalized) ? normalized : null;
  return null;
}

export async function saveImageForEditor(
  rootFolder: string,
  file: File,
): Promise<{ markdownSrc: string; displaySrc: string; width: number; height: number }> {
  const saved = await saveImageForCanvas(rootFolder, file);
  const displaySrc = (await resolveImageUrl(rootFolder, saved.src)) ?? saved.src;
  return {
    markdownSrc: `${EDITOR_ASSET_PREFIX}${saved.src}`,
    displaySrc,
    width: saved.width,
    height: saved.height,
  };
}

export async function resolveEditorImageHtml(
  html: string,
  rootFolder: string | null,
): Promise<string> {
  if (!html || !rootFolder) return html;

  // SHORT-CIRCUIT: docs sem `<img>` (caso majoritario — texto puro) NAO
  // passam pelo DOMParser/innerHTML round-trip. Esse round-trip pelo
  // parser nativo do WebView reescreve detalhes do HTML (entities,
  // whitespace canonico, atributos auto-fechados) que em alguns casos
  // raros confundem o TipTap. Detectado quando user reportou bold
  // virando texto literal `**Onírica**` apos trocar de aba e voltar.
  // Pular o round-trip elimina o caminho problematico pra ~99% dos
  // docs e mantem o flow rapido.
  if (!/<img\b/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const original =
        img.getAttribute("data-solon-src") || img.getAttribute("src") || "";
      const rel = storageRelFromMarkdown(original);
      if (!rel) return;
      const url = await resolveImageUrl(rootFolder, rel);
      if (!url) return;
      img.setAttribute("src", url);
      img.setAttribute("data-solon-src", `${EDITOR_ASSET_PREFIX}${rel}`);
    }),
  );
  return doc.body.innerHTML;
}
