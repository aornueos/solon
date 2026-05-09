import { useEffect, useRef, useState } from "react";
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
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { IndentExtension } from "./IndentExtension";
import { ListExitExtension } from "./ListExitExtension";
import { SmartDashesExtension } from "./SmartDashesExtension";
import {
  EDITOR_INDENT_SIZES,
  EDITOR_FONT_FAMILIES,
  EDITOR_LINE_HEIGHTS,
  EDITOR_PARAGRAPH_SPACING,
  useAppStore,
} from "../../store/useAppStore";
import { EditorToolbar } from "./EditorToolbar";
import { markdownToHtml, htmlToMarkdown } from "./markdownBridge";
import { setCurrentEditor, setEditorFlush } from "../../lib/editorRef";
import { ensureSpellchecker } from "../../lib/spellcheck";
import { FindBar } from "./FindBar";
import { SpellcheckExtension } from "./SpellcheckExtension";
import { FindHighlightExtension } from "./FindHighlightExtension";

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
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const editorMaxWidth = useAppStore((s) => s.editorMaxWidth);
  const editorLineHeight = useAppStore((s) => s.editorLineHeight);
  const editorParagraphSpacing = useAppStore((s) => s.editorParagraphSpacing);
  const editorIndentSize = useAppStore((s) => s.editorIndentSize);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);

  const isLoadingRef = useRef(false);
  const lastLoadedPathRef = useRef<string | null>(null);
  // Debounce do trabalho pesado em `onUpdate` (extractHeadings, getText,
  // getHTML, htmlToMarkdown). Esses passos custam ms em docs grandes e
  // disparavam por keystroke — em cap. de 8k palavras a digitacao
  // visivelmente atrasava. 180ms e' um sweet spot: invisivel ao user mas
  // coalesce burstos de digitacao em uma unica passada. O auto-save tem
  // seu proprio debounce de 1.2s acima disso, entao nao mexemos nele.
  const updateTimerRef = useRef<number | null>(null);
  // `flushUpdate` roda o trabalho pendente *agora* (sem esperar debounce).
  // Chamado em 3 lugares:
  //   1. Quando o debounce de 180ms estoura (caminho normal).
  //   2. Antes de trocar `activeFilePath` — senao o body do arquivo antigo
  //      pendente seria descartado quando o setContent do novo rodar.
  //   3. Em Ctrl+S (via flushEditor() chamado pelo useAutoSave) — senao o
  //      save iria gravar a versao 180ms atrasada.
  // Definida fora do escopo da useEditor pra que possa ser registrada via
  // setEditorFlush logo apos a criacao do editor.
  const flushUpdateRef = useRef<(() => void) | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findInitialQuery, setFindInitialQuery] = useState("");
  // Ref do wrapper scrollavel — usado pra anexar wheel listener nativo
  // (com {passive: false} pra poder preventDefault o scroll quando
  // Ctrl ta pressionado e a gente quer transformar em zoom).
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      SpellcheckExtension,
      FindHighlightExtension,
      IndentExtension,
      ListExitExtension,
      SmartDashesExtension,
      Table.configure({ resizable: true, HTMLAttributes: { class: "solon-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      // Alinhamento de texto: paragrafos + headings. Default 'left' nao
      // e' explicitamente settado (vira null/undefined no atributo) pra
      // que markdown sem alinhamento permaneca markdown sem alinhamento.
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      // Highlight (grifo) com cores. `multicolor: true` permite marcar
      // texto com cor especifica via setHighlight({ color: '#...' });
      // `false` so' permite toggle on/off (cor padrao). Queremos cores.
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: { class: "solon-mark" },
      }),
      // Placeholder vazio — o user nao queria a frase "Comece a escrever
      // sua historia..." aparecendo. Mantemos a Extension instalada
      // (e' lightweight) caso queiramos placeholders dinamicos por nota
      // no futuro (ex: do frontmatter), mas por agora fica em branco.
      Placeholder.configure({
        placeholder: "",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        spellcheck: "false",
        lang: "pt-BR",
      },
    },
    onUpdate: ({ editor }) => {
      if (isLoadingRef.current) return;
      // Coalesce todo o trabalho pesado num unico debounce. Antes,
      // digitar uma frase de 30 letras disparava 30x:
      //   - extractHeadings (descend O(n) do doc inteiro)
      //   - editor.getText() + split (O(n))
      //   - editor.getHTML() + htmlToMarkdown (turndown — *caro*)
      //   - setFileBody (cascade de re-renders na arvore)
      // Marca dirty IMEDIATAMENTE pra StatusBar piscar "Editado" sem
      // esperar o debounce; o resto pode esperar 180ms.
      const s = useAppStore.getState();
      if (s.saveStatus !== "saving" && s.saveStatus !== "dirty") {
        s.setSaveStatus("dirty");
      }
      if (updateTimerRef.current != null) {
        window.clearTimeout(updateTimerRef.current);
      }
      updateTimerRef.current = window.setTimeout(() => {
        updateTimerRef.current = null;
        if (isLoadingRef.current || !editor) return;
        extractHeadings(editor, setHeadings);
        const text = editor.getText();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        setWordCount(words, text.length);
        const md = htmlToMarkdown(editor.getHTML());
        setFileBody(md);
      }, 180);
    },
  });

  // Mantem flushUpdateRef apontando pra uma funcao que cancela o timer
  // pendente e roda o trabalho agora. Chamado quando o user troca de
  // arquivo (via useEffect de load) e em Ctrl+S (via flushEditor() do
  // useAutoSave).
  flushUpdateRef.current = () => {
    if (updateTimerRef.current != null) {
      window.clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    if (isLoadingRef.current || !editor) return;
    extractHeadings(editor, setHeadings);
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words, text.length);
    const md = htmlToMarkdown(editor.getHTML());
    setFileBody(md);
  };

  // Registra o flush global pra que useAutoSave (Ctrl+S) e qualquer
  // outro caller fora-do-React possam pedir um flush sync.
  useEffect(() => {
    setEditorFlush(() => flushUpdateRef.current?.());
    return () => setEditorFlush(null);
  }, []);

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
    // Flush pendencias do arquivo ANTERIOR antes de hidrate o novo —
    // senao o turndown debounced rodaria depois do setContent novo e
    // gravaria o body do antigo no fileBody do novo.
    flushUpdateRef.current?.();
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

  // Mantemos o spellcheck nativo do WebView desligado. Ele costuma seguir
  // o idioma do sistema/Edge e marcar portugues correto como erro; o Solon
  // usa o backend pt-BR proprio para sublinhados e sugestoes.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", "false");
    dom.setAttribute("lang", "pt-BR");
  }, [editor, spellcheckEnabled]);

  useEffect(() => {
    setFindOpen(false);
  }, [activeFilePath]);

  useEffect(() => {
    if (!editor || !activeFilePath) return;
    const onFindShortcut = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      e.stopPropagation();
      setFindOpen(true);
    };
    document.addEventListener("keydown", onFindShortcut, true);
    return () => document.removeEventListener("keydown", onFindShortcut, true);
  }, [editor, activeFilePath]);

  useEffect(() => {
    const onOpenFind = (e: Event) => {
      const detail = (e as CustomEvent).detail as { query?: string } | undefined;
      setFindInitialQuery(detail?.query ?? "");
      setFindOpen(true);
    };
    document.addEventListener("solon:find-open", onOpenFind);
    return () => document.removeEventListener("solon:find-open", onOpenFind);
  }, []);

  // Registra/desregistra ref global pro editor. Usado pelo
  // ContextMenuProvider pra detectar palavra em right-click sem precisar
  // passar refs por arvore de props.
  useEffect(() => {
    if (!editor) return;
    setCurrentEditor(editor);
    return () => setCurrentEditor(null);
  }, [editor]);

  // Pre-warming do spellcheck: spawna o worker 2s apos o editor montar.
  // Worker compila o dicionario em background sem travar a UI (~8-10s
  // numa maquina lenta). Quando o user fizer o primeiro right-click em
  // palavra errada, a engine ja' esta pronta e sugestoes aparecem em
  // <100ms.
  //
  // ANTES essa funcao bloqueava a main thread durante o parsing —
  // primeiro right-click congelava o app por 10s. Agora o worker
  // isola completamente.
  useEffect(() => {
    if (!spellcheckEnabled) return;
    const t = window.setTimeout(() => {
      ensureSpellchecker(); // sync, fire-and-forget; spawna worker
    }, 2000);
    return () => window.clearTimeout(t);
  }, [spellcheckEnabled]);

  // Ctrl+Scroll = zoom do texto. So' afeta o editor (escopo do listener),
  // nao a UI ao redor. Acumulador de deltaY pra suavizar trackpads que
  // disparam dezenas de events com delta pequeno por gesto — sem
  // acumulador, um swipe casual saltaria de 100% pra 200%. Cada 50px
  // acumulados = 1 step de 5%, semelhante a 1 notch de mouse fisico.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let accumulator = 0;
    const STEP_THRESHOLD = 50; // pixels deltaY ate' disparar 1 step
    const STEP_SIZE = 5; // % por step

    const onWheel = (e: WheelEvent) => {
      // ctrlKey pega Windows/Linux; metaKey pega Cmd no macOS.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      accumulator += e.deltaY;
      if (Math.abs(accumulator) < STEP_THRESHOLD) return;
      // deltaY < 0 = scroll pra cima = zoom in (texto maior).
      // deltaY > 0 = scroll pra baixo = zoom out (texto menor).
      const direction = accumulator < 0 ? 1 : -1;
      const current = useAppStore.getState().editorZoom;
      setEditorZoom(current + direction * STEP_SIZE);
      accumulator = 0;
    };

    // {passive: false} obriga browser a esperar o handler decidir antes
    // de scrollar. Sem isso, preventDefault() e' ignorado e o scroll
    // acontece junto do zoom — UX confusa.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // `activeFilePath` na dep: o scrollRef so' "existe" quando ha
    // arquivo aberto (early-return sem-arquivo nao renderiza o div com
    // o ref). Sem essa dep, useEffect rodava no mount inicial com
    // scrollRef.current=null (path de empty-state), e nunca re-rodava
    // quando o user abria arquivo. Resultado: Ctrl+Scroll nao zoomava.
  }, [setEditorZoom, activeFilePath]);

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
          <div
            className="mx-auto px-8 py-12"
            style={{ maxWidth: editorMaxWidth }}
          >
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

  // Click na area branca em volta do EditorContent posiciona o caret
  // baseado na coordenada Y do click — clicar acima do primeiro
  // paragrafo posiciona no INICIO do doc, abaixo do ultimo posiciona
  // no FIM. Antes era sempre fim; "preciso clicar especificamente
  // na primeira palavra pra ir pro inicio" era a queixa do user.
  const focusEnd = (e: React.MouseEvent) => {
    if (!editor) return;
    const target = e.target as HTMLElement;
    if (target.closest(".ProseMirror")) return;

    // Se ha selecao ativa (user fez drag-select), deixa quieta —
    // senao colapsavamos a selecao acidentalmente.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;

    // Tenta posicionar o caret na coordenada do click (ProseMirror
    // resolve pra posicao mais proxima dentro do doc). Se nao achar
    // nada (click muito longe), heuristica: acima do editor → inicio,
    // abaixo → fim.
    const coords = editor.view.posAtCoords({
      left: e.clientX,
      top: e.clientY,
    });
    if (coords) {
      editor
        .chain()
        .focus()
        .setTextSelection(coords.pos)
        .run();
      return;
    }
    const editorEl = editor.view.dom as HTMLElement;
    const rect = editorEl.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      editor.chain().focus("start").run();
    } else {
      editor.chain().focus("end").run();
    }
  };

  // Zoom do editor: aplicado como CSS var no container do EditorContent.
  // Os seletores em globals.css multiplicam font-size por essa var, entao
  // o usuario pode aumentar/diminuir o tamanho do texto sem afetar a UI
  // (sidebar, titlebar, statusbar continuam fixos).
  const lineHeightValue =
    EDITOR_LINE_HEIGHTS.find((option) => option.value === editorLineHeight)
      ?.css ?? 1.5;
  const paragraphSpacingValue =
    EDITOR_PARAGRAPH_SPACING.find(
      (option) => option.value === editorParagraphSpacing,
    )?.css ?? "0.4em";
  const indentSizeValue =
    EDITOR_INDENT_SIZES.find((option) => option.value === editorIndentSize)
      ?.css ?? "2em";
  const editorFontFamilyValue =
    EDITOR_FONT_FAMILIES.find((option) => option.value === editorFontFamily)
      ?.css ?? EDITOR_FONT_FAMILIES[0].css;
  const editorVars = {
    ["--editor-zoom" as string]: String(editorZoom / 100),
    ["--editor-line-height" as string]: String(lineHeightValue),
    ["--editor-paragraph-spacing" as string]: paragraphSpacingValue,
    ["--editor-indent-size" as string]: indentSizeValue,
    ["--editor-font-family" as string]: editorFontFamilyValue,
  };

  return (
    <div className="relative flex flex-col h-full">
      {editor && (
        <FindBar
          editor={editor}
          open={findOpen}
          initialQuery={findInitialQuery}
          onClose={() => setFindOpen(false)}
        />
      )}
      {editor && !focusMode && <EditorToolbar editor={editor} />}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onClick={focusEnd}
      >
        <div
          className="mx-auto px-8 py-12 min-h-full cursor-text"
          style={{ ...editorVars, maxWidth: editorMaxWidth } as React.CSSProperties}
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
