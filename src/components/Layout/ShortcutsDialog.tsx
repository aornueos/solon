import { useEffect } from "react";
import { X } from "lucide-react";

interface Shortcut {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Navegação",
    items: [
      { keys: "Ctrl + K", label: "Paleta de comandos" },
      { keys: "Ctrl + P", label: "Buscar notas, pastas e comandos" },
      { keys: "Ctrl + Shift + F", label: "Buscar no projeto" },
      { keys: "Ctrl + F", label: "Buscar na nota" },
      { keys: "Ctrl + Alt + H", label: "Histórico local" },
      { keys: "Ctrl + 1", label: "Ir para livre" },
      { keys: "Ctrl + 2", label: "Ir para canvas" },
      { keys: "Ctrl + 3", label: "Ir para início" },
    ],
  },
  {
    title: "Abas",
    items: [
      { keys: "Ctrl + T", label: "Nova nota vazia" },
      { keys: "Ctrl + Shift + N", label: "Scratchpad efêmero" },
      { keys: "Ctrl + W", label: "Fechar aba ativa" },
      { keys: "Ctrl + Tab", label: "Próxima aba" },
      { keys: "Ctrl + Shift + Tab", label: "Aba anterior" },
      { keys: "Ctrl + Shift + T", label: "Reabrir última aba fechada" },
      { keys: "Botão do meio", label: "Fechar aba ou abrir nota em segundo plano" },
    ],
  },
  {
    title: "Escrita",
    items: [
      { keys: "Ctrl + S", label: "Salvar" },
      { keys: "Ctrl + Z / Ctrl + Y", label: "Desfazer / Refazer" },
      { keys: "Ctrl + B / I / Shift+S", label: "Negrito / Itálico / Tachado" },
      { keys: "Ctrl + Scroll", label: "Zoom da área de escrita" },
      { keys: "Tab (heading)", label: "Demote heading" },
      { keys: "Shift + Tab (heading)", label: "Promote heading" },
      { keys: "Tab (parágrafo)", label: "Indentar primeira linha" },
      { keys: "Ctrl + Shift + E", label: "Exportar para PDF" },
    ],
  },
  {
    title: "Painéis",
    items: [
      { keys: "Ctrl + \\", label: "Alternar explorador" },
      { keys: "Ctrl + J", label: "Alternar índice" },
      { keys: "Ctrl + Alt + I", label: "Alternar inspector" },
      { keys: "F11", label: "Tela cheia" },
      { keys: "Ctrl + Shift + R", label: "Modo leitura" },
      { keys: "Paleta", label: "Modo foco" },
      { keys: "Ctrl + Shift + Esc", label: "Pânico: resetar modos especiais" },
      { keys: "Ctrl + ,", label: "Preferências" },
      { keys: "Ctrl + Shift + L", label: "Alternar tema visual" },
      { keys: "Ctrl + + / - / 0", label: "Zoom do aplicativo" },
      { keys: "Ctrl + /", label: "Esta janela de atalhos" },
    ],
  },
  {
    title: "Canvas",
    items: [
      { keys: "V / P / T / A / E", label: "Selecionar / Desenhar / Texto / Seta / Borracha" },
      { keys: "1 a 5", label: "Ferramentas pela ordem da toolbar" },
      { keys: "N", label: "Novo card" },
      { keys: "F", label: "Enquadrar tudo" },
      { keys: "Ctrl + D", label: "Duplicar seleção" },
      { keys: "Ctrl + A", label: "Selecionar tudo" },
      { keys: "Delete / Backspace", label: "Excluir seleção" },
      { keys: "Espaço + arrastar", label: "Pan" },
      { keys: "Ctrl + Scroll", label: "Zoom" },
      { keys: "Esc", label: "Cancelar / desselecionar" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="solon-dialog-overlay fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atalhos de teclado"
        className="solon-dialog w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="solon-dialog-header">
          <span className="solon-dialog-title">Atalhos</span>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="solon-dialog-close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            {GROUPS.map((group) => (
              <ShortcutGroupBlock key={group.title} group={group} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutGroupBlock({ group }: { group: ShortcutGroup }) {
  // Grupo com label small-caps discreto. Itens em texto normal, kbd
  // suave (hairline, cantos arredondados, mono).
  return (
    <section>
      <div className="mb-3">
        <span className="solon-plaque">{group.title}</span>
      </div>
      <ul className="space-y-1.5">
        {group.items.map((it) => (
          <li
            key={it.keys + it.label}
            className="flex items-baseline justify-between gap-3"
          >
            <span
              style={{
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
              }}
            >
              {it.label}
            </span>
            <kbd
              className="text-[0.68rem] px-1.5 py-0.5 flex-shrink-0 tabular-nums"
              style={{
                fontFamily: "var(--font-mono)",
                background: "var(--bg-panel-2)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xs)",
                letterSpacing: "0.02em",
              }}
            >
              {it.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </section>
  );
}
