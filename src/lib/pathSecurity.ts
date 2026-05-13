export const NOTE_FILE_RE = /\.(md|txt)$/i;

const INVALID_ENTRY_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isInsideProject(rootFolder: string | null, path: string): boolean {
  if (!rootFolder || !path) return false;
  const root = normalizeProjectPath(rootFolder).toLowerCase();
  const target = normalizeProjectPath(path).toLowerCase();
  return target === root || target.startsWith(`${root}/`);
}

export function isProjectNotePath(rootFolder: string | null, path: string): boolean {
  return isInsideProject(rootFolder, path) && NOTE_FILE_RE.test(path);
}

export function isSafeEntryName(name: string, kind: "file" | "folder"): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return false;
  if (trimmed !== name || INVALID_ENTRY_CHARS.test(trimmed)) return false;
  if (trimmed.endsWith(".")) return false;
  if (RESERVED_WINDOWS_NAMES.test(trimmed)) return false;
  return kind === "folder" || NOTE_FILE_RE.test(trimmed);
}

export function assertInsideProject(
  rootFolder: string | null,
  path: string,
  label = "Caminho",
): void {
  if (!isInsideProject(rootFolder, path)) {
    throw new Error(`${label} fora da pasta do projeto.`);
  }
}

export function assertProjectNotePath(
  rootFolder: string | null,
  path: string,
  label = "Arquivo",
): void {
  if (!isProjectNotePath(rootFolder, path)) {
    throw new Error(`${label} deve ser uma nota .md/.txt dentro do projeto.`);
  }
}
