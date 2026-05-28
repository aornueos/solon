import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument } from "../../lib/frontmatter";
import { clearRecoveryDraft, purgeAllRecoveryDrafts } from "../../lib/crashRecovery";

/**
 * Dialog que aparece no boot quando ha drafts de crash recovery cujo
 * conteudo diverge do que esta no disco. Listamos cada um com nome do
 * arquivo + timestamp; user pode Recuperar (sobrescreve o .md com o
 * draft) ou Descartar (apaga o draft, mantem o .md como esta).
 *
 * Nao bloqueia o boot — fica como overlay e pode ser fechado sem
 * decidir item por item. "Manter todos" descarta todos os drafts.
 */
export function RecoveryDialog() {
  const drafts = useAppStore((s) => s.pendingRecoveryDrafts);
  const clearDrafts = useAppStore((s) => s.clearPendingRecoveryDrafts);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const pushToast = useAppStore((s) => s.pushToast);
  const { saveFile, openFile } = useFileSystem();
  const [processing, setProcessing] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  const recover = async (path: string, content: string) => {
    setProcessing(path);
    try {
      // Persiste o draft no arquivo. Apos isso, o draft eh apagado
      // automaticamente pelo `saveFile` (que chama clearRecoveryDraft).
      await saveFile(path, content);
      const remaining = drafts.filter((d) => d.path !== path);
      useAppStore.getState().setPendingRecoveryDrafts(remaining);
      // Abre o arquivo recuperado pra o user ver imediatamente.
      const name = path.split(/[\\/]/).pop() ?? path;
      await openFile(path, name, { tab: "replace" });
      pushToast("success", `Recuperado: ${name}`);
    } catch (err) {
      console.error("Erro ao recuperar draft:", err);
      pushToast("error", `Falha ao recuperar: ${describe(err)}`);
    } finally {
      setProcessing(null);
    }
  };

  const discard = async (path: string) => {
    setProcessing(path);
    try {
      await clearRecoveryDraft(rootFolder, path);
      const remaining = drafts.filter((d) => d.path !== path);
      useAppStore.getState().setPendingRecoveryDrafts(remaining);
    } finally {
      setProcessing(null);
    }
  };

  const discardAll = async () => {
    await purgeAllRecoveryDrafts(rootFolder);
    clearDrafts();
  };

  return (
    <div className="solon-dialog-overlay fixed inset-0 z-[140] flex items-center justify-center px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recuperar rascunhos"
        className="solon-dialog w-full max-w-lg overflow-hidden"
      >
        <div className="solon-dialog-header items-start">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle
              size={18}
              style={{ color: "var(--accent-2)", marginTop: 2, flexShrink: 0 }}
            />
            <div className="flex-1 min-w-0">
              <span className="solon-plaque solon-plaque--lg">Rascunhos</span>
              <p className="solon-dialog-subtitle mt-1.5">
                {drafts.length === 1
                  ? "Um arquivo com edições que não chegaram a ser salvas."
                  : `${drafts.length} arquivos com edições que não chegaram a ser salvas.`}{" "}
                Recuperar ou manter a versão do disco.
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {drafts.map((draft) => {
            const name = draft.path.split(/[\\/]/).pop() ?? draft.path;
            const ageMin = Math.max(
              1,
              Math.floor((Date.now() - draft.savedAt) / 60000),
            );
            const preview = previewOf(draft.content);
            const busy = processing === draft.path;
            return (
              <div
                key={draft.path}
                className="px-5 py-3.5 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    title={draft.path}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.92rem",
                      fontWeight: 600,
                    }}
                  >
                    {name}
                  </div>
                  <div
                    className="solon-caps--sm mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Há {ageMin} min
                  </div>
                  {preview && (
                    <div
                      className="text-[0.78rem] mt-2 line-clamp-2"
                      style={{
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-display)",
                        fontStyle: "italic",
                      }}
                    >
                      “{preview}”
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => discard(draft.path)}
                    disabled={busy}
                    title="Manter versão do disco"
                    className="solon-btn disabled:opacity-40"
                    style={{ padding: "0.4rem 0.6rem" }}
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => recover(draft.path, draft.content)}
                    disabled={busy}
                    title="Recuperar este rascunho"
                    className="solon-btn solon-btn--primary disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    <Check size={12} /> Recuperar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="solon-dialog-actions justify-between">
          <button
            type="button"
            onClick={discardAll}
            className="solon-btn solon-btn--danger"
          >
            Descartar tudo
          </button>
          <button
            type="button"
            onClick={clearDrafts}
            className="solon-btn"
          >
            Decidir depois
          </button>
        </div>
      </div>
    </div>
  );
}

function previewOf(content: string): string {
  try {
    const { body } = parseDocument(content);
    const text = body.replace(/^#+\s+/gm, "").trim();
    const slice = text.slice(0, 140).replace(/\s+/g, " ");
    return slice.length < text.length ? `${slice}…` : slice;
  } catch {
    return "";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "erro desconhecido";
}
