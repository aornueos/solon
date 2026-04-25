import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";

/**
 * Overlay modal que substitui `window.prompt` e `window.confirm`.
 *
 * O dialog fica "latente" na store (`activeDialog`) e é consumido aqui.
 * A store guarda a função `resolve` da Promise retornada por
 * `openPrompt` / `openConfirm`; o DialogLayer chama `closeDialog(value)`
 * quando o usuário decide (Enter/click confirm → value; Esc/click cancel
 * → null), e a store é quem de fato resolve a Promise.
 *
 * A11y:
 * - role="dialog" + aria-modal para screen readers
 * - foco automático no input (prompt) ou no botão confirm (confirm)
 * - Enter confirma, Esc cancela (ambos no nível do dialog, não global)
 * - trap de foco leve: Tab cicla entre input e botões
 */
export function DialogLayer() {
  const dialog = useAppStore((s) => s.activeDialog);
  const close = useAppStore((s) => s.closeDialog);

  // Input controlado localmente. Resetado toda vez que um novo dialog abre
  // (via `dialog?.id` no effect abaixo) — assim dialogs consecutivos não
  // vazam valor do anterior.
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dialog) return;
    setValue(dialog.defaultValue ?? "");
    // Foco após paint — o elemento acabou de montar.
    const raf = requestAnimationFrame(() => {
      if (dialog.kind === "prompt") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmBtnRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [dialog?.id, dialog?.kind]);

  if (!dialog) return null;

  const onConfirm = () => {
    if (dialog.kind === "prompt") {
      const trimmed = value.trim();
      if (!trimmed) return; // Prompt vazio é no-op; usuário cancela com Esc.
      close(trimmed);
    } else {
      close(""); // Confirm ok — string vazia vira `true` na openConfirm.
    }
  };

  const onCancel = () => close(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.isDefaultPrevented()) {
      e.preventDefault();
      onConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const confirmLabel = dialog.confirmLabel ?? (dialog.kind === "prompt" ? "OK" : "Confirmar");
  const cancelLabel = dialog.cancelLabel ?? "Cancelar";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onMouseDown={(e) => {
        // Click no backdrop (fora do painel) = cancela.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-title-${dialog.id}`}
        aria-describedby={dialog.message ? `dialog-msg-${dialog.id}` : undefined}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-lg shadow-xl animate-in fade-in zoom-in-95"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div className="px-5 pt-4 pb-2">
          {/* Titulo do dialog herda Inter (font do body) — antes forcava
              "Georgia, serif" e destoava do resto do app, que usa Inter
              em UI/paineis e reserva Lora/Garamond para o corpo editorial.
              Tamanho e peso (0.95rem / 600) batem com headers de Inspector
              e ContextMenu. */}
          <h2
            id={`dialog-title-${dialog.id}`}
            className="text-[0.95rem] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {dialog.title}
          </h2>
          {dialog.message && (
            <p
              id={`dialog-msg-${dialog.id}`}
              className="mt-2 text-[0.82rem] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {dialog.message}
            </p>
          )}
        </div>

        {dialog.kind === "prompt" && (
          <div className="px-5 py-2">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={dialog.placeholder}
              className="w-full px-3 py-2 rounded text-[0.85rem] outline-none transition-colors"
              style={{
                background: "var(--bg-app)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "";
              }}
            />
          </div>
        )}

        <div className="px-5 pt-3 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-[0.8rem] transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-[0.8rem] font-medium transition-colors"
            style={{
              background: dialog.danger ? "var(--danger)" : "var(--accent)",
              border: `1px solid ${dialog.danger ? "var(--danger)" : "var(--accent)"}`,
              color: "var(--text-inverse, #fff)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(0.92)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "";
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
