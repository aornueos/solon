import {
  isSafeAssetSrc,
  resolveImageUrl,
  resolveLocalImageUrl,
  saveImageForCanvas,
} from "./canvasImages";

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

const LOCAL_IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

/**
 * Caminho no disco de uma imagem que a nota referencia por conta própria:
 * relativo à pasta da nota ("imagens/capa.png", "../fotos/a.jpg" — como o
 * Typora e o Obsidian gravam), absoluto ou `file://`. `null` para
 * endereço da web, `data:`, `blob:` e o que não é imagem.
 */
export function localImagePath(src: string, notePath: string): string | null {
  let raw = src.trim().replace(/^<(.*)>$/, "$1");
  if (!raw || /^(data|blob|https?|asset|tauri|mailto):/i.test(raw)) return null;
  if (/^file:\/\//i.test(raw)) {
    raw = safeDecode(raw.replace(/^file:\/\/(localhost)?/i, ""));
    // file:///C:/pasta/x.png → C:/pasta/x.png
    if (/^\/[A-Za-z]:[\\/]/.test(raw)) raw = raw.slice(1);
  } else {
    raw = safeDecode(raw);
  }
  if (!LOCAL_IMAGE_EXT.test(raw)) return null;
  if (raw.startsWith("/") || raw.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(raw)) return raw;

  const sep = notePath.includes("\\") && !notePath.includes("/") ? "\\" : "/";
  const dir = notePath.replace(/[\\/][^\\/]*$/, "");
  const parts = dir.split(/[\\/]/);
  for (const piece of raw.split(/[\\/]/)) {
    if (piece === "" || piece === ".") continue;
    if (piece === "..") {
      // Não sobe além da raiz do disco ("/" ou "C:").
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(piece);
  }
  return parts.join(sep);
}

function safeDecode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/**
 * Troca o `src` das imagens pelo endereço que o webview consegue mostrar.
 * O caminho escrito na nota fica em `data-solon-src` e é ele que volta
 * para o arquivo ao salvar.
 *
 * - `.solon/assets/...` (imagem colada no Solon): lida do projeto.
 * - Caminho da própria nota (relativo à pasta dela, absoluto, `file://`):
 *   lido do disco — sem isso, nota vinda do Typora/Obsidian mostrava a
 *   imagem quebrada. Precisa de `notePath`.
 */
export async function resolveEditorImageHtml(
  html: string,
  rootFolder: string | null,
  notePath?: string | null,
): Promise<string> {
  if (!html) return html;

  // SHORT-CIRCUIT: docs sem `<img>` (caso majoritario — texto puro) NAO
  // passam pelo DOMParser/innerHTML round-trip. Esse round-trip pelo
  // parser nativo do WebView reescreve detalhes do HTML (entities,
  // whitespace canonico, atributos auto-fechados) que em alguns casos
  // raros confundem o TipTap. Detectado quando user reportou bold
  // virando texto literal `**Onírica**` após trocar de aba e voltar.
  // Pular o round-trip elimina o caminho problematico pra ~99% dos
  // docs e mantem o flow rapido.
  if (!/<img\b/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const original =
        img.getAttribute("data-solon-src") || img.getAttribute("src") || "";
      const rel = rootFolder ? storageRelFromMarkdown(original) : null;
      if (rel && rootFolder) {
        const url = await resolveImageUrl(rootFolder, rel);
        if (url) {
          img.setAttribute("src", url);
          img.setAttribute("data-solon-src", `${EDITOR_ASSET_PREFIX}${rel}`);
          return;
        }
      }
      const full = notePath ? localImagePath(original, notePath) : null;
      if (!full) return;
      const url = await resolveLocalImageUrl(full);
      if (!url) return;
      img.setAttribute("src", url);
      img.setAttribute("data-solon-src", original);
    }),
  );
  return doc.body.innerHTML;
}
