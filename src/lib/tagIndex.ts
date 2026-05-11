/**
 * Indexador de tags do projeto inteiro.
 *
 * Le todos os `.md`/`.txt` do projeto, parseia frontmatter e coleta as
 * tags. Roda sob demanda (quando o user abre o popup de filtro) — nao
 * vive em background pra evitar custo de I/O constante.
 *
 * O resultado eh um Map<path, tags[]>. Quem precisa da lista de tags
 * unicas pode reduzir do Map.
 *
 * Paralelizado em chunks de 16 (mesmo padrao da HomePage/GlobalSearch).
 */
import { parseDocument } from "./frontmatter";
import type { FileNode } from "../store/useAppStore";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const CHUNK = 16;

export type TagIndex = Map<string, string[]>;

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) out.push(...flatten(n.children));
  }
  return out;
}

/**
 * Indexa tags de toda a fileTree. Arquivos sem tags ficam fora do map
 * (size do map = numero de arquivos *com* ao menos uma tag), o que
 * facilita os reducers de lista unica.
 */
export async function buildTagIndex(tree: FileNode[]): Promise<TagIndex> {
  const result: TagIndex = new Map();
  if (!isTauri) return result;
  const files = flatten(tree).filter((f) =>
    /\.(md|txt)$/i.test(f.name),
  );
  if (files.length === 0) return result;
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    for (let i = 0; i < files.length; i += CHUNK) {
      const slice = files.slice(i, i + CHUNK);
      const reads = await Promise.all(
        slice.map(async (f) => {
          try {
            const raw = await readTextFile(f.path);
            const { meta } = parseDocument(raw);
            const tags = Array.isArray(meta.tags)
              ? meta.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
              : [];
            return { path: f.path, tags };
          } catch {
            return null;
          }
        }),
      );
      for (const entry of reads) {
        if (entry && entry.tags.length > 0) {
          result.set(entry.path, entry.tags);
        }
      }
    }
  } catch {
    /* best-effort */
  }
  return result;
}

/**
 * Reduz o index pra lista alfabetica de tags unicas, com contagem.
 */
export function uniqueTags(index: TagIndex): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tags of index.values()) {
    for (const t of tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) =>
      a.tag.localeCompare(b.tag, "pt-BR", { sensitivity: "base" }),
    );
}

/**
 * Lista paths que tem uma dada tag. Caller usa pra montar a view
 * filtrada do sidebar.
 */
export function pathsForTag(index: TagIndex, tag: string): string[] {
  const lower = tag.toLowerCase();
  const out: string[] = [];
  for (const [path, tags] of index) {
    if (tags.some((t) => t.toLowerCase() === lower)) out.push(path);
  }
  return out;
}
