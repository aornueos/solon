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
 * Persistencia de atributos editoriais:
 *  - IndentExtension (text-indent estilo romance): marker EM SPACE no
 *    inicio do paragrafo. Marked passa direto, post-processing reaplica
 *    `data-indent="true"` antes do sanitize.
 *  - TextAlign (alinhamento): emitido como `<p style="text-align: …">`
 *    HTML literal. Marked passa HTML inline direto.
 *  - Highlight (grifo colorido): emitido como `<mark style="background-
 *    color: …">` HTML literal.
 */

// EM SPACE como constante nomeada — o codepoint U+2003 e' invisivel no
// codigo-fonte e foda de identificar. Usamos como marker do indent porque
// e' "neutro" em markdown (nao quebra parser nem visualiza estranho).
const EM_SPACE = " ";

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
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const indented = el.getAttribute("data-indent") === "true";
    const prefix = indented ? EM_SPACE : "";
    // TextAlign: emite HTML literal quando ha alinhamento custom.
    const align = el.style.textAlign;
    if (align && align !== "left" && align !== "start") {
      return `\n\n<p style="text-align: ${align}">${prefix}${content}</p>\n\n`;
    }
    return `\n\n${prefix}${content}\n\n`;
  },
});

// Highlight (grifo) — emite <mark> com style preservado.
turndown.addRule("highlight", {
  filter: "mark",
  replacement: (content, node) => {
    const bg = (node as HTMLElement).style.backgroundColor;
    if (bg) {
      return `<mark style="background-color: ${bg}">${content}</mark>`;
    }
    return `<mark>${content}</mark>`;
  },
});

// Headings com text-align: emite HTML literal (perde sintaxe `#` mas
// preserva alinhamento). Turndown default nao suporta atributos em
// headings markdown.
for (const level of [1, 2, 3, 4, 5, 6] as const) {
  turndown.addRule(`heading${level}WithAlign`, {
    filter: (node) => {
      if (node.nodeName !== `H${level}`) return false;
      const align = (node as HTMLElement).style.textAlign;
      return !!align && align !== "left" && align !== "start";
    },
    replacement: (content, node) => {
      const align = (node as HTMLElement).style.textAlign;
      return `\n\n<h${level} style="text-align: ${align}">${content}</h${level}>\n\n`;
    },
  });
}

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
  // <mark> e' usado pelo Highlight extension. Sem isso o grifo
  // colorido seria stripado no save/load roundtrip.
  "mark",
];

/**
 * Atributos seguros. `style` esta na whitelist pra suportar:
 *  - text-align (TextAlign extension)
 *  - background-color (Highlight extension, cores customizadas)
 *
 * O DOMPurify ja' sanitiza o conteudo do `style` internamente — bloqueia
 * `expression()`, `javascript:`, `-moz-binding`, etc. Como o markdown
 * vem so' de input do proprio user (nao de fontes hostis externas no
 * caso desktop), o risco residual e' baixo.
 *
 * `data-indent` carrega indent do IndentExtension sem precisar de style.
 */
const ALLOWED_ATTR = [
  "colspan",
  "rowspan",
  "colwidth",
  "align",
  "data-indent",
  "style",
];

export function markdownToHtml(md: string): string {
  if (!md) return "";
  const rawHtml = marked.parse(md, { async: false }) as string;
  // Reverse do marker EM SPACE: paragrafos cujo conteudo comeca com EM
  // SPACE sao identados. A regex pega `<p>` ou `<p ... >` (caso
  // marked adicione atributos no futuro). Removemos o marker pra que
  // ele nao apareca como texto literal no editor.
  const withIndent = rawHtml.replace(
    new RegExp(`<p([^>]*)>${EM_SPACE}`, "g"),
    '<p data-indent="true"$1>',
  );
  return DOMPurify.sanitize(withIndent, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // `style` saiu do FORBID porque virou whitelist (suporta text-align
    // e highlight color). Mantemos os outros vetores classicos de XSS.
    FORBID_ATTR: ["srcdoc", "href", "src", "onerror", "onload"],
  });
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  // Trim CONSERVADOR: so' newlines e space ASCII. Nao usamos `.trim()`
  // padrao porque ele considera EM SPACE como whitespace e come o
  // marker de indent do primeiro paragrafo.
  return turndown
    .turndown(html)
    .replace(/^[\n ]+/, "")
    .replace(/[\n ]+$/, "\n");
}
