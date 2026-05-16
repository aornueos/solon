/**
 * Indexador de backlinks (`[[wikilink]]`).
 *
 * Le todos os `.md`/`.txt` do projeto, extrai os wikilinks de cada
 * um e monta um mapa reverso: "qual target eh apontado por quais
 * arquivos". Permite o Inspector mostrar "Linkado por: 3 arquivos"
 * com lista clicavel.
 *
 * Roda on-demand (quando o user troca de arquivo ativo). Custo
 * tipico: ~20ms pra 200 arquivos. Paralelo em chunks de 16.
 *
 * Normalizacao do target: NFD + lowercase (mesmo que findFileByName
 * no Editor). Assim `[[capitulo um]]` e `[[Capítulo Um]]` apontam
 * pro mesmo arquivo.
 */
import { parseDocument } from "./frontmatter";
import type { FileNode } from "../store/useAppStore";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const CHUNK = 16;
const WIKILINK_RE = /\[\[([^\]\n]+)\]\]/g;

export interface BacklinkSource {
  path: string;
  name: string;
}

/** Mapa: target normalizado → arquivos que apontam pra ele. */
export type BacklinkIndex = Map<string, BacklinkSource[]>;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file" && /\.(md|txt)$/i.test(n.name)) out.push(n);
    if (n.children) out.push(...flatten(n.children));
  }
  return out;
}

/**
 * Constroi o index completo varrendo o projeto. Le os arquivos em
 * paralelo (chunks). Falhas individuais sao ignoradas — arquivo
 * ilegivel nao quebra o resto.
 */
export async function buildBacklinkIndex(tree: FileNode[]): Promise<BacklinkIndex> {
  const idx: BacklinkIndex = new Map();
  if (!isTauri) return idx;
  const files = flatten(tree);
  if (files.length === 0) return idx;
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    for (let i = 0; i < files.length; i += CHUNK) {
      const slice = files.slice(i, i + CHUNK);
      const reads = await Promise.all(
        slice.map(async (f) => {
          try {
            const raw = await readTextFile(f.path);
            const { body } = parseDocument(raw);
            const matches: string[] = [];
            // RegExp tem estado (lastIndex) por instancia; criamos
            // uma nova por iteracao pra evitar bug em multi-call.
            const re = new RegExp(WIKILINK_RE.source, "g");
            let m: RegExpExecArray | null;
            while ((m = re.exec(body))) {
              // Alias `[[target|exibido]]` → o backlink é pro target.
              const rawTarget = m[1].split("|")[0];
              matches.push(normalize(rawTarget));
            }
            return { file: f, targets: matches };
          } catch {
            return null;
          }
        }),
      );
      for (const entry of reads) {
        if (!entry) continue;
        const source: BacklinkSource = {
          path: entry.file.path,
          name: entry.file.name,
        };
        for (const target of entry.targets) {
          if (!target) continue;
          const list = idx.get(target);
          if (list) {
            // Evita duplicar quando o mesmo arquivo linka pro mesmo
            // target multiplas vezes.
            if (!list.some((s) => s.path === source.path)) list.push(source);
          } else {
            idx.set(target, [source]);
          }
        }
      }
    }
  } catch {
    /* best-effort */
  }
  return idx;
}

/**
 * Retorna os arquivos que linkam pro arquivo `filePath` (case-insensitive
 * pelo basename). Exclui auto-linkagem (arquivo apontando pra si mesmo).
 */
export function backlinksFor(
  index: BacklinkIndex,
  filePath: string,
): BacklinkSource[] {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const base = name.replace(/\.(md|txt)$/i, "");
  const target = normalize(base);
  const list = index.get(target) ?? [];
  return list.filter((s) => s.path !== filePath);
}
