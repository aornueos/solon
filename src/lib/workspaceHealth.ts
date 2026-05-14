import type { FileNode } from "../store/useAppStore";
import { parseDocument } from "./frontmatter";
import { isInsideProject, isProjectNotePath } from "./pathSecurity";

export type WorkspaceHealthSeverity = "error" | "warning" | "info";

export interface WorkspaceHealthIssue {
  id: string;
  severity: WorkspaceHealthSeverity;
  title: string;
  detail: string;
  path?: string;
  name?: string;
  line?: number;
}

export interface WorkspaceHealthReport {
  scannedFiles: number;
  checkedAt: number;
  issues: WorkspaceHealthIssue[];
}

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const EXTERNAL_SRC_RE = /^(https?:|data:|blob:|mailto:|#)/i;
const WIKILINK_RE = /\[\[([^\]\n|#]+)(?:[|#][^\]\n]+)?\]\]/g;
const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function normalizeName(value: string): string {
  return value
    .replace(/\.(md|txt)$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function parentOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

function flattenNotes(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file" && /\.(md|txt)$/i.test(node.name)) out.push(node);
    if (node.children) out.push(...flattenNotes(node.children));
  }
  return out;
}

function lineForIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function resolveImagePath(rootFolder: string, notePath: string, src: string): string | null {
  const clean = decodeURIComponent(src.trim()).replace(/\\/g, "/");
  if (!clean || EXTERNAL_SRC_RE.test(clean)) return null;
  let candidate: string | null = null;
  if (clean.startsWith(".solon/assets/")) {
    candidate = joinPath(rootFolder, clean.replace(/\//g, rootFolder.includes("\\") ? "\\" : "/"));
  } else if (clean.startsWith("assets/")) {
    candidate = joinPath(joinPath(rootFolder, ".solon"), clean.replace(/\//g, rootFolder.includes("\\") ? "\\" : "/"));
  } else if (clean.startsWith("/") || /^[a-z]:\//i.test(clean)) {
    return null;
  } else {
    candidate = joinPath(parentOf(notePath), clean.replace(/\//g, notePath.includes("\\") ? "\\" : "/"));
  }
  return candidate && isInsideProject(rootFolder, candidate) ? candidate : null;
}

export async function scanWorkspaceHealth(
  rootFolder: string | null,
  fileTree: FileNode[],
): Promise<WorkspaceHealthReport> {
  if (!isTauri() || !rootFolder) {
    return { scannedFiles: 0, checkedAt: Date.now(), issues: [] };
  }

  const notes = flattenNotes(fileTree).filter((node) =>
    isProjectNotePath(rootFolder, node.path),
  );
  const noteNames = new Set(notes.map((node) => normalizeName(node.name)));
  const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
  const issues: WorkspaceHealthIssue[] = [];
  const assetChecks: Promise<void>[] = [];

  const CHUNK = 16;
  for (let i = 0; i < notes.length; i += CHUNK) {
    const slice = notes.slice(i, i + CHUNK);
    const reads = await Promise.all(
      slice.map(async (file) => {
        try {
          return { file, raw: await readTextFile(file.path) };
        } catch {
          return { file, raw: null };
        }
      }),
    );

    for (const entry of reads) {
      const { file, raw } = entry;
      if (raw === null) {
        issues.push({
          id: `read:${file.path}`,
          severity: "error",
          title: "Nota ilegível",
          detail: "O Solon não conseguiu ler este arquivo dentro do projeto.",
          path: file.path,
          name: file.name,
        });
        continue;
      }

      if (!raw.trim()) {
        issues.push({
          id: `empty:${file.path}`,
          severity: "info",
          title: "Nota vazia",
          detail: "Arquivo sem conteúdo. Pode ser intencional, mas vale revisar.",
          path: file.path,
          name: file.name,
        });
      }

      if (/^---\r?\n/.test(raw) && !/^---\r?\n[\s\S]*?\r?\n---\r?\n?/.test(raw)) {
        issues.push({
          id: `frontmatter:${file.path}`,
          severity: "warning",
          title: "Frontmatter incompleto",
          detail: "O bloco YAML começa com --- mas não tem fechamento claro.",
          path: file.path,
          name: file.name,
        });
      }

      const { body } = parseDocument(raw);
      for (const match of body.matchAll(WIKILINK_RE)) {
        const target = normalizeName(match[1]);
        if (!target || noteNames.has(target)) continue;
        issues.push({
          id: `wikilink:${file.path}:${match.index}:${target}`,
          severity: "warning",
          title: "Wikilink sem nota",
          detail: `[[${match[1].trim()}]] não aponta para uma nota existente.`,
          path: file.path,
          name: file.name,
          line: lineForIndex(body, match.index ?? 0),
        });
      }

      for (const match of body.matchAll(IMAGE_RE)) {
        const src = match[1].trim();
        const imagePath = resolveImagePath(rootFolder, file.path, src);
        if (!imagePath) continue;
        assetChecks.push(
          exists(imagePath).then((ok) => {
            if (ok) return;
            issues.push({
              id: `asset:${file.path}:${match.index}:${src}`,
              severity: "warning",
              title: "Imagem inline ausente",
              detail: src,
              path: file.path,
              name: file.name,
              line: lineForIndex(body, match.index ?? 0),
            });
          }).catch(() => {
            issues.push({
              id: `asset-read:${file.path}:${match.index}:${src}`,
              severity: "warning",
              title: "Imagem inline não verificável",
              detail: src,
              path: file.path,
              name: file.name,
              line: lineForIndex(body, match.index ?? 0),
            });
          }),
        );
      }
    }
  }

  await Promise.all(assetChecks);
  return {
    scannedFiles: notes.length,
    checkedAt: Date.now(),
    issues: issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
  };
}

function severityRank(severity: WorkspaceHealthSeverity): number {
  if (severity === "error") return 0;
  if (severity === "warning") return 1;
  return 2;
}
