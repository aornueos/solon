import { marked } from "marked";
import TurndownService from "turndown";
// `turndown-plugin-gfm` não publica tipos; a shim fica em `src/types/shims.d.ts`.
import { gfm, tables, strikethrough } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";

/** Narrow turndown Node type — a propriedade `isBlock` é adicionada pelo
 *  turndown ao DOM node em runtime mas não está em `HTMLElement`. */
type TurndownNode = HTMLElement & { isBlock: boolean };

/**
 * Markdown ↔ HTML bridge para o TipTap.
 *
 * Segurança: passamos o HTML gerado por `marked` por DOMPurify antes de
 * entregar ao editor. Isso bloqueia `<script>`, handlers `on*`, `javascript:`,
 * etc. que poderiam ser injetados via Markdown malicioso (documento que
 * veio de outra máquina, colado do clipboard, etc.).
 *
 * Conhecido — IndentExtension (text-indent) não é persistido em Markdown.
 */

marked.setOptions({
  gfm: true,       // GFM: tabelas, ~~strike~~, task lists
  breaks: false,
  pedantic: false,
});

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
  blankReplacement: (_, node) =>
    (node as TurndownNode).isBlock ? "\n\n" : "",
});

// Plugins GFM: tabelas + strike + checkboxes
turndown.use([gfm, tables, strikethrough]);

turndown.addRule("paragraphStrip", {
  filter: "p",
  replacement: (content) => `\n\n${content}\n\n`,
});

/**
 * Tags/atributos permitidos no HTML renderizado. Lista mínima baseada no
 * que o schema do TipTap já aceita — qualquer coisa fora disso é ruído ou
 * vetor de XSS.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "em", "s", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
];

/**
 * Atributos seguros. Removemos `style`, `on*`, `srcdoc`, etc.
 * `colspan`/`rowspan` são úteis em tabelas e não abrem vetores.
 */
const ALLOWED_ATTR = ["colspan", "rowspan", "colwidth", "align"];

export function markdownToHtml(md: string): string {
  if (!md) return "";
  const rawHtml = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Garante que não sobra href="javascript:..." ou similares.
    FORBID_ATTR: ["style", "srcdoc", "href", "src", "onerror", "onload"],
  });
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  return turndown.turndown(html).trim();
}
