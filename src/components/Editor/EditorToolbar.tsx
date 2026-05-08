import { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Quote,
  Minus,
  List,
  ListOrdered,
  Undo,
  Redo,
  Table as TableIcon,
  Plus,
  Rows,
  Columns,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface Props {
  editor: Editor;
}

/**
 * Specs das ações — elimina a repetição de `onMouseDown → chain().focus()`
 * espalhada no código antigo (clean code: table-driven).
 */
interface ToolSpec {
  icon: React.ReactNode;
  title: string;
  run: (e: Editor) => void;
  isActive?: (e: Editor) => boolean;
}

export function EditorToolbar({ editor }: Props) {
  const [tableMenu, setTableMenu] = useState(false);

  const inTable = editor.isActive("table");

  const historyTools: ToolSpec[] = [
    {
      icon: <Undo size={15} />,
      title: "Desfazer (Ctrl+Z)",
      run: (e) => e.chain().focus().undo().run(),
    },
    {
      icon: <Redo size={15} />,
      title: "Refazer (Ctrl+Y)",
      run: (e) => e.chain().focus().redo().run(),
    },
  ];

  const headingTools: ToolSpec[] = [1, 2, 3, 4, 5].map((level) => ({
    icon:
      level === 1 ? <Heading1 size={15} /> :
      level === 2 ? <Heading2 size={15} /> :
      level === 3 ? <Heading3 size={15} /> :
      level === 4 ? <Heading4 size={15} /> :
      <Heading5 size={15} />,
    title:
      level === 1 ? "Capítulo (H1)" :
      level === 2 ? "Seção (H2)" :
      level === 3 ? "Cena (H3)" :
      level === 4 ? "Bloco (H4)" :
      "Detalhe (H5)",
    run: (e) =>
      e
        .chain()
        .focus()
        .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 })
        .run(),
    isActive: (e) => e.isActive("heading", { level }),
  }));

  const inlineTools: ToolSpec[] = [
    {
      icon: <Bold size={15} />,
      title: "Negrito (Ctrl+B)",
      run: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
    },
    {
      icon: <Italic size={15} />,
      title: "Itálico (Ctrl+I)",
      run: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
    },
    {
      icon: <Strikethrough size={15} />,
      title: "Tachado",
      run: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive("strike"),
    },
  ];

  const blockTools: ToolSpec[] = [
    {
      icon: <Quote size={15} />,
      title: "Diálogo / Citação",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive("blockquote"),
    },
    {
      icon: <Minus size={15} />,
      title: "Quebra de cena",
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ];

  const listTools: ToolSpec[] = [
    {
      icon: <List size={15} />,
      title: "Lista",
      run: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive("bulletList"),
    },
    {
      icon: <ListOrdered size={15} />,
      title: "Lista numerada",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive("orderedList"),
    },
  ];

  // Alinhamento — paragrafos e headings. Default 'left' nao precisa
  // estar marcado como ativo (pra evitar 4 botoes acesos quando voce
  // nao escolheu nada). isActive checa explicit alignment via attrs.
  const alignTools: ToolSpec[] = [
    {
      icon: <AlignLeft size={15} />,
      title: "Alinhar à esquerda",
      run: (e) => e.chain().focus().setTextAlign("left").run(),
      isActive: (e) => e.isActive({ textAlign: "left" }),
    },
    {
      icon: <AlignCenter size={15} />,
      title: "Centralizar",
      run: (e) => e.chain().focus().setTextAlign("center").run(),
      isActive: (e) => e.isActive({ textAlign: "center" }),
    },
    {
      icon: <AlignRight size={15} />,
      title: "Alinhar à direita",
      run: (e) => e.chain().focus().setTextAlign("right").run(),
      isActive: (e) => e.isActive({ textAlign: "right" }),
    },
    {
      icon: <AlignJustify size={15} />,
      title: "Justificar",
      run: (e) => e.chain().focus().setTextAlign("justify").run(),
      isActive: (e) => e.isActive({ textAlign: "justify" }),
    },
  ];

  return (
    <div
      className="flex items-center gap-0.5 px-4 py-1.5"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-panel-2)",
      }}
    >
      <ToolGroup editor={editor} tools={historyTools} />
      <Divider />
      <ToolGroup editor={editor} tools={headingTools} />
      <Divider />
      <ToolGroup editor={editor} tools={inlineTools} />
      <Divider />
      <ToolGroup editor={editor} tools={blockTools} />
      <Divider />
      <ToolGroup editor={editor} tools={listTools} />
      <Divider />
      <ToolGroup editor={editor} tools={alignTools} />
      <Divider />
      <HighlightPicker editor={editor} />
      <Divider />

      <div className="relative">
        <ToolBtn
          title="Tabela"
          active={inTable}
          onClick={() => setTableMenu((v) => !v)}
        >
          <TableIcon size={15} />
        </ToolBtn>
        {tableMenu && (
          <TableMenu
            editor={editor}
            inTable={inTable}
            onClose={() => setTableMenu(false)}
          />
        )}
      </div>
    </div>
  );
}

function ToolGroup({ editor, tools }: { editor: Editor; tools: ToolSpec[] }) {
  return (
    <>
      {tools.map((t, i) => (
        <ToolBtn
          key={i}
          title={t.title}
          onClick={() => t.run(editor)}
          active={t.isActive?.(editor)}
        >
          {t.icon}
        </ToolBtn>
      ))}
    </>
  );
}

function ToolBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx("p-1.5 rounded transition-colors")}
      style={{
        background: active ? "var(--bg-active)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
      }}
    >
      {children}
    </button>
  );
}

/**
 * Paleta de cores do grifo. Tons translúcidos pra que o texto continue
 * legivel por cima — saturacoes baixas, alphas explicitas no hex
 * (`80` = 50%). Inspirados em marcadores de texto reais (amarelo,
 * verde, rosa, azul, lilas, cinza).
 */
const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: "Amarelo", value: "#fff48080" },
  { label: "Verde", value: "#b7eb8f80" },
  { label: "Rosa", value: "#ffadd280" },
  { label: "Azul", value: "#91d5ff80" },
  { label: "Lilás", value: "#d3adf780" },
  { label: "Laranja", value: "#ffd59180" },
];

function HighlightPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Fecha ao clicar fora — usuario pode escolher cor ou abandonar.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isActive = editor.isActive("highlight");
  const currentColor =
    (editor.getAttributes("highlight")?.color as string | undefined) ?? null;

  return (
    <div ref={ref} className="relative">
      <ToolBtn
        title="Grifar (escolher cor)"
        active={isActive}
        onClick={() => setOpen((v) => !v)}
      >
        <Highlighter size={15} />
      </ToolBtn>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 rounded shadow-md py-2 px-2 flex flex-col gap-1.5"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor
                    .chain()
                    .focus()
                    .setHighlight({ color: c.value })
                    .run();
                  setOpen(false);
                }}
                className={clsx(
                  "w-6 h-6 rounded transition-transform hover:scale-110",
                  currentColor === c.value && "ring-2 ring-offset-1",
                )}
                style={{
                  background: c.value,
                  border: "1px solid var(--border)",
                }}
              />
            ))}
          </div>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetHighlight().run();
              setOpen(false);
            }}
            className="text-[0.72rem] py-1 px-2 rounded transition-colors text-left"
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
            Remover grifo
          </button>
        </div>
      )}
    </div>
  );
}

function TableMenu({
  editor,
  inTable,
  onClose,
}: {
  editor: Editor;
  inTable: boolean;
  onClose: () => void;
}) {
  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      className="absolute left-0 top-full mt-1 z-20 rounded shadow-md py-1 min-w-[200px]"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
      }}
      onMouseLeave={onClose}
    >
      <MenuItem
        onClick={() =>
          run(() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          )
        }
        icon={<Plus size={12} />}
        label="Inserir tabela 3×3"
      />
      <div
        className="h-px my-1"
        style={{ background: "var(--border-subtle)" }}
      />
      <MenuItem
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
        icon={<Rows size={12} />}
        label="Adicionar linha abaixo"
      />
      <MenuItem
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
        icon={<Columns size={12} />}
        label="Adicionar coluna à direita"
      />
      <MenuItem
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
        icon={<Trash2 size={12} />}
        label="Excluir linha"
      />
      <MenuItem
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
        icon={<Trash2 size={12} />}
        label="Excluir coluna"
      />
      <div
        className="h-px my-1"
        style={{ background: "var(--border-subtle)" }}
      />
      <MenuItem
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
        icon={<Trash2 size={12} />}
        label="Excluir tabela"
        danger
      />
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[0.78rem] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        color: danger ? "var(--danger)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-4 mx-1"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
