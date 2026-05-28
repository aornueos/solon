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
      className="solon-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
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
        className="solon-dialog w-full max-w-md animate-in fade-in zoom-in-95"
      >
        <div className="px-5 pt-5 pb-3">
          {/* Titulo em serif display + plaqueta nao porque dialog ja' tem
              header proprio nas variantes maiores (Settings/Shortcuts);
              prompt/confirm sao compactos demais pra plaqueta full. */}
          <h2 id={`dialog-title-${dialog.id}`} className="solon-dialog-title">
            {dialog.title}
          </h2>
          {dialog.message && (
            <p
              id={`dialog-msg-${dialog.id}`}
              className="mt-2.5 text-[0.82rem] leading-relaxed"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
              }}
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
              className="solon-input"
            />
          </div>
        )}

        <div className="solon-dialog-actions">
          <button type="button" onClick={onCancel} className="solon-btn">
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={
              dialog.danger ? "solon-btn solon-btn--danger" : "solon-btn solon-btn--primary"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
