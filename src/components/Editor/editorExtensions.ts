import type { Extensions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Blockquote from "@tiptap/extension-blockquote";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import HardBreak from "@tiptap/extension-hard-break";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import History from "@tiptap/extension-history";
import Link from "@tiptap/extension-link";
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
import { HeadingNavExtension } from "./HeadingNavExtension";
import { WikilinkExtension } from "./WikilinkExtension";
import { CollapsibleHeadingsExtension } from "./CollapsibleHeadingsExtension";
import { SpellcheckExtension } from "./SpellcheckExtension";
import { FindHighlightExtension } from "./FindHighlightExtension";
import { EditorImageExtension } from "./EditorImageExtension";
import { HtmlCommentInlineNode, HtmlCommentNode } from "./HtmlCommentNode";

// A marca de link do TipTap não guarda o `title` de `[x](url "título")`,
// e ele sumia no salvamento.
const LinkWithTitle = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: { default: null },
    };
  },
});

/**
 * Extensões do editor de texto. Ficam num módulo só para que o editor e
 * o teste de fidelidade do Markdown usem exatamente o mesmo schema — um
 * teste com schema próprio não pegaria nó ou marca faltando.
 */
export function createEditorExtensions(): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Bold,
    Italic,
    Strike,
    Underline,
    Blockquote,
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    Code,
    CodeBlock,
    // Shift+Enter e o "dois espaços + quebra" do Markdown. Sem o nó, a
    // quebra de linha sumia ao abrir o arquivo.
    HardBreak,
    HorizontalRule,
    History,
    // Link comum `[texto](url)`. Sem a marca, o editor descartava o <a> e
    // a URL sumia do arquivo no primeiro salvamento. Clique não navega:
    // Ctrl+clique abre no navegador (tratado no Editor).
    LinkWithTitle.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
    }),
    Typography,
    CharacterCount,
    SpellcheckExtension,
    FindHighlightExtension,
    WikilinkExtension,
    // Ordem: HeadingNav ANTES de IndentExtension. Ambos respondem a
    // Tab/Shift+Tab; TipTap testa em ordem e o primeiro que retornar
    // `true` consome o evento. HeadingNav só age se cursor esta em
    // heading; senao retorna false e o Indent assume.
    HeadingNavExtension,
    CollapsibleHeadingsExtension,
    IndentExtension,
    ListExitExtension,
    SmartDashesExtension,
    Table.configure({ resizable: true, HTMLAttributes: { class: "solon-table" } }),
    TableRow,
    TableHeader,
    TableCell,
    // Alinhamento de texto: paragrafos + headings. Default 'left' não
    // é explicitamente settado (vira null/undefined no atributo) pra
    // que markdown sem alinhamento permaneca markdown sem alinhamento.
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    // Highlight (grifo) com cores. `multicolor: true` permite marcar
    // texto com cor especifica via setHighlight({ color: '#...' });
    // `false` só permite toggle on/off (cor padrão). Queremos cores.
    Highlight.configure({
      multicolor: true,
      HTMLAttributes: { class: "solon-mark" },
    }),
    EditorImageExtension,
    HtmlCommentNode,
    HtmlCommentInlineNode,
    // Placeholder vazio — o user não queria a frase "Comece a escrever
    // sua historia..." aparecendo. Mantemos a Extension instalada
    // (é lightweight) caso queiramos placeholders dinamicos por nota
    // Sem título derivado do frontmatter ainda; fica em branco.
    Placeholder.configure({
      placeholder: "",
    }),
  ];
}
