/**
 * Persistencia + aplicacao de ordem manual no Sidebar.
 *
 * Schema do arquivo `.solon/order.json` na pasta raiz do projeto:
 *
 *   {
 *     "version": 1,
 *     "folders": {
 *       ".": ["cap-01.md", "cap-02.md", "personagens.md"],
 *       "parte1": ["intro.md", "cena-a.md"]
 *     }
 *   }
 *
 * Keys do `folders` sao paths relativos da raiz do projeto (`.` =
 * raiz). Values sao arrays com os nomes (basename) dos itens na ordem
 * desejada. Items NAO listados (recem-criados, renomeados sem update,
 * etc) vao pro fim em ordem alfabetica.
 *
 * Por que nomes em vez de paths absolutos? Porque o user pode
 * mover/renomear o rootFolder e a ordem continua valida (relativa). E
 * porque escrever arrays curtos com nomes e' mais legivel se o user
 * abrir o JSON manualmente.
 */
import type { FileNode } from "../store/useAppStore";

export interface SidebarOrder {
  version: 1;
  /** Map: caminho relativo da pasta (`.` = raiz) → array de nomes. */
  folders: Record<string, string[]>;
}

const ORDER_FILENAME = "order.json";
const ORDER_DIR = ".solon";

const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ !== undefined;

/**
 * Path joining tolerante a separadores Windows/Unix. Tauri readDir
 * mistura `\` e `/` dependendo do OS; comparacoes com paths construidos
 * manualmente precisam normalizar.
 */
function joinPath(...parts: string[]): string {
  // Detecta separator do primeiro path com ambos
  const first = parts[0] ?? "";
  const sep = first.includes("\\") && !first.includes("/") ? "\\" : "/";
  return parts.filter(Boolean).join(sep);
}

/**
 * Caminho relativo de `path` em relacao a `rootFolder`. Se path E' o
 * rootFolder, retorna ".". Tolera separadores misturados.
 */
export function relPath(rootFolder: string, path: string): string {
  if (path === rootFolder) return ".";
  // Normaliza separators antes de stripar
  const norm = (s: string) => s.replace(/\\/g, "/");
  const r = norm(rootFolder);
  const p = norm(path);
  if (p.startsWith(r + "/")) return p.slice(r.length + 1);
  return p; // unexpected — devolve path como veio
}

function mergeUnique(a: string[] = [], b: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...a, ...b]) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function folderKeyOrDescendant(key: string, folderKey: string): boolean {
  return key === folderKey || key.startsWith(`${folderKey}/`);
}

function replaceFolderKeyPrefix(
  key: string,
  oldFolderKey: string,
  newFolderKey: string,
): string {
  if (key === oldFolderKey) return newFolderKey;
  return `${newFolderKey}${key.slice(oldFolderKey.length)}`;
}

/**
 * Le `.solon/order.json`. Retorna ordem vazia se arquivo nao existe ou
 * e' invalido — degrada graciosamente.
 */
export async function loadOrder(rootFolder: string): Promise<SidebarOrder> {
  if (!isTauri()) return { version: 1, folders: {} };
  try {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    const orderPath = joinPath(rootFolder, ORDER_DIR, ORDER_FILENAME);
    if (!(await exists(orderPath))) {
      return { version: 1, folders: {} };
    }
    const raw = await readTextFile(orderPath);
    const parsed = JSON.parse(raw) as Partial<SidebarOrder>;
    if (
      parsed &&
      parsed.version === 1 &&
      parsed.folders &&
      typeof parsed.folders === "object"
    ) {
      // Sanity check: garante que values sao arrays de strings
      const cleanFolders: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed.folders)) {
        if (Array.isArray(v) && v.every((s) => typeof s === "string")) {
          cleanFolders[k] = v;
        }
      }
      return { version: 1, folders: cleanFolders };
    }
    return { version: 1, folders: {} };
  } catch (err) {
    console.warn("[sidebarOrder] load failed:", err);
    return { version: 1, folders: {} };
  }
}

/**
 * Grava `.solon/order.json`. Cria a pasta `.solon/` se nao existe.
 * Falhas sao logadas mas nao throw — perda do arquivo so' significa
 * que a ordem volta pro default alfabetico.
 */
export async function saveOrder(
  rootFolder: string,
  order: SidebarOrder,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const { atomicWriteTextFile } = await import("./atomicWrite");
    const dir = joinPath(rootFolder, ORDER_DIR);
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
    const orderPath = joinPath(dir, ORDER_FILENAME);
    await atomicWriteTextFile(orderPath, JSON.stringify(order, null, 2));
  } catch (err) {
    console.error("[sidebarOrder] save failed:", err);
  }
}

/**
 * Aplica a ordem manual num tree ja' construido. Pasta a pasta:
 *  1. Items na lista de ordem aparecem primeiro, na ordem listada
 *  2. Items NAO listados (novos, renomeados sem update) vao pro fim,
 *     ordem alfabetica + folders antes de files (consistente com
 *     buildFileTree default).
 *
 * Recursivo: aplica em cada folder filha tambem.
 */
export function applyOrder(
  rootFolder: string,
  tree: FileNode[],
  order: SidebarOrder,
): FileNode[] {
  return applyOrderRecursive(rootFolder, ".", tree, order);
}

function applyOrderRecursive(
  rootFolder: string,
  folderKey: string,
  nodes: FileNode[],
  order: SidebarOrder,
): FileNode[] {
  const orderList = order.folders[folderKey] ?? [];
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const used = new Set<string>();
  const ordered: FileNode[] = [];

  for (const name of orderList) {
    const node = byName.get(name);
    if (node) {
      ordered.push(node);
      used.add(name);
    }
  }

  const remaining = nodes
    .filter((n) => !used.has(n.name))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  ordered.push(...remaining);

  return ordered.map((n) => {
    if (n.type === "folder" && n.children) {
      const childKey =
        folderKey === "." ? n.name : `${folderKey}/${n.name}`;
      return {
        ...n,
        children: applyOrderRecursive(
          rootFolder,
          childKey,
          n.children,
          order,
        ),
      };
    }
    return n;
  });
}

/**
 * Reordena items dentro de uma pasta. `draggedName` deve ficar antes de
 * `targetName`. Se `targetName` e' null, vai pro FIM da lista. Se a
 * pasta nao tinha entrada na ordem, cria uma usando a ordem atual da
 * UI como base (passada via `currentSiblingNames`).
 */
export function reorderInFolder(
  order: SidebarOrder,
  folderKey: string,
  draggedName: string,
  targetName: string | null,
  currentSiblingNames: string[],
): SidebarOrder {
  // Materializa a ordem atual da pasta — usa o que ja' esta salvo, ou
  // a ordem dos siblings na UI (alfabetica se ainda nao tem custom).
  const existing = order.folders[folderKey] ?? [];
  // Garante que TODOS os siblings atuais estao representados, na ordem
  // certa: existing primeiro (pra preservar custom), seguidos de quem
  // esta na UI mas nao no existing.
  const usedSet = new Set<string>();
  const base: string[] = [];
  for (const name of existing) {
    if (currentSiblingNames.includes(name)) {
      base.push(name);
      usedSet.add(name);
    }
  }
  for (const name of currentSiblingNames) {
    if (!usedSet.has(name)) base.push(name);
  }

  // Remove o dragged
  const without = base.filter((n) => n !== draggedName);

  // Insere antes do target (ou no fim se target null)
  let nextList: string[];
  if (targetName === null) {
    nextList = [...without, draggedName];
  } else {
    const idx = without.indexOf(targetName);
    if (idx < 0) {
      nextList = [...without, draggedName];
    } else {
      nextList = [
        ...without.slice(0, idx),
        draggedName,
        ...without.slice(idx),
      ];
    }
  }

  return {
    ...order,
    folders: { ...order.folders, [folderKey]: nextList },
  };
}

/**
 * Atualiza o JSON de ordem quando um item e' renomeado. Substitui
 * `oldName` por `newName` em qualquer pasta que liste `oldName`.
 */
export function renameInOrder(
  order: SidebarOrder,
  oldName: string,
  newName: string,
  folderKey?: string,
): SidebarOrder {
  const folders: Record<string, string[]> = {};
  let changed = false;
  for (const [key, names] of Object.entries(order.folders)) {
    if (folderKey && key !== folderKey) {
      folders[key] = names;
      continue;
    }
    if (names.includes(oldName)) {
      folders[key] = names.map((n) => (n === oldName ? newName : n));
      changed = true;
    } else {
      folders[key] = names;
    }
  }
  return changed ? { ...order, folders } : order;
}

/**
 * Remove um nome de qualquer pasta na ordem (deletado/movido).
 */
export function removeFromOrder(
  order: SidebarOrder,
  name: string,
  folderKey?: string,
): SidebarOrder {
  const folders: Record<string, string[]> = {};
  let changed = false;
  for (const [key, names] of Object.entries(order.folders)) {
    if (folderKey && key !== folderKey) {
      folders[key] = names;
      continue;
    }
    if (names.includes(name)) {
      folders[key] = names.filter((n) => n !== name);
      changed = true;
    } else {
      folders[key] = names;
    }
  }
  return changed ? { ...order, folders } : order;
}

/**
 * Move as entradas internas de ordem de uma pasta quando ela e' renomeada
 * ou movida. Ex: "parte1/cap" vira "parte2/cap".
 */
export function renameFolderInOrder(
  order: SidebarOrder,
  oldFolderKey: string,
  newFolderKey: string,
): SidebarOrder {
  if (oldFolderKey === newFolderKey) return order;

  const folders: Record<string, string[]> = {};
  let changed = false;
  for (const [key, names] of Object.entries(order.folders)) {
    if (!folderKeyOrDescendant(key, oldFolderKey)) {
      folders[key] = names;
      continue;
    }

    const nextKey = replaceFolderKeyPrefix(key, oldFolderKey, newFolderKey);
    folders[nextKey] = mergeUnique(folders[nextKey], names);
    changed = true;
  }

  return changed ? { ...order, folders } : order;
}

/**
 * Remove entradas internas da pasta deletada. A entrada do item no pai deve
 * ser removida separadamente via `removeFromOrder(order, name, parentKey)`.
 */
export function removeFolderFromOrder(
  order: SidebarOrder,
  folderKey: string,
): SidebarOrder {
  const folders: Record<string, string[]> = {};
  let changed = false;
  for (const [key, names] of Object.entries(order.folders)) {
    if (folderKeyOrDescendant(key, folderKey)) {
      changed = true;
      continue;
    }
    folders[key] = names;
  }
  return changed ? { ...order, folders } : order;
}
