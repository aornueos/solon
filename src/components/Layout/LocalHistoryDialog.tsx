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
      className="fixed inset-0 z-[125] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.42)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historico local"
        className="w-full max-w-3xl rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Clock size={15} style={{ color: "var(--text-muted)" }} />
            <h2 className="text-[0.78rem] font-semibold">Histórico local</h2>
          </div>
          <button onClick={close} aria-label="Fechar" className="p-1 rounded">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-[240px_1fr] min-h-[420px]">
          <div
            className="overflow-y-auto p-2"
            style={{ borderRight: "1px solid var(--border-subtle)" }}
          >
            {loading ? (
              <div className="px-2 py-6 text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="px-2 py-6 text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                Nenhum snapshot ainda.
              </div>
            ) : (
              items.map((item) => {
                const active = selected?.path === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => setSelected(item)}
                    className="w-full text-left rounded px-2 py-2 mb-1"
                    style={{
                      background: active ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span className="block text-[0.78rem]">{item.label}</span>
                    <span className="block text-[0.66rem]" style={{ color: "var(--text-muted)" }}>
                      {(item.size / 1024).toFixed(1)} KB
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-4 flex flex-col min-w-0">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
                  {activeFileName ?? "Arquivo ativo"}
                </div>
                <h3 className="font-serif text-lg truncate">
                  {preview?.title ?? "Selecione um snapshot"}
                </h3>
                {preview && (
                  <div className="text-[0.68rem]" style={{ color: "var(--text-muted)" }}>
                    {preview.words.toLocaleString("pt-BR")} palavras
                  </div>
                )}
              </div>
              <button
                onClick={restore}
                disabled={!selected}
                className="inline-flex items-center gap-2 px-3 py-1 rounded text-[0.78rem] disabled:opacity-40"
                style={{
                  background: "var(--bg-inverse)",
                  color: "var(--text-inverse)",
                }}
              >
                <RotateCcw size={13} />
                Restaurar
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto rounded p-3 font-serif text-[0.92rem] leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
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
