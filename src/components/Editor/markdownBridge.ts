import { marked } from "marked";
import TurndownService from "turndown";
// `turndown-plugin-gfm` não publica tipos; a shim fica em `src/types/shims.d.ts`.
import { gfm, tables, strikethrough } from "turndown-plugin-gfm";
import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";

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

// Marcadores por escape para evitar caracteres invisiveis no fonte.
// EM SPACE = indent editorial; NBSP = espacos visuais digitados pelo user.
const EM_SPACE = "\u2003";
const NBSP = "\u00a0";
const EMPTY_PARAGRAPH_HTML = "<p><br></p>";

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "div", "dl",
  "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p",
  "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "ul",
]);

const PRESERVE_SPACE_TAGS = new Set(["code", "pre"]);

function tagNameOf(token: string): string | null {
  const match = token.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function isClosingTag(token: string): boolean {
  return /^<\//.test(token);
}

function isSelfClosingTag(token: string): boolean {
  return /\/>$/.test(token) || /^<\s*(br|hr)\b/i.test(token);
}

function protectSpaceRun(run: string, atBlockStart: boolean, offset: number, source: string): string {
  const atStart = atBlockStart && offset === 0;
  const atEnd = run.length > 1 && offset + run.length === source.length;
  if (atStart || atEnd) return NBSP.repeat(run.length);
  if (run.length > 1) return ` ${NBSP.repeat(run.length - 1)}`;
  return run;
}

function protectTextSpaces(text: string, atBlockStart: boolean): string {
  return text.replace(/ +/g, (run, offset, source) =>
    protectSpaceRun(run, atBlockStart, offset, source),
  );
}

/**
 * Turndown colapsa/remover espacos ASCII antes das regras rodarem. Isso
 * destrói exatamente o que escritor usa para respiro visual: recuo manual,
 * alinhamento com espacos, e linhas com multiplos espacos. Antes de entregar
 * o HTML ao Turndown, transformamos apenas espacos significativos em NBSP.
 *
 * Markdown normal comeca com 4 espacos = code block; NBSP preserva visual sem
 * mudar a semantica do paragrafo.
 */
function protectEditorSpaces(html: string): string {
  const tokens = html.split(/(<[^>]+>)/g);
  let preserveDepth = 0;
  let atBlockStart = true;

  return tokens
    .map((token) => {
      if (!token) return token;
      if (token.startsWith("<")) {
        const name = tagNameOf(token);
        if (!name) return token;

        const closing = isClosingTag(token);
        if (PRESERVE_SPACE_TAGS.has(name)) {
          preserveDepth += closing ? -1 : 1;
          preserveDepth = Math.max(0, preserveDepth);
        }
        if (!closing && (BLOCK_TAGS.has(name) || name === "br")) {
          atBlockStart = true;
        }
        if (closing && BLOCK_TAGS.has(name)) {
          atBlockStart = false;
        }
        if (isSelfClosingTag(token) && BLOCK_TAGS.has(name)) {
          atBlockStart = true;
        }
        return token;
      }

      if (preserveDepth > 0) return token;
      const protectedText = protectTextSpaces(token, atBlockStart);
      if (token.replace(/ +/g, "").length > 0) {
        atBlockStart = false;
      }
      return protectedText;
    })
    .join("");
}

function isVisuallyEmptyParagraph(node: HTMLElement): boolean {
  if (node.nodeName !== "P") return false;
  const text = (node.textContent ?? "").replace(/\u00a0/g, "").trim();
  return text.length === 0;
}

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
  blankReplacement: (_, node) => {
    const el = node as HTMLElement & TurndownNode;
    if (isVisuallyEmptyParagraph(el)) {
      return `\n\n${EMPTY_PARAGRAPH_HTML}\n\n`;
    }
    return el.isBlock ? "\n\n" : "";
  },
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

turndown.addRule("emptyParagraph", {
  filter: (node) => isVisuallyEmptyParagraph(node as HTMLElement),
  replacement: () => `\n\n${EMPTY_PARAGRAPH_HTML}\n\n`,
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

turndown.addRule("editorImage", {
  filter: "img",
  replacement: (_, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("data-solon-src") || el.getAttribute("src") || "";
    if (!src) return "";
    const alt = (el.getAttribute("alt") || "").replace(/]/g, "\\]");
    const title = el.getAttribute("title");
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
    return `\n\n![${alt}](${src}${titlePart})\n\n`;
  },
});

// Wikilinks `[[name]]` — quando a mark "wikilink" do TipTap esta
// presente, o HTML tem `<a class="wikilink">name</a>` (ou
// `data-wikilink="true"`). Capturamos antes do default link rule pra
// emitir a sintaxe `[[...]]` em vez de `[name](href)`. Ordem importa:
// essa rule tem que vir antes da default; turndown testa em ordem
// inversa de adicao, entao adicionamos POR ULTIMO entre as link rules
// (qualquer rule de link aqui em cima dispara antes do default).
turndown.addRule("wikilink", {
  filter: (node) => {
    if (node.nodeName !== "A") return false;
    const el = node as HTMLElement;
    return (
      el.classList.contains("wikilink") ||
      el.getAttribute("data-wikilink") === "true"
    );
  },
  replacement: (content) => `[[${content}]]`,
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
  "img",
  // <a> pra wikilinks (mark `[[name]]`). Roundtrip emite back pra
  // `[[name]]`; durante a edicao o WikilinkExtension reconhece o
  // <a.wikilink>.
  "a",
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
  // Wikilink: o `class="wikilink"` + `data-wikilink="true"` viaja
  // junto do <a>. `role` mantemos pra acessibilidade. `href` fica
  // FORBID porque o click eh interceptado pelo Editor (javascript:
  // void(0) eh tratado como vazio pra que DOMPurify nao bloqueie
  // a wikilink toda — `class` e' o seletor real).
  "class",
  "data-wikilink",
  "data-solon-src",
  "src",
  "alt",
  "title",
  "role",
];

function sanitizeEditorHtml(html: string): string {
  const purifier = DOMPurify as typeof DOMPurify & {
    sanitize?: (dirty: string, config?: DOMPurifyConfig) => string;
  };
  if (typeof purifier.sanitize !== "function") {
    return html;
  }
  return purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // `style` saiu do FORBID porque virou whitelist (suporta text-align
    // e highlight color). Mantemos os outros vetores classicos de XSS.
    FORBID_ATTR: ["srcdoc", "href", "onerror", "onload"],
  });
}

/**
 * Substitui ocorrencias de `[[name]]` por `<a class="wikilink" ...>...</a>`
 * ANTES do marked parsear. Sem isso, o marked pode entender o conteudo
 * como link reference style ou ignorar — qualquer um quebra o
 * roundtrip. Fazendo a substituicao primeiro, garantimos que o output
 * eh um `<a>` que a WikilinkExtension reconhece.
 *
 * Regra: `[[X]]` onde X nao tem `]` ou newline. Caso de uso comum:
 * nome de arquivo curto. Edge cases (markdown que quer LITERAL `[[`)
 * podem usar escape `\[\[` que esta fora do escopo agora.
 */
function injectWikilinks(md: string): string {
  return md.replace(/\[\[([^\]\n]+)\]\]/g, (_, target) => {
    const safe = String(target)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `<a class="wikilink" data-wikilink="true" role="link">${safe}</a>`;
  });
}

export function markdownToHtml(md: string): string {
  if (!md) return "";
  // 1) wikilinks PRIMEIRO — substitui [[...]] por <a class="wikilink">
  //    antes do marked, pra que o parser markdown trate como HTML
  //    inline (passa direto sem interpretar).
  // 2) marked converte o resto pra HTML.
  const withWikilinks = injectWikilinks(md);
  const rawHtml = marked.parse(withWikilinks, { async: false }) as string;
  // Reverse do marker EM SPACE: paragrafos cujo conteudo comeca com EM
  // SPACE sao identados. A regex pega `<p>` ou `<p ... >` (caso
  // marked adicione atributos no futuro). Removemos o marker pra que
  // ele nao apareca como texto literal no editor.
  const withIndent = rawHtml.replace(
    new RegExp(`<p([^>]*)>${EM_SPACE}`, "g"),
    '<p data-indent="true"$1>',
  );
  return sanitizeEditorHtml(withIndent);
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  // Trim CONSERVADOR: so' newlines e space ASCII. Nao usamos `.trim()`
  // padrao porque ele considera EM SPACE como whitespace e come o
  // marker de indent do primeiro paragrafo.
  return turndown
    .turndown(protectEditorSpaces(html))
    .replace(/^[\n ]+/, "")
    .replace(/[\n ]+$/, "\n");
}
