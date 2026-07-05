import { useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Stack de notificações transientes no canto inferior-direito.
 *
 * Auto-dismiss em `expiresAt` (checado por um intervalo leve de 500ms —
 * setTimeout-per-toast seria equivalente mas exige lifecycle dedicado).
 */
export function ToastLayer() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      for (const t of toasts) {
        if (t.expiresAt <= now) dismiss(t.id);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        // Faixa de severidade na borda esquerda (2px na cor do tipo);
        // resto hairline 1px, cantos suaves e sombra macia.
        const severityColor =
          t.kind === "error"
            ? "var(--danger)"
            : t.kind === "success"
            ? "var(--success)"
            : "var(--accent)";
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 px-3.5 py-2.5 animate-in fade-in slide-in-from-right-4"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderLeftWidth: 2,
              borderLeftColor: severityColor,
              borderRadius: "var(--radius)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-md)",
              fontSize: "0.84rem",
              lineHeight: 1.45,
            }}
          >
            <span className="mt-0.5 flex-shrink-0" aria-hidden>
              {t.kind === "error" ? (
                <AlertCircle size={14} style={{ color: severityColor }} />
              ) : t.kind === "success" ? (
                <CheckCircle2 size={14} style={{ color: severityColor }} />
              ) : (
                <Info size={14} style={{ color: severityColor }} />
              )}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Fechar notificação"
              className="flex-shrink-0 transition-colors flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                color: "var(--text-muted)",
                borderRadius: "var(--radius-sm)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
