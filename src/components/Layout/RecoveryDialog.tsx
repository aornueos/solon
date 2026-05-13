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
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recuperar rascunhos"
        className="w-full max-w-lg rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <AlertTriangle size={18} style={{ color: "var(--accent-2, #c89a3a)", marginTop: 2 }} />
          <div className="flex-1">
            <h2 className="text-[1rem] font-medium leading-snug">
              Rascunho não salvo encontrado
            </h2>
            <p
              className="text-[0.8rem] mt-1 leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {drafts.length === 1
                ? "O Solon detectou um arquivo com edições que não chegaram a ser salvas (provavelmente por um fechamento abrupto)."
                : `O Solon detectou ${drafts.length} arquivos com edições que não chegaram a ser salvas.`}{" "}
              Você pode recuperar agora ou manter a versão atual do disco.
            </p>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {drafts.map((draft) => {
            const name = draft.path.split(/[\\/]/).pop() ?? draft.path;
            const ageMin = Math.max(
              1,
              Math.floor((Date.now() - draft.savedAt) / 60000),
            );
            // Preview minusculo do body — primeiras palavras do conteudo
            // (apos parse de frontmatter) pra dar contexto sem expor o
            // doc inteiro.
            const preview = previewOf(draft.content);
            const busy = processing === draft.path;
            return (
              <div
                key={draft.path}
                className="px-5 py-3 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[0.85rem] font-medium truncate" title={draft.path}>
                    {name}
                  </div>
                  <div
                    className="text-[0.7rem] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    rascunho salvo há ~{ageMin}{ageMin === 1 ? " min" : " min"}
                  </div>
                  {preview && (
                    <div
                      className="text-[0.74rem] mt-1.5 italic line-clamp-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      "{preview}"
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => discard(draft.path)}
                    disabled={busy}
                    title="Manter versão do disco"
                    className="p-1.5 rounded transition-colors disabled:opacity-40"
                    style={{
                      background: "var(--bg-panel-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => recover(draft.path, draft.content)}
                    disabled={busy}
                    title="Recuperar este rascunho"
                    className="px-2.5 py-1.5 rounded transition-colors disabled:opacity-40 inline-flex items-center gap-1"
                    style={{
                      background: "var(--accent)",
                      color: "var(--text-inverse)",
                      border: "1px solid var(--accent)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <Check size={12} /> Recuperar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="px-5 py-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={discardAll}
            className="text-[0.78rem] hover:underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            Descartar tudo
          </button>
          <button
            type="button"
            onClick={clearDrafts}
            className="text-[0.78rem] px-3 py-1.5 rounded"
            style={{
              background: "var(--bg-panel-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
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
