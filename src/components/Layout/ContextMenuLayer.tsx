import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/**
 * Context menu custom — substitui o nativo do WebView (Edge/WebKit).
 *
 * Design:
 *  - Aparece em (x, y) clientX/Y do clique direito.
 *  - Re-posiciona se transbordar a viewport (ajusta pra subir/esquerda
 *    em vez de sair da tela).
 *  - Fecha em: click fora, Esc, blur da janela, scroll, qualquer item
 *    selecionado.
 *  - A11y: navegavel por setas (vertical), Enter ativa, Esc fecha.
 *
 * Items vem da store (`activeContextMenu`). Quem dispara enche os items
 * conforme o contexto (texto selecionado, tipo de elemento clicado, etc).
 */
export function ContextMenuLayer() {
  const menu = useAppStore((s) => s.activeContextMenu);
  const close = useAppStore((s) => s.closeContextMenu);

  // Index do item focado (navegacao por teclado). -1 = nada focado.
  const [focused, setFocused] = useState(-1);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Posicao real (apos clamp pra caber na viewport). Calculado em layout
  // pra evitar flash de "fora da tela" no primeiro frame.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      setFocused(-1);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = menu.x;
    let top = menu.y;
    // Se transbordar direita, abre pra esquerda do clique.
    if (left + rect.width + margin > window.innerWidth) {
      left = window.innerWidth - rect.width - margin;
    }
    // Se transbordar baixo, abre pra cima.
    if (top + rect.height + margin > window.innerHeight) {
      top = window.innerHeight - rect.height - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [menu]);

  // Fechar em Esc + nav por teclado
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const actionables = menu.items
        .map((it, i) => ((it as any).kind !== "separator" ? i : -1))
        .filter((i) => i >= 0);
      if (actionables.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocused((curr) => {
          const idx = actionables.indexOf(curr);
          return actionables[(idx + 1) % actionables.length] ?? actionables[0];
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocused((curr) => {
          const idx = actionables.indexOf(curr);
          return actionables[
            (idx - 1 + actionables.length) % actionables.length
          ] ?? actionables[0];
        });
      } else if (e.key === "Enter" && focused >= 0) {
        e.preventDefault();
        const item = menu.items[focused];
        if (item && (item as any).kind !== "separator") {
          const action = item as Extract<
            typeof item,
            { onClick: () => void }
          >;
          if (!action.disabled) {
            action.onClick();
            close();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, focused, close]);

  // Fecha em scroll/blur — comportamento padrao de menu nativo. Usuario
  // muda de contexto, menu sai do caminho.
  useEffect(() => {
    if (!menu) return;
    const onClose = () => close();
    window.addEventListener("blur", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("blur", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [menu, close]);

  if (!menu) return null;

  return (
    <div
      // Backdrop full-screen pra capturar click-fora e fechar.
      // pointer-events-auto so' no backdrop; o menu tem o seu proprio.
      className="fixed inset-0 z-[150]"
      style={{ pointerEvents: "auto" }}
      onMouseDown={(e) => {
        // Click fora do menu fecha; click dentro o item interno trata.
        if (e.target === e.currentTarget) close();
      }}
      onContextMenu={(e) => {
        // Bloqueia native context menu sobre o backdrop tambem (caso a
        // pessoa clique direito DE NOVO em vez de fechar com Esc).
        e.preventDefault();
        close();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        className="absolute min-w-[200px] py-1 rounded-md"
        style={{
          left: pos?.left ?? menu.x,
          top: pos?.top ?? menu.y,
          // Se ainda nao foi medido, esconde via opacity pra nao piscar
          // off-screen no primeiro frame.
          opacity: pos ? 1 : 0,
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md)",
          color: "var(--text-primary)",
        }}
      >
        {menu.items.map((item, i) => {
          if ((item as { kind?: string }).kind === "separator") {
            return (
              <div
                key={`sep-${i}`}
                role="separator"
                className="my-1 h-px"
                style={{ background: "var(--border-subtle)" }}
              />
            );
          }
          const action = item as Extract<
            typeof item,
            { onClick: () => void }
          >;
          const isFocused = focused === i;
          return (
            <ContextMenuItemView
              key={i}
              item={action}
              focused={isFocused}
              onHover={() => setFocused(i)}
              onSelect={() => {
                if (action.disabled) return;
                action.onClick();
                close();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ContextMenuItemView({
  item,
  focused,
  onHover,
  onSelect,
}: {
  item: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    checked?: boolean;
  };
  focused: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      role="menuitem"
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        // Previne perda de foco do editor durante a selecao do item —
        // alguns comandos (toggleBulletList, etc) precisam que o caret
        // ainda esteja onde estava.
        e.preventDefault();
      }}
      onClick={onSelect}
      disabled={item.disabled}
      className="w-full flex items-center gap-3 px-3 py-1.5 text-left text-[0.82rem] transition-colors"
      style={{
        background: focused ? "var(--bg-hover)" : "transparent",
        color: item.disabled
          ? "var(--text-placeholder)"
          : item.danger
          ? "var(--danger)"
          : "var(--text-primary)",
        cursor: item.disabled ? "not-allowed" : "pointer",
      }}
    >
      {/* Slot fixo de 14px pra icon ou check — alinha colunas mesmo
          quando alguns items tem icon e outros nao. */}
      <span
        className="w-4 flex-shrink-0 flex items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        {item.checked ? (
          <Check size={12} />
        ) : item.icon ? (
          item.icon
        ) : null}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.shortcut && (
        <span
          className="text-[0.7rem] tabular-nums tracking-wide flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          {item.shortcut}
        </span>
      )}
    </button>
  );
}
