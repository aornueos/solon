import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, Search, X } from "lucide-react";
import { FileNode, useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument, serializeDocument } from "../../lib/frontmatter";

interface SearchResult {
  kind: "file" | "folder" | "content";
  path: string;
  name: string;
  line?: number;
  snippet: string;
}

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function GlobalSearchDialog() {
  const open = useAppStore((s) => s.showGlobalSearch);
  const close = useAppStore((s) => s.closeGlobalSearch);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const fileBody = useAppStore((s) => s.fileBody);
  const sceneMeta = useAppStore((s) => s.sceneMeta);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setFileTree = useAppStore((s) => s.setFileTree);
  const { openFile } = useFileSystem();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const files = useMemo(() => flattenFiles(fileTree), [fileTree]);
  const folders = useMemo(() => flattenFolders(fileTree), [fileTree]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    contentCacheRef.current.clear();
  }, [fileTree]);

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setResults([]);
      return;
    }
    let alive = true;
    const id = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchProject(
        files,
        folders,
        query,
        contentCacheRef.current,
        activeFilePath,
        activeFilePath ? serializeDocument(sceneMeta, fileBody) : null,
      );
      if (!alive) return;
      setResults(found);
      setSearching(false);
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [activeFilePath, fileBody, files, folders, open, query, sceneMeta]);

  if (!open) return null;

  const go = async (result: SearchResult) => {
    if (result.kind === "folder") {
      setFileTree(expandFolderPath(useAppStore.getState().fileTree, result.path));
      useAppStore.setState({ isSidebarOpen: true });
      close();
      return;
    }
    await openFile(result.path, result.name, { tab: "replace" });
    setActiveView("editor");
    close();
    window.setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent("solon:find-open", { detail: { query } }),
      );
    }, 120);
  };

  return (
    <div
      className="solon-dialog-overlay fixed inset-0 z-[128] flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="solon-dialog w-full max-w-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Search size={16} style={{ color: "var(--accent)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && results[0]) void go(results[0]);
            }}
            placeholder="Buscar no projeto…"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "1rem",
              letterSpacing: "-0.005em",
            }}
          />
          <button onClick={close} aria-label="Fechar" className="solon-dialog-close">
            <X size={14} />
          </button>
        </div>
        <div
          className="max-h-[460px] overflow-y-auto py-1"
          style={{ borderTop: "2px solid var(--border-strong)" }}
        >
          {query.trim().length < 1 ? (
            <Empty text="Digite para buscar notas, pastas e conteúdo." />
          ) : searching ? (
            <Empty text="Buscando…" />
          ) : results.length === 0 ? (
            <Empty text="Nada encontrado." />
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.path}:${result.line}:${index}`}
                onClick={() => void go(result)}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
                style={{
                  color: "var(--text-primary)",
                  borderLeft: "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.borderLeftColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderLeftColor = "transparent";
                }}
              >
                {result.kind === "folder" ? (
                  <FolderOpen size={15} style={{ color: "var(--text-muted)", marginTop: 3 }} />
                ) : (
                  <FileText size={15} style={{ color: "var(--text-muted)", marginTop: 3 }} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="truncate"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.88rem",
                        fontWeight: 600,
                      }}
                    >
                      {result.name.replace(/\.(md|txt)$/i, "")}
                    </span>
                    {result.line && (
                      <span
                        className="solon-caps--sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        linha {result.line}
                      </span>
                    )}
                  </span>
                  <span
                    className="block text-[0.76rem] truncate italic"
                    style={{
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {result.snippet}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="px-4 py-8 text-center"
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
        fontSize: "0.82rem",
      }}
    >
      {text}
    </div>
  );
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file" && /\.(md|txt)$/i.test(node.name)) out.push(node);
    if (node.children) out.push(...flattenFiles(node.children));
  }
  return out;
}

function flattenFolders(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "folder") out.push(node);
    if (node.children) out.push(...flattenFolders(node.children));
  }
  return out;
}

function expandFolderPath(nodes: FileNode[], path: string): FileNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.path === path && node.type === "folder") {
      changed = true;
      return { ...node, expanded: true };
    }
    if (!node.children) return node;
    const children = expandFolderPath(node.children, path);
    if (children !== node.children) {
      changed = true;
      return { ...node, expanded: true, children };
    }
    return node;
  });
  return changed ? next : nodes;
}

async function searchProject(
  files: FileNode[],
  folders: FileNode[],
  query: string,
  contentCache: Map<string, string>,
  activeFilePath: string | null,
  activeRaw: string | null,
): Promise<SearchResult[]> {
  const normalized = normalize(query);
  const results: SearchResult[] = [];
  let folderMatches = 0;
  for (const folder of folders) {
    if (!normalize(`${folder.name} ${folder.path}`).includes(normalized)) continue;
    if (folderMatches >= 8) continue;
    results.push({
      kind: "folder",
      path: folder.path,
      name: folder.name,
      snippet: compactPath(folder.path),
    });
    folderMatches += 1;
  }
  let fileMatches = 0;
  for (const file of files) {
    if (!normalize(`${file.name} ${file.path}`).includes(normalized)) continue;
    if (fileMatches >= 16) continue;
    results.push({
      kind: "file",
      path: file.path,
      name: file.name,
      snippet: compactPath(file.path),
    });
    fileMatches += 1;
  }
  if (!isTauri() || normalized.length < 2) return results.slice(0, 80);
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const CHUNK = 16;
  outer: for (let i = 0; i < files.length; i += CHUNK) {
    const slice = files.slice(i, i + CHUNK);
    const reads = await Promise.all(
      slice.map(async (file) => {
        try {
          let raw =
            file.path === activeFilePath && activeRaw !== null
              ? activeRaw
              : contentCache.get(file.path);
          if (raw === undefined) {
            raw = await readTextFile(file.path);
            contentCache.set(file.path, raw);
          }
          return { file, raw };
        } catch {
          return null;
        }
      }),
    );
    for (const entry of reads) {
      if (!entry) continue;
      const { file, raw } = entry;
      const { body, meta } = parseDocument(raw);
      const searchable = [meta.synopsis, meta.pov, meta.location, body]
        .filter(Boolean)
        .join("\n");
      const lines = searchable.split(/\r?\n/);
      for (let j = 0; j < lines.length && results.length < 80; j += 1) {
        const line = lines[j].trim();
        if (!line || !normalize(line).includes(normalized)) continue;
        results.push({
          kind: "content",
          path: file.path,
          name: file.name,
          line: j + 1,
          snippet: line.length > 180 ? `${line.slice(0, 177)}...` : line,
        });
      }
      if (results.length >= 80) break outer;
    }
  }
  return results;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}
