import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Info, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import {
  scanWorkspaceHealth,
  type WorkspaceHealthIssue,
  type WorkspaceHealthReport,
} from "../../lib/workspaceHealth";

export function WorkspaceHealthDialog() {
  const open = useAppStore((s) => s.showWorkspaceHealth);
  const close = useAppStore((s) => s.closeWorkspaceHealth);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const fileTree = useAppStore((s) => s.fileTree);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const pushToast = useAppStore((s) => s.pushToast);
  const { openFile } = useFileSystem();
  const [report, setReport] = useState<WorkspaceHealthReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runScan = async () => {
    setLoading(true);
    try {
      const next = await scanWorkspaceHealth(rootFolder, fileTree);
      setReport(next);
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : "Não foi possível verificar o projeto.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void runScan();
  }, [open, rootFolder, fileTree]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const counts = useMemo(() => {
    const issues = report?.issues ?? [];
    return {
      error: issues.filter((issue) => issue.severity === "error").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
    };
  }, [report]);

  if (!open) return null;

  const openIssue = async (issue: WorkspaceHealthIssue) => {
    if (!issue.path || !issue.name) return;
    await openFile(issue.path, issue.name, { tab: "replace" });
    setActiveView("editor");
    close();
    if (issue.line) {
      window.setTimeout(() => {
        document.dispatchEvent(
          new CustomEvent("solon:find-open", { detail: { query: issue.detail } }),
        );
      }, 120);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[126] flex items-start justify-center px-4 pt-[8vh]"
      style={{ background: "rgba(0,0,0,0.42)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Saúde do projeto"
        className="w-full max-w-3xl max-h-[82vh] rounded-lg shadow-xl overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
            <div className="min-w-0">
              <h2 className="text-[0.9rem] font-medium">Saúde do projeto</h2>
              <p className="text-[0.7rem] truncate" style={{ color: "var(--text-muted)" }}>
                {report
                  ? `${report.scannedFiles} notas verificadas`
                  : "Verificando notas, links e imagens"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void runScan()}
              disabled={loading}
              title="Verificar novamente"
              className="h-8 w-8 rounded-md flex items-center justify-center disabled:opacity-50"
              style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            </button>
            <button
              onClick={close}
              title="Fechar"
              className="h-8 w-8 rounded-md flex items-center justify-center"
              style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-2 px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <Metric label="Erros" value={counts.error} tone="error" />
          <Metric label="Avisos" value={counts.warning} tone="warning" />
          <Metric label="Notas" value={counts.info} tone="info" />
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && !report ? (
            <Empty text="Verificando o projeto..." />
          ) : !report || report.issues.length === 0 ? (
            <div className="px-5 py-10 flex flex-col items-center text-center gap-2">
              <CheckCircle2 size={24} style={{ color: "var(--accent)" }} />
              <p className="text-[0.85rem]">Nada crítico encontrado.</p>
              <p className="text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
                Links internos e imagens inline parecem consistentes.
              </p>
            </div>
          ) : (
            report.issues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => void openIssue(issue)}
                className="w-full px-5 py-2.5 text-left flex items-start gap-3 transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <IssueIcon severity={issue.severity} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.82rem] font-medium">{issue.title}</span>
                    {issue.line && (
                      <span className="text-[0.66rem]" style={{ color: "var(--text-muted)" }}>
                        linha {issue.line}
                      </span>
                    )}
                  </span>
                  <span className="block text-[0.72rem] truncate" style={{ color: "var(--text-secondary)" }}>
                    {issue.detail}
                  </span>
                  {issue.name && (
                    <span className="inline-flex items-center gap-1 text-[0.66rem] mt-1" style={{ color: "var(--text-muted)" }}>
                      <FileText size={11} />
                      {issue.name}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "error" | "warning" | "info";
}) {
  const color =
    tone === "error"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--accent)"
        : "var(--text-muted)";
  return (
    <div className="rounded-md px-3 py-2" style={{ background: "var(--bg-panel-2)" }}>
      <div className="text-[0.65rem]" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[1rem] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function IssueIcon({ severity }: { severity: WorkspaceHealthIssue["severity"] }) {
  if (severity === "error") return <AlertTriangle size={15} style={{ color: "var(--danger)", marginTop: 2 }} />;
  if (severity === "warning") return <AlertTriangle size={15} style={{ color: "var(--accent)", marginTop: 2 }} />;
  return <Info size={15} style={{ color: "var(--text-muted)", marginTop: 2 }} />;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
      {text}
    </div>
  );
}
