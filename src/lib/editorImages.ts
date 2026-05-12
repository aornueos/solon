import { resolveImageUrl, saveImageForCanvas } from "./canvasImages";

const EDITOR_ASSET_PREFIX = ".solon/";

function storageRelFromMarkdown(src: string): string | null {
  const normalized = src.replace(/\\/g, "/");
  if (normalized.startsWith(".solon/assets/")) {
    return normalized.slice(EDITOR_ASSET_PREFIX.length);
  }
  if (normalized.startsWith("assets/")) return normalized;
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
