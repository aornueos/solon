import { useEffect, useState, type MouseEvent } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Download, RotateCw, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  downloadAndInstall,
  restartApp,
  skipVersion,
} from "../../lib/updater";

const UPDATE_NOTES_SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
  FORBID_ATTR: ["style", "srcdoc", "onerror", "onload", "onclick"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

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
      setNotesHtml(DOMPurify.sanitize(raw, UPDATE_NOTES_SANITIZE_CONFIG));
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
      className="solon-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloading) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="solon-dialog w-full max-w-xl flex flex-col max-h-[80vh]"
      >
        {/* Header — "PROJETO · METADATA" no estilo da HomePage: meta-label
            em solon-caps em cima, versao em display monumental embaixo.
            Cria coerencia com a hero do app. */}
        <div className="solon-dialog-header items-start">
          <div className="min-w-0">
            <div className="solon-caps mb-1.5">
              {ready ? "Pronto pra reiniciar" : "Nova edição"}
            </div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.85rem",
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.025em",
                color: "var(--text-primary)",
              }}
            >
              Solon{" "}
              <span style={{ color: "var(--accent)" }}>
                {info.version}
              </span>
            </h2>
            <div className="solon-dialog-subtitle">
              Você está na {info.currentVersion}
              {info.date ? ` · ${formatDate(info.date)}` : ""}
            </div>
          </div>
          {!downloading && (
            <button
              onClick={close}
              title="Fechar"
              className="solon-dialog-close"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Corpo: release notes (markdown) */}
        <div
          className="px-6 py-5 overflow-y-auto flex-1 update-notes"
          style={{ color: "var(--text-primary)" }}
          onClick={handleNotesClick}
        >
          {notesHtml ? (
            <div dangerouslySetInnerHTML={{ __html: notesHtml }} />
          ) : (
            <p
              className="italic"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display)",
              }}
            >
              Sem notas de lançamento.
            </p>
          )}
        </div>

        {/* Footer: progresso + acoes */}
        <div
          className="px-5 py-3.5"
          style={{ borderTop: "2px solid var(--border-strong)" }}
        >
          {downloading && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="solon-caps">Baixando…</span>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    color: "var(--text-primary)",
                  }}
                >
                  {progressPct}%
                </span>
              </div>
              <div
                className="h-[3px] overflow-hidden"
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-strong)",
                }}
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
                <button onClick={onSkip} className="solon-btn">
                  Ignorar {info.version}
                </button>
                <button onClick={close} className="solon-btn">
                  Mais tarde
                </button>
                <button
                  onClick={onInstall}
                  className="solon-btn solon-btn--primary inline-flex items-center gap-1.5"
                >
                  <Download size={13} />
                  Atualizar agora
                </button>
              </>
            )}
            {downloading && (
              <span
                className="self-center italic"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.8rem",
                }}
              >
                Continue escrevendo — a gente avisa quando terminar.
              </span>
            )}
            {ready && (
              <>
                <button onClick={close} className="solon-btn">
                  Reiniciar depois
                </button>
                <button
                  onClick={onRestart}
                  className="solon-btn solon-btn--primary inline-flex items-center gap-1.5"
                >
                  <RotateCw size={13} />
                  Reiniciar agora
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function handleNotesClick(e: MouseEvent<HTMLDivElement>) {
  const target = e.target as HTMLElement | null;
  const link = target?.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return;

  e.preventDefault();
  const href = link.getAttribute("href") ?? "";
  if (!isSafeExternalUrl(href)) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
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
