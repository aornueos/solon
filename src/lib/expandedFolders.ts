/**
 * Quais pastas estavam abertas na barra lateral, por projeto.
 *
 * Sem isso o boot remontava a árvore do disco com tudo recolhido: quem
 * trabalha dentro de `Parte II/Capítulos` tinha que reabrir o caminho
 * inteiro a cada vez que o Solon abria.
 *
 * Guarda caminhos RELATIVOS à raiz (com `/`), no mesmo espírito do
 * `.solon/order.json`: mover a pasta do projeto de lugar não perde o
 * estado. Fica em localStorage e não no projeto porque é preferência de
 * quem está olhando, não do texto — não deve viajar num backup nem num
 * repositório compartilhado.
 */
import type { FileNode } from "../store/useAppStore";

const EXPANDED_FOLDERS_KEY = "solon:expandedFolders";
/** Projetos lembrados. O mais antigo sai quando passa disso. */
const MAX_PROJECTS = 24;

type StoredExpanded = Record<string, string[]>;

function toSlashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Chave do projeto: separador e caixa não podem gerar duas entradas. */
function projectKey(rootFolder: string): string {
  return toSlashes(rootFolder).toLowerCase();
}

function relativeToRoot(rootFolder: string, path: string): string | null {
  const root = toSlashes(rootFolder);
  const target = toSlashes(path);
  if (target.toLowerCase() === root.toLowerCase()) return null;
  if (!target.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return null;
  return target.slice(root.length + 1);
}

/**
 * Caminhos relativos de todas as pastas abertas da árvore, em ordem de
 * travessia. Nós fora da raiz são ignorados — acontece no instante em que
 * a raiz já trocou e a árvore ainda é a do projeto anterior.
 */
export function collectExpandedRelPaths(
  rootFolder: string,
  tree: FileNode[],
): string[] {
  const out: string[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type !== "folder") continue;
      if (node.expanded) {
        const rel = relativeToRoot(rootFolder, node.path);
        if (rel) out.push(rel);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Converte os relativos guardados em caminhos absolutos no MESMO formato
 * que a árvore usa (`buildFileTree` junta com o separador da raiz). Um
 * `\` a mais ou a menos e o `Set.has` erraria em silêncio.
 */
export function expandedAbsolutePaths(
  rootFolder: string,
  relPaths: string[],
): Set<string> {
  const sep = rootFolder.includes("\\") && !rootFolder.includes("/") ? "\\" : "/";
  const base = rootFolder.replace(/[\\/]+$/, "");
  const out = new Set<string>();
  for (const rel of relPaths) {
    const clean = rel.replace(/^[\\/]+|[\\/]+$/g, "");
    if (!clean || clean.split(/[\\/]/).some((part) => part === ".." || part === ".")) {
      continue;
    }
    out.add(`${base}${sep}${clean.split(/[\\/]/).join(sep)}`);
  }
  return out;
}

function readStored(): StoredExpanded {
  try {
    const raw = localStorage.getItem(EXPANDED_FOLDERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: StoredExpanded = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      out[key] = value.filter((v): v is string => typeof v === "string");
    }
    return out;
  } catch {
    return {};
  }
}

/** Pastas abertas da última vez neste projeto, prontas pro `buildFileTree`. */
export function loadExpandedFolders(rootFolder: string): Set<string> {
  const stored = readStored()[projectKey(rootFolder)] ?? [];
  return expandedAbsolutePaths(rootFolder, stored);
}

/** Grava as pastas abertas da árvore atual. Só escreve se algo mudou. */
export function saveExpandedFolders(rootFolder: string, tree: FileNode[]): void {
  // Árvore de outro projeto (troca de raiz em andamento): gravar agora
  // apagaria o estado do projeto novo antes de ele ser lido.
  const first = tree[0];
  if (!first || relativeToRoot(rootFolder, first.path) === null) return;

  const key = projectKey(rootFolder);
  const next = collectExpandedRelPaths(rootFolder, tree);
  const stored = readStored();
  const previous = stored[key];
  if (
    previous &&
    previous.length === next.length &&
    previous.every((rel, i) => rel === next[i])
  ) {
    return;
  }
  // Reinsere no fim: a ordem das chaves vira a ordem de uso, e o corte
  // abaixo descarta o projeto aberto há mais tempo.
  delete stored[key];
  stored[key] = next;
  const keys = Object.keys(stored);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PROJECTS))) {
    delete stored[old];
  }
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(stored));
  } catch {
    /* storage cheio ou bloqueado — perder isso não custa texto */
  }
}
