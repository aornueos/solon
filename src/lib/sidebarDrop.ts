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

/**
 * Pasta-mãe preservando o separador original do caminho — `moveItem`
 * monta o destino com ele, então `C:\proj\a.md` tem que virar `C:\proj`
 * e não `c:/proj`.
 */
export function rawParentPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}

export type SidebarDropTarget =
  /** Soltar dentro de uma pasta (inclui a raiz do projeto). */
  | { kind: "folder"; path: string }
  /** Reordenar entre irmãos: o item arrastado entra antes de `path`. */
  | { kind: "reorder"; path: string }
  /** Soltar no canvas cria um card de cena apontando pra nota. */
  | { kind: "canvas" };

/** O que está sob o cursor, já lido do DOM. */
export interface SidebarDropProbe {
  row?: { path: string; type: "file" | "folder" } | null;
  /** Área vazia da árvore, abaixo da última linha. */
  overTreeBackground?: boolean;
  overCanvas?: boolean;
}

/**
 * Decide o destino de um arraste na barra lateral. Vale igual para
 * arquivo e pasta; a única diferença é que só nota vira card no canvas.
 *
 *  - Sobre uma pasta: entra nela.
 *  - Sobre uma nota da MESMA pasta (só quando o arrastado é nota):
 *    reordena.
 *  - Sobre uma nota de OUTRA pasta: entra na pasta dela. É o único jeito
 *    de alcançar a raiz quando a árvore não tem espaço vazio sobrando, e
 *    é o que o gesto sugere ("solta junto desta nota").
 *  - Sobre o fundo da árvore: vai pra raiz do projeto.
 */
export function resolveSidebarDrop(
  source: { path: string; type: "file" | "folder" },
  probe: SidebarDropProbe,
  rootFolder: string | null,
  siblingPaths: string[],
): SidebarDropTarget | null {
  if (probe.overCanvas) return source.type === "file" ? { kind: "canvas" } : null;

  const row = probe.row;
  if (row) {
    if (normalizeTreePath(row.path) === normalizeTreePath(source.path)) return null;
    if (row.type === "folder") {
      return canMoveIntoFolder(source.path, row.path)
        ? { kind: "folder", path: row.path }
        : null;
    }
    if (source.type === "file" && siblingPaths.includes(row.path)) {
      return { kind: "reorder", path: row.path };
    }
    const parent = rawParentPath(row.path);
    return canMoveIntoFolder(source.path, parent) ? { kind: "folder", path: parent } : null;
  }

  if (probe.overTreeBackground && rootFolder) {
    return canMoveIntoFolder(source.path, rootFolder)
      ? { kind: "folder", path: rootFolder }
      : null;
  }
  return null;
}
