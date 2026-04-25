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
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 px-3 py-2 rounded-md shadow-lg text-[0.78rem] animate-in fade-in slide-in-from-right-4"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            // Borda esquerda como accent de severidade
            borderLeftWidth: 3,
            borderLeftColor:
              t.kind === "error"
                ? "var(--danger, #a04040)"
                : t.kind === "success"
                ? "var(--success, #6b8e4e)"
                : "var(--accent)",
          }}
        >
          <span className="mt-0.5 flex-shrink-0" aria-hidden>
            {t.kind === "error" ? (
              <AlertCircle size={14} style={{ color: "var(--danger, #a04040)" }} />
            ) : t.kind === "success" ? (
              <CheckCircle2 size={14} style={{ color: "var(--success, #6b8e4e)" }} />
            ) : (
              <Info size={14} style={{ color: "var(--accent)" }} />
            )}
          </span>
          <span className="flex-1 leading-relaxed">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Fechar notificação"
            className="flex-shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
