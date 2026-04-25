/**
 * Persistência de imagens coladas no canvas.
 *
 * Estratégia:
 *  - Tauri: bytes vão pra `<root>/.solon/assets/<id>.<ext>`, e o canvas.json
 *    só guarda o path relativo ("assets/<id>.<ext>"). Display usa
 *    `readFile` → `Blob` → `URL.createObjectURL`, com cache por `src`.
 *  - Web (dev): fallback em data URL — não há disco disponível, e escrever
 *    em `localStorage` bateria em quota pra imagens médias.
 */

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const ASSETS_DIR = ".solon/assets";

function join(a: string, b: string): string {
  const sep = a.includes("\\") && !a.includes("/") ? "\\" : "/";
  return a.endsWith("/") || a.endsWith("\\") ? `${a}${b}` : `${a}${sep}${b}`;
}

function nanoid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

/** Lê um File inteiro para Uint8Array. */
async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  // Usar btoa em chunks pra não estourar stack em imagens maiores.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Persiste a imagem no projeto e retorna o `src` a ser armazenado no canvas.
 * Em Tauri: "assets/<id>.<ext>". No dev: data URL completa.
 */
export async function saveImageForCanvas(
  rootFolder: string,
  file: File,
): Promise<{ src: string; width: number; height: number }> {
  const dims = await readImageDimensions(file);
  const bytes = await fileToBytes(file);

  if (!isTauri) {
    return {
      src: bytesToDataUrl(bytes, file.type || "image/png"),
      ...dims,
    };
  }

  const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
  const dir = join(rootFolder, ASSETS_DIR);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const ext = extFromMime(file.type || "image/png");
  const rel = `assets/${nanoid()}.${ext}`;
  const full = join(rootFolder, `.solon/${rel}`);
  await writeFile(full, bytes);
  return { src: rel, ...dims };
}

async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 240, height: 160 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Cache de blob URLs por `${rootFolder}::${src}` — evita re-ler do disco a
 * cada render. Limpo em `clearImageUrlCache` ao fechar projeto.
 */
const urlCache = new Map<string, string>();

function cacheKey(root: string | null, src: string) {
  return `${root ?? ""}::${src}`;
}

function mimeFromExt(src: string): string {
  const lower = src.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

/**
 * Resolve o `src` de uma `CanvasImage` para uma URL exibível em `<img>`.
 * Retorna null se o arquivo desapareceu.
 */
export async function resolveImageUrl(
  rootFolder: string | null,
  src: string,
): Promise<string | null> {
  if (src.startsWith("data:")) return src;
  if (!isTauri || !rootFolder) return null;

  const key = cacheKey(rootFolder, src);
  const cached = urlCache.get(key);
  if (cached) return cached;

  try {
    const { readFile, exists } = await import("@tauri-apps/plugin-fs");
    const full = join(rootFolder, `.solon/${src}`);
    if (!(await exists(full))) return null;
    const bytes = await readFile(full);
    const blob = new Blob([bytes], { type: mimeFromExt(src) });
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  } catch (err) {
    console.error("Erro ao carregar imagem do canvas:", err);
    return null;
  }
}

export function clearImageUrlCache() {
  for (const url of urlCache.values()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  urlCache.clear();
}
