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
import { ListExitExtension } from "./ListExitExtension";
import { useAppStore } from "../../store/useAppStore";
import { EditorToolbar } from "./EditorToolbar";
import { markdownToHtml, htmlToMarkdown } from "./markdownBridge";
import { setCurrentEditor } from "../../lib/editorRef";
import { ensureSpellchecker } from "../../lib/spellcheck";

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
  const editorZoom = useAppStore((s) => s.editorZoom);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);

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
      ListExitExtension,
      Table.configure({ resizable: true, HTMLAttributes: { class: "solon-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Comece a escrever sua história...",
      }),
    ],
    content: "",
    // `spellcheck=true/false` ativa o spellchecker nativo do WebView2/
    // WebKit/WebKitGTK — risca em vermelho palavras nao-reconhecidas.
    // O valor inicial vem da pref persistida; mudancas em runtime sao
    // aplicadas imperativamente no DOM (vide useEffect abaixo).
    editorProps: {
      attributes: {
        spellcheck: useAppStore.getState().spellcheckEnabled
          ? "true"
          : "false",
      },
    },
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

  // Spellcheck toggle reativo: editorProps.attributes so e' lido na init,
  // entao se o user mudar a pref via context menu / settings em runtime,
  // a gente seta o atributo no DOM imperativamente.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false");
  }, [editor, spellcheckEnabled]);

  // Registra/desregistra ref global pro editor. Usado pelo
  // ContextMenuProvider pra detectar palavra em right-click sem precisar
  // passar refs por arvore de props.
  useEffect(() => {
    if (!editor) return;
    setCurrentEditor(editor);
    return () => setCurrentEditor(null);
  }, [editor]);

  // Pre-warming do spellcheck: dispara o load 2s apos o editor montar,
  // em background, sem await. Quando o user fizer o primeiro right-click
  // em uma palavra errada (~10s+ depois normalmente), o engine ja' esta
  // pronto e as sugestoes aparecem instantaneas. Sem pre-warm, o
  // primeiro right-click teria menu sem sugestoes (engine ainda
  // carregando).
  useEffect(() => {
    if (!spellcheckEnabled) return;
    const t = window.setTimeout(() => {
      // fire-and-forget — failures sao logadas dentro do facade
      ensureSpellchecker();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [spellcheckEnabled]);

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

  // Sem arquivo ativo: renderiza o MESMO frame visual do editor (toolbar
  // simulada + container max-w-680px com padding identico) e so um
  // paragrafo placeholder dentro. NAO e uma "tela cheia centralizada com
  // CTA" — isso virava percepcao de "segunda homepage". Agora parece
  // literalmente um editor com pagina em branco, top-aligned como qualquer
  // documento. A landing real (Solon serif gigante, sumario etc) so existe
  // em activeView === "home".
  if (!activeFilePath) {
    return (
      <div className="flex flex-col h-full">
        {/* Espacador da altura da toolbar (so pra alinhamento visual com
            quando ha arquivo aberto — sem renderizar a EditorToolbar
            propriamente porque ela depende de uma instancia do editor). */}
        {!focusMode && (
          <div
            className="h-[44px] flex-shrink-0"
            style={{
              background: "var(--bg-panel-2)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          />
        )}
        <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-app)" }}>
          <div className="max-w-[680px] mx-auto px-8 py-12">
            <p
              className="font-serif italic text-[1.05rem]"
              style={{ color: "var(--text-placeholder)", lineHeight: 1.6 }}
            >
              Nenhum arquivo aberto. Escolha um no explorador à esquerda
              ou volte para a página inicial pra começar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Click na area branca em volta do EditorContent foca o editor no fim
  // do documento. Sem isso, clicar abaixo do ultimo paragrafo nao iniciava
  // nada — o usuario precisava posicionar o caret manualmente. TipTap so
  // captura clicks dentro do `EditorContent`; o padding ao redor era area
  // morta. Listener no wrapper resolve pra qualquer click fora do conteudo.
  const focusEnd = (e: React.MouseEvent) => {
    if (!editor) return;
    // Se o click foi dentro do conteudo do TipTap, deixa o proprio TipTap
    // posicionar o caret. So intervimos quando o target e o wrapper/padding.
    const target = e.target as HTMLElement;
    if (target.closest(".ProseMirror")) return;
    editor.chain().focus("end").run();
  };

  // Zoom do editor: aplicado como CSS var no container do EditorContent.
  // Os seletores em globals.css multiplicam font-size por essa var, entao
  // o usuario pode aumentar/diminuir o tamanho do texto sem afetar a UI
  // (sidebar, titlebar, statusbar continuam fixos).
  const zoomVar = { ["--editor-zoom" as string]: String(editorZoom / 100) };

  return (
    <div className="flex flex-col h-full">
      {editor && !focusMode && <EditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto" onClick={focusEnd}>
        <div
          className="max-w-[680px] mx-auto px-8 py-12 min-h-full cursor-text"
          style={zoomVar as React.CSSProperties}
        >
          <EditorContent editor={editor} />
        </div>
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
