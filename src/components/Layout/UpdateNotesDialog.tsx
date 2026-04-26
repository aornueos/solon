import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Download, RotateCw, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  downloadAndInstall,
  restartApp,
  skipVersion,
} from "../../lib/updater";

/**
 * Dialog de release notes + acoes do update.
 *
 * Estados visuais derivados de `updateStatus`:
 *  - `available`: mostra "Atualizar agora" + "Ignorar 0.X" + corpo das notas.
 *  - `downloading`: mostra barra de progresso, esconde acoes.
 *  - `ready`: mostra "Reiniciar agora" + "Mais tarde".
 *
 * O dialog NAO interrompe escrita — so e montado quando o user clica
 * no banner da home ou no indicator da statusbar.
 */
export function UpdateNotesDialog() {
  const show = useAppStore((s) => s.showUpdateDialog);
  const close = useAppStore((s) => s.closeUpdateDialog);
  const status = useAppStore((s) => s.updateStatus);
  const setStatus = useAppStore((s) => s.setUpdateStatus);
  const setProgress = useAppStore((s) => s.setUpdateProgress);

  // Em estados sem info (idle/checking/error), nao tem o que mostrar.
  // Renderizamos null em vez de fechar pra preservar showUpdateDialog
  // caso o status volte pra `available` (ex: re-check no fundo).
  const info =
    status.kind === "available" ||
    status.kind === "downloading" ||
    status.kind === "ready"
      ? status.info
      : null;

  // HTML sanitizado das release notes (markdown). Memoizado por versao
  // pra nao re-parsear a cada render do dialog.
  const [notesHtml, setNotesHtml] = useState<string>("");
  useEffect(() => {
    if (!info?.notes) {
      setNotesHtml("");
      return;
    }
    try {
      const raw = marked.parse(info.notes, { async: false }) as string;
      setNotesHtml(DOMPurify.sanitize(raw));
    } catch {
      // Fallback: texto cru escapado.
      const escaped = info.notes
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      setNotesHtml(`<pre>${escaped}</pre>`);
    }
  }, [info?.notes, info?.version]);

  // Atalhos: Esc fecha, Enter na `available` instala.
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [show, close]);

  if (!show || !info) return null;

  const onInstall = async () => {
    setStatus({ kind: "downloading", info, progress: 0 });
    try {
      await downloadAndInstall((pct) => setProgress(pct));
      setStatus({ kind: "ready", info });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: msg });
    }
  };

  const onSkip = () => {
    skipVersion(info.version);
    setStatus({ kind: "idle" });
    close();
  };

  const onRestart = async () => {
    await restartApp();
  };

  const downloading = status.kind === "downloading";
  const ready = status.kind === "ready";
  const progressPct = downloading ? Math.round(status.progress * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloading) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-lg shadow-xl flex flex-col max-h-[80vh]"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-5 pb-4 flex items-start justify-between gap-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <div
              className="text-[0.62rem] uppercase tracking-[0.25em] mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              {ready ? "Pronto pra reiniciar" : "Nova versão disponível"}
            </div>
            <h2
              className="font-serif text-2xl tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Solon{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {info.version}
              </span>
            </h2>
            <div
              className="text-[0.75rem] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              Você está na {info.currentVersion}
              {info.date ? ` · ${formatDate(info.date)}` : ""}
            </div>
          </div>
          {!downloading && (
            <button
              onClick={close}
              title="Fechar"
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "transparent")
              }
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Corpo: release notes (markdown) */}
        <div
          className="px-6 py-5 overflow-y-auto flex-1 update-notes"
          style={{ color: "var(--text-primary)" }}
        >
          {notesHtml ? (
            <div dangerouslySetInnerHTML={{ __html: notesHtml }} />
          ) : (
            <p
              className="font-serif italic"
              style={{ color: "var(--text-muted)" }}
            >
              Sem notas de lançamento.
            </p>
          )}
        </div>

        {/* Footer: progresso + acoes */}
        <div
          className="px-6 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {downloading && (
            <div className="mb-3">
              <div
                className="flex items-center justify-between text-[0.75rem] mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                <span>Baixando…</span>
                <span className="tabular-nums">{progressPct}%</span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: "var(--bg-hover)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${progressPct}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {status.kind === "available" && (
              <>
                <FooterBtn variant="ghost" onClick={onSkip}>
                  Ignorar {info.version}
                </FooterBtn>
                <FooterBtn variant="ghost" onClick={close}>
                  Mais tarde
                </FooterBtn>
                <FooterBtn variant="primary" onClick={onInstall}>
                  <Download size={13} />
                  Atualizar agora
                </FooterBtn>
              </>
            )}
            {downloading && (
              <span
                className="text-[0.75rem] italic self-center"
                style={{ color: "var(--text-muted)" }}
              >
                Continue escrevendo — a gente avisa quando terminar.
              </span>
            )}
            {ready && (
              <>
                <FooterBtn variant="ghost" onClick={close}>
                  Reiniciar depois
                </FooterBtn>
                <FooterBtn variant="primary" onClick={onRestart}>
                  <RotateCw size={13} />
                  Reiniciar agora
                </FooterBtn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterBtn({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "ghost" | "primary";
}) {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[0.8rem] font-medium transition-colors"
      style={{
        background: primary ? "var(--accent)" : "transparent",
        border: `1px solid ${primary ? "var(--accent)" : "var(--border)"}`,
        color: primary ? "var(--text-inverse, #fff)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (primary) {
          (e.currentTarget as HTMLElement).style.filter = "brightness(0.92)";
        } else {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          (e.currentTarget as HTMLElement).style.filter = "";
        } else {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
