import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument } from "../../lib/frontmatter";
import { markdownToHtml } from "../Editor/markdownBridge";
import { resolveEditorImageHtml } from "../../lib/editorImages";
import { assertProjectNotePath } from "../../lib/pathSecurity";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function ReferencePane({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  const rootFolder = useAppStore((s) => s.rootFolder);
  const closeSplitPane = useAppStore((s) => s.closeSplitPane);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFile } = useFileSystem();
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!isTauri) {
          setHtml(`<p>${name}</p>`);
          return;
        }
        assertProjectNotePath(rootFolder, path);
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const raw = await readTextFile(path);
        const { body } = parseDocument(raw);
        const rendered = await resolveEditorImageHtml(markdownToHtml(body), rootFolder);
        if (!cancelled) {
          setHtml(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, path, rootFolder]);

  const makeActive = async () => {
    await openFile(path, name, { tab: "replace" });
    setActiveView("editor");
  };

  return (
    <section className="h-full flex flex-col" style={{ background: "var(--bg-app)" }}>
      <div
        className="h-9 flex items-center gap-2 px-3 flex-shrink-0"
        style={{
          background: "var(--bg-panel-2)",
          borderBottom: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
      >
        <span className="text-[0.72rem] uppercase tracking-[0.18em]">Referência</span>
        <span className="text-[0.78rem] truncate flex-1" title={path}>
          {name.replace(/\.(md|txt)$/i, "")}
        </span>
        <button
          type="button"
          className="p-1 rounded"
          title="Abrir como aba ativa"
          aria-label="Abrir como aba ativa"
          onClick={makeActive}
        >
          <ExternalLink size={13} />
        </button>
        <button
          type="button"
          className="p-1 rounded"
          title="Fechar painel"
          aria-label="Fechar painel"
          onClick={closeSplitPane}
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-10">
        {error ? (
          <p className="text-[0.82rem]" style={{ color: "var(--danger)" }}>
            Não foi possível carregar a referência: {error}
          </p>
        ) : (
          <article
            className="ProseMirror solon-reference-pane max-w-[720px] mx-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </section>
  );
}
