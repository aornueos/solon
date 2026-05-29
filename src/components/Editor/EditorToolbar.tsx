import { Editor } from "@tiptap/react";
import {
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
  Keyboard,
  Eye,
  Pin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { EDITOR_TEXT_SIZES, useAppStore } from "../../store/useAppStore";

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
  const typewriterMode = useAppStore((s) => s.typewriterMode);
  const setTypewriterMode = useAppStore((s) => s.setTypewriterMode);
  const editorTextSize = useAppStore((s) => s.editorTextSize);
  const setEditorTextSize = useAppStore((s) => s.setEditorTextSize);
  const toolbarMode = useAppStore((s) => s.editorToolbarMode);
  const setToolbarMode = useAppStore((s) => s.setEditorToolbarMode);
  const openContextMenu = useAppStore((s) => s.openContextMenu);

  const inTable = editor.isActive("table");

  const onToolbarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Toolbar fixa",
        icon: <Pin size={13} />,
        checked: toolbarMode === "fixed",
        onClick: () => setToolbarMode("fixed"),
      },
      {
        label: "Mostrar só ao passar o mouse",
        icon: <Eye size={13} />,
        checked: toolbarMode === "hover",
        onClick: () => setToolbarMode("hover"),
      },
    ]);
  };

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

  // Headings em glifos textuais "H1" — mais editorial e claro que ícones
  // genéricos (Heading1 / Heading2 são muito parecidos visualmente). Usa
  // a serifa display do app pra reforçar o vocabulario.
  const headingTools: ToolSpec[] = [1, 2, 3, 4, 5].map((level) => ({
    icon: <GlyphLabel>H{level}</GlyphLabel>,
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

  // Bold/Italic/Strike em glifos textuais — substitui icones lucide
  // por letras estilizadas (B negrito, I italico, S tachado). Imediato
  // e coerente com o vocabulario editorial.
  const inlineTools: ToolSpec[] = [
    {
      icon: (
        <GlyphLabel style={{ fontWeight: 800 }}>B</GlyphLabel>
      ),
      title: "Negrito (Ctrl+B)",
      run: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
    },
    {
      icon: (
        <GlyphLabel style={{ fontStyle: "italic", fontWeight: 600 }}>I</GlyphLabel>
      ),
      title: "Itálico (Ctrl+I)",
      run: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
    },
    {
      icon: (
        <GlyphLabel style={{ textDecoration: "line-through", fontWeight: 600 }}>
          S
        </GlyphLabel>
      ),
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
      className={clsx(
        "solon-editor-toolbar flex items-center gap-0.5 px-4 py-1.5",
        toolbarMode === "hover" && "solon-editor-toolbar--hover",
      )}
      onContextMenu={onToolbarContextMenu}
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-panel-2)",
      }}
    >
      <ToolBtn
        title="Máquina de escrever"
        active={typewriterMode}
        onClick={() => setTypewriterMode(!typewriterMode)}
      >
        <Keyboard size={15} />
      </ToolBtn>
      <Divider />
      <TextSizeControls value={editorTextSize} onChange={setEditorTextSize} />
      <Divider />
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

function TextSizeControls({
  value,
  onChange,
}: {
  value: (typeof EDITOR_TEXT_SIZES)[number]["value"];
  onChange: (value: (typeof EDITOR_TEXT_SIZES)[number]["value"]) => void;
}) {
  return (
    <>
      {EDITOR_TEXT_SIZES.map((option) => (
        <ToolBtn
          key={option.value}
          title={`Texto ${option.label.toLowerCase()}`}
          active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span className="block min-w-[18px] text-center text-[0.68rem] font-semibold leading-none">
            {option.shortLabel}
          </span>
        </ToolBtn>
      ))}
    </>
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
  // Botao brutalist: cantos retos, borda visivel no estado ativo (em vez
  // de fundo cinza). Ativo = borda accent + fundo accent-soft. Pequeno
  // (28×28) pra que a fileira inteira da toolbar nao infle.
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="transition-colors flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 0,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: active
          ? "1.5px solid var(--accent)"
          : "1.5px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        (e.currentTarget as HTMLElement).style.borderColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}

/**
 * Glifo textual estilizado pra botoes de formatacao (B / I / S / H1).
 * Substitui icones Lucide por letras editoriais — mais imediato e coerente
 * com a serifa display do app. Mantem o tamanho/peso visual de um icone
 * 15px atraves de line-height 1 e largura fixa.
 */
function GlyphLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-display)",
        fontSize: "0.92rem",
        lineHeight: 1,
        minWidth: 16,
        textAlign: "center",
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      {children}
    </span>
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
          className="absolute left-0 top-full mt-1 z-20 py-2 px-2 flex flex-col gap-1.5"
          style={{
            background: "var(--bg-panel)",
            border: "2px solid var(--border-strong)",
            borderRadius: 0,
            boxShadow: "var(--shadow-flat-sm)",
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
                  "w-6 h-6 transition-transform hover:scale-110",
                  currentColor === c.value && "ring-2 ring-offset-1",
                )}
                style={{
                  background: c.value,
                  border: "1.5px solid var(--border-strong)",
                  borderRadius: 0,
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
      className="absolute left-0 top-full mt-1 z-20 py-1 min-w-[210px]"
      style={{
        background: "var(--bg-panel)",
        border: "2px solid var(--border-strong)",
        borderRadius: 0,
        boxShadow: "var(--shadow-flat-sm)",
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
  // Divider mais alto e em cor border-strong pra ficar visivel sobre o
  // bg-panel-2 da toolbar — combina com o vocabulario de bordas grossas
  // do resto do chrome novo.
  return (
    <div
      className="w-px h-5 mx-1.5"
      style={{ background: "var(--border-strong)", opacity: 0.6 }}
    />
  );
}
