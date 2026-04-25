import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Blockquote from "@tiptap/extension-blockquote";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { IndentExtension } from "./IndentExtension";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { EditorToolbar } from "./EditorToolbar";
import { markdownToHtml, htmlToMarkdown } from "./markdownBridge";

export function Editor() {
  // Seletores granulares: evita re-render do editor ao mudar sidebarWidth,
  // theme, viewport do canvas, etc. `fileBody` fica intencionalmente fora
  // das deps do useEffect de load — lemos via getState quando trocamos de
  // arquivo pra não rodar setContent em loop durante a digitação.
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const focusMode = useAppStore((s) => s.focusMode);
  const setHeadings = useAppStore((s) => s.setHeadings);
  const setWordCount = useAppStore((s) => s.setWordCount);
  const setFileBody = useAppStore((s) => s.setFileBody);

  const isLoadingRef = useRef(false);
  const lastLoadedPathRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Bold,
      Italic,
      Strike,
      Blockquote,
      BulletList,
      OrderedList,
      ListItem,
      CodeBlock,
      HorizontalRule,
      History,
      Typography,
      CharacterCount,
      IndentExtension,
      Table.configure({ resizable: true, HTMLAttributes: { class: "solon-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Comece a escrever sua história...",
      }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (isLoadingRef.current) return;

      extractHeadings(editor, setHeadings);

      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words, text.length);

      // Sincroniza body com store — useAutoSave grava depois.
      const md = htmlToMarkdown(editor.getHTML());
      setFileBody(md);
    },
  });

  // Carrega conteúdo quando troca o arquivo ativo. `fileBody` não entra nas
  // deps — se entrasse, cada keystroke (que atualiza fileBody via onUpdate)
  // dispararia este effect e causaria setContent em loop, zerando o cursor
  // do usuário. Lemos o body via getState no momento da troca.
  useEffect(() => {
    if (!editor) return;
    if (!activeFilePath) {
      lastLoadedPathRef.current = null;
      return;
    }
    if (lastLoadedPathRef.current === activeFilePath) return;
    lastLoadedPathRef.current = activeFilePath;

    isLoadingRef.current = true;
    const body = useAppStore.getState().fileBody;
    const html = markdownToHtml(body);
    editor.commands.setContent(html, false);
    extractHeadings(editor, setHeadings);

    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words, text.length);

    // Aguarda o próximo microtask — onUpdate do TipTap ainda dispara após
    // setContent, então precisamos segurar `isLoadingRef` até passar esse
    // tick. Antes usávamos 50ms arbitrário que racava em máquinas lentas.
    const raf = requestAnimationFrame(() => {
      isLoadingRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [activeFilePath, editor, setHeadings, setWordCount]);

  // Scroll para heading via evento do Outline. Chain pra scrollar DE FATO
  // até a posição — `setTextSelection` sozinho só move o caret, não o
  // scroll do viewport. `scrollIntoView()` do TipTap encosta a seleção no
  // centro do viewport (ou no topo em docs curtos).
  useEffect(() => {
    const handler = (e: Event) => {
      if (!editor) return;
      const detail = (e as CustomEvent).detail as { pos?: number } | undefined;
      if (!detail || typeof detail.pos !== "number") return;
      editor
        .chain()
        .focus()
        .setTextSelection(detail.pos)
        .scrollIntoView()
        .run();
    };
    document.addEventListener("solon:scroll-to", handler);
    return () => document.removeEventListener("solon:scroll-to", handler);
  }, [editor]);

  if (!activeFilePath) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex flex-col h-full">
      {editor && !focusMode && <EditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-8 py-12">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen() {
  const { openFolder } = useFileSystem();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="space-y-1">
        <h1
          className="font-serif text-3xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Solon
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Editor de escrita criativa
        </p>
      </div>
      <div className="space-y-2 max-w-sm">
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-placeholder)" }}
        >
          Abra uma pasta para começar, ou selecione um arquivo no explorador à esquerda.
        </p>
      </div>
      <button
        onClick={openFolder}
        className="px-5 py-2 rounded-md text-sm transition-colors"
        style={{
          background: "var(--accent)",
          color: "var(--text-inverse)",
        }}
      >
        Abrir pasta de projeto
      </button>
      <div
        className="text-[0.7rem] mt-4 space-y-1"
        style={{ color: "var(--text-placeholder)" }}
      >
        <p>Ctrl+S — Salvar · F11 — Focus Mode</p>
        <p>Ctrl+B — Negrito · Ctrl+I — Itálico · Ctrl+Shift+L — Tema</p>
      </div>
    </div>
  );
}

function extractHeadings(
  editor: ReturnType<typeof useEditor>,
  setHeadings: (h: any[]) => void
) {
  if (!editor) return;
  const headings: { level: number; text: string; pos: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({
        level: node.attrs.level,
        text: node.textContent,
        pos,
      });
    }
  });
  setHeadings(headings);
}
