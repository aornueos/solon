import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { FileNode, useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument } from "../../lib/frontmatter";

interface SearchResult {
  path: string;
  name: string;
  line: number;
  snippet: string;
}

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function GlobalSearchDialog() {
  const open = useAppStore((s) => s.showGlobalSearch);
  const close = useAppStore((s) => s.closeGlobalSearch);
  const fileTree = useAppStore((s) => s.fileTree);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFile } = useFileSystem();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const files = useMemo(() => flattenFiles(fileTree), [fileTree]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const id = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchFiles(files, query);
      if (!alive) return;
      setResults(found);
      setSearching(false);
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [files, open, query]);

  if (!open) return null;

  const go = async (result: SearchResult) => {
    await openFile(result.path, result.name);
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
      className="fixed inset-0 z-[128] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgba(0,0,0,0.38)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="w-full max-w-2xl rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && results[0]) void go(results[0]);
            }}
            placeholder="Buscar no projeto..."
            className="flex-1 bg-transparent outline-none text-[0.92rem]"
            style={{ color: "var(--text-primary)" }}
          />
          <button onClick={close} aria-label="Fechar" className="p-1 rounded">
            <X size={14} />
          </button>
        </div>
        <div
          className="max-h-[460px] overflow-y-auto py-1"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {query.trim().length < 2 ? (
            <Empty text="Digite pelo menos 2 letras." />
          ) : searching ? (
            <Empty text="Buscando..." />
          ) : results.length === 0 ? (
            <Empty text="Nada encontrado." />
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.path}:${result.line}:${index}`}
                onClick={() => void go(result)}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left"
                style={{ color: "var(--text-primary)" }}
              >
                <FileText size={15} style={{ color: "var(--text-muted)", marginTop: 2 }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.82rem] font-medium truncate">
                      {result.name.replace(/\.(md|txt)$/i, "")}
                    </span>
                    <span className="text-[0.68rem]" style={{ color: "var(--text-muted)" }}>
                      linha {result.line}
                    </span>
                  </span>
                  <span className="block text-[0.74rem] truncate" style={{ color: "var(--text-secondary)" }}>
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
    <div className="px-4 py-8 text-center text-[0.8rem]" style={{ color: "var(--text-muted)" }}>
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

async function searchFiles(files: FileNode[], query: string): Promise<SearchResult[]> {
  if (!isTauri()) return [];
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const normalized = normalize(query);
  const results: SearchResult[] = [];
  // Paraleliza leitura em chunks. Antes era serie pura — projeto com
  // 200 arquivos travava o dialog uns 8-12s. Chunk de 16 da' boa
  // sobreposicao IPC sem saturar. Para cedo se atingiu 80 matches
  // (cap visual do dialog).
  const CHUNK = 16;
  outer: for (let i = 0; i < files.length; i += CHUNK) {
    const slice = files.slice(i, i + CHUNK);
    const reads = await Promise.all(
      slice.map(async (file) => {
        try {
          const raw = await readTextFile(file.path);
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
