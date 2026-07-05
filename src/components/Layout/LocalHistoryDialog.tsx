import { useEffect, useState } from "react";
import { Clock, RotateCcw, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  LocalSnapshot,
  listSnapshots,
  previewSnapshot,
  restoreSnapshot,
} from "../../lib/localHistory";
import { parseDocument } from "../../lib/frontmatter";
import { isProjectNotePath } from "../../lib/pathSecurity";

export function LocalHistoryDialog() {
  const open = useAppStore((s) => s.showLocalHistory);
  const close = useAppStore((s) => s.closeLocalHistory);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const setSaveStatus = useAppStore((s) => s.setSaveStatus);
  const pushToast = useAppStore((s) => s.pushToast);
  const [items, setItems] = useState<LocalSnapshot[]>([]);
  const [selected, setSelected] = useState<LocalSnapshot | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    body: string;
    words: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPreview(null);
    setLoading(true);
    listSnapshots(rootFolder, activeFilePath)
      .then((snapshots) => {
        if (!alive) return;
        setItems(snapshots);
        setSelected(snapshots[0] ?? null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeFilePath, open, rootFolder]);

  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    let alive = true;
    previewSnapshot(selected.path).then((next) => {
      if (alive) setPreview(next);
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  if (!open) return null;

  const restore = async () => {
    if (!activeFilePath || !selected) return;
    if (!isProjectNotePath(rootFolder, activeFilePath)) return;
    const raw = await restoreSnapshot(activeFilePath, selected.path);
    const { meta, body } = parseDocument(raw);
    setActiveFile(
      activeFilePath,
      activeFileName ?? activeFilePath.split(/[\\/]/).pop() ?? activeFilePath,
      body,
      meta,
    );
    setSaveStatus("saved");
    pushToast("success", "Snapshot restaurado.");
    close();
  };

  return (
    <div
      className="solon-dialog-overlay fixed inset-0 z-[125] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historico local"
        className="solon-dialog w-full max-w-3xl overflow-hidden"
      >
        <div className="solon-dialog-header">
          <div className="flex items-center gap-2.5">
            <Clock size={15} style={{ color: "var(--accent)" }} />
            <span className="solon-dialog-title">Histórico</span>
          </div>
          <button onClick={close} aria-label="Fechar" className="solon-dialog-close">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-[260px_1fr] min-h-[420px]">
          <div
            className="overflow-y-auto p-2"
            style={{ borderRight: "1px solid var(--border-subtle)" }}
          >
            {loading ? (
              <div
                className="px-2 py-6 text-center italic"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.82rem",
                }}
              >
                carregando…
              </div>
            ) : items.length === 0 ? (
              <div
                className="px-2 py-6 text-center italic"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.82rem",
                }}
              >
                nenhum snapshot ainda.
              </div>
            ) : (
              items.map((item) => {
                const active = selected?.path === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => setSelected(item)}
                    className="w-full text-left px-2.5 py-2 mb-0.5 transition-colors"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      color: active ? "var(--accent)" : "var(--text-primary)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span
                      className="block"
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: "0.82rem",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      {item.label}
                    </span>
                    {item.size > 0 && (
                      <span className="solon-caps--sm block mt-0.5">
                        {item.size < 1024
                          ? `${item.size} B`
                          : `${(item.size / 1024).toFixed(1)} KB`}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="p-4 flex flex-col min-w-0">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="solon-caps--sm">
                  {activeFileName ?? "Arquivo ativo"}
                </div>
                <h3
                  className="truncate mt-0.5"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {preview?.title ?? "Selecione um snapshot"}
                </h3>
                {preview && (
                  <div
                    className="mt-0.5"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-ui)",
                      fontStyle: "italic",
                      fontSize: "0.78rem",
                    }}
                  >
                    {preview.words.toLocaleString("pt-BR")} palavras
                  </div>
                )}
              </div>
              <button
                onClick={restore}
                disabled={!selected}
                className="solon-btn solon-btn--primary inline-flex items-center gap-2 disabled:opacity-40"
              >
                <RotateCcw size={13} />
                Restaurar
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-ui)",
                fontSize: "0.92rem",
              }}
            >
              {preview?.body || "Sem prévia."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
