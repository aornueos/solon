export function normalizeTreePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function treeParentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx > 0 ? normalized.slice(0, idx) : "";
}

export function isSameOrDescendantPath(
  targetPath: string,
  sourcePath: string,
): boolean {
  const target = normalizeTreePath(targetPath);
  const source = normalizeTreePath(sourcePath);
  return target === source || target.startsWith(`${source}/`);
}

export function canMoveIntoFolder(
  sourcePath: string | null | undefined,
  targetFolderPath: string,
): sourcePath is string {
  if (!sourcePath) return false;
  const source = normalizeTreePath(sourcePath);
  const target = normalizeTreePath(targetFolderPath);
  if (!source || !target) return false;
  if (source === target) return false;
  if (target.startsWith(`${source}/`)) return false;
  return normalizeTreePath(treeParentPath(sourcePath)) !== target;
}
