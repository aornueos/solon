import { marked, type Tokens } from "marked";
import TurndownService from "turndown";
// `turndown-plugin-gfm` não publica tipos; a shim fica em `src/types/shims.d.ts`.
import { gfm, tables, strikethrough } from "turndown-plugin-gfm";
import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";
import { getHTMLFromFragment } from "@tiptap/core";
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";

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
 * Markdown normal começa com 4 espacos = code block; NBSP preserva visual sem
 * mudar a semântica do paragrafo.
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

/** Comentário HTML sozinho num bloco: `<!-- nota -->`. */
const BLOCK_COMMENT_RE = /^\s*<!--([\s\S]*?)-->\s*$/;

/**
 * O texto do comentário viaja codificado no atributo: o DOMPurify corta
 * espaço das pontas de todo atributo (e "<!-- nota -->" voltaria como
 * "<!--nota-->") e descarta atributo com "-->" dentro.
 */
export function encodeCommentText(text: string): string {
  return encodeURIComponent(text);
}

export function decodeCommentText(encoded: string | null): string {
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

type ListToken = Tokens.List;
type ListItemToken = Tokens.ListItem;

/** Primeiro token de texto do item, onde entra o marcador `[ ]`. */
function prependToItemText(item: ListItemToken, prefix: string): void {
  const first = item.tokens[0] as (Tokens.Text | Tokens.Paragraph | undefined);
  if (first && (first.type === "text" || first.type === "paragraph")) {
    first.text = prefix + first.text;
    const inner = first.tokens?.[0];
    if (inner && inner.type === "text") {
      (inner as Tokens.Text).text = prefix + (inner as Tokens.Text).text;
    }
    return;
  }
  item.tokens.unshift({ type: "text", raw: prefix, text: prefix } as Tokens.Text);
}

// Renderizadores no formato que o schema do editor entende. Devolver
// `false` cai no renderizador padrão do marked.
marked.use({
  renderer: {
    // Lista de tarefas vira o `taskList` do TipTap. Lista mista (tarefa e
    // item comum juntos) não tem nó no editor: o marcador fica como texto
    // "[ ] " e volta igual ao salvar.
    list(token: ListToken) {
      const tasks = token.items.filter((item) => item.task).length;
      if (tasks === 0) return false;
      if (token.ordered || tasks !== token.items.length) {
        for (const item of token.items) {
          if (!item.task) continue;
          item.task = false;
          prependToItemText(item, item.checked ? "[x] " : "[ ] ");
        }
        return false;
      }
      const body = token.items
        .map((item) => {
          const [first, ...rest] = item.tokens;
          const lead =
            first && (first.type === "text" || first.type === "paragraph")
              ? `<p>${this.parser.parseInline((first as Tokens.Text).tokens ?? [first])}</p>`
              : this.parser.parse(first ? [first] : []);
          const nested = rest.length ? this.parser.parse(rest) : "";
          return `<li data-type="taskItem" data-checked="${item.checked ? "true" : "false"}">${lead}${nested}</li>\n`;
        })
        .join("");
      return `<ul data-type="taskList">\n${body}</ul>\n`;
    },
    // Alinhamento de coluna (`:-:`, `--:`) vira alinhamento do parágrafo
    // da célula, que é o que o editor guarda.
    tablecell(token: Tokens.TableCell) {
      if (token.align !== "center" && token.align !== "right") return false;
      const type = token.header ? "th" : "td";
      const content = this.parser.parseInline(token.tokens);
      return `<${type}><p style="text-align: ${token.align}">${content}</p></${type}>\n`;
    },
    // Comentário vira nó do editor em vez de sumir: bloco quando está
    // numa linha própria, inline quando está no meio do texto.
    html(token: Tokens.HTML | Tokens.Tag) {
      const match = token.text.match(BLOCK_COMMENT_RE);
      if (!match) return false;
      const text = encodeCommentText(match[1]);
      return "block" in token && token.block
        ? `<div data-solon-comment="${text}"></div>\n`
        : `<span data-solon-comment="${text}"></span>`;
    },
    // Imagem sozinha no parágrafo é bloco no editor; embrulhada em <p> o
    // editor a tirava do parágrafo e deixava um parágrafo vazio no lugar.
    paragraph(token: Tokens.Paragraph) {
      const meaningful = token.tokens.filter(
        (t) => !(t.type === "text" && !t.raw.trim()),
      );
      if (meaningful.length !== 1 || meaningful[0].type !== "image") return false;
      return `${this.parser.parseInline(meaningful)}\n`;
    },
  },
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

// CRITICAL: override do `escape()` do turndown pra NAO escapar `*`.
//
// O default escapa `*` literal em texto pra `\*` (proteger contra
// markdown unintended). Mas isso causa um ciclo destrutivo quando o
// editor perde o bold mark por qualquer motivo (race entre setContent
// e onUpdate, doc carregado de markdown já corrompido, etc):
//
//   1. Editor tem `<p>**Onirica**</p>` (texto literal, sem <strong>)
//   2. turndown vê asteriscos em texto -> escapa -> `\*\*Onirica\*\*`
//   3. Salva no disco
//   4. Reload: marked.parse(`\*\*Onirica\*\*`) -> `<p>**Onirica**</p>`
//      (sem strong — backslashes dizem ao marked pra tratar como literal)
//   5. Editor exibe `**Onirica**` literal. Volta ao passo 1.
//
// Sem escape de `*`, o passo 2 emite `**Onirica**` (sem backslashes).
// No reload, marked vê `**Onirica**` e parseia como strong de novo —
// **o bold se auto-recupera**.
//
// Trade-off: usuário que digita `*` ou `**` LITERAL como texto pode
// ter parse acidental como bold/italic. Em ficcao isso é raro
// (raramente se escreve "* asterisco" em prosa). O ganho — bold
// estável no roundtrip — supera o risco.
//
// Tambem mantemos escape de `_` (italic markdown alternativo) por
// motivo similar; underscores em palavras como `meta_data` no texto
// não devem virar italic. Hash, backtick, brackets, etc continuam
// escapados — eles tem sintaxe markdown clara que não bate com prosa.
const TurndownEscape = (
  TurndownService.prototype as unknown as { escape: (s: string) => string }
).escape;
turndown.escape = function (string: string): string {
  // Aplica o escape default e desfaz escapes dos marcadores inline que o
  // próprio editor gera. Runs antigos de barras antes de `*` eram a causa
  // do bug visual `\\\\\*` ao trocar de arquivo.
  const escaped = TurndownEscape.call(this, string);
  return unescapeInertBrackets(repairEscapedInlineMarks(escaped));
};

/**
 * O turndown escapa todo colchete, e "[risos]" ia para o arquivo como
 * "\[risos\]" — e a nota de rodapé "[^1]" como "\[^1\]". Só precisa de
 * escape o colchete que formaria link: seguido de "(" ou "[", ou uma
 * definição "[x]: ...". A exceção é "[^n]:", que é definição de rodapé e
 * não vira link.
 */
function unescapeInertBrackets(markdown: string): string {
  return markdown
    .replace(/\\\[(\^[^\]\\\n]+)\\\]:/g, "[$1]:")
    .replace(/\\\[([^\]\\\n]*)\\\](?![(\[:])/g, "[$1]");
}

// Plugins GFM: tabelas + strike + checkboxes
turndown.use([gfm, tables, strikethrough]);

/** Item de lista ao qual o parágrafo pertence (direto ou dentro do
 *  `<div>` do item de tarefa), ou null. */
function owningListItem(node: HTMLElement): HTMLElement | null {
  const parent = node.parentNode as HTMLElement | null;
  if (!parent) return null;
  if (parent.nodeName === "LI") return parent;
  const grand = parent.parentNode as HTMLElement | null;
  if (parent.nodeName === "DIV" && grand?.nodeName === "LI") return grand;
  return null;
}

function paragraphCount(container: HTMLElement): number {
  let count = 0;
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeName === "P") count += 1;
    if (child.nodeName === "DIV") count += paragraphCount(child as HTMLElement);
  }
  return count;
}

turndown.addRule("paragraphStrip", {
  filter: "p",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const parentName = el.parentNode?.nodeName;
    // Célula de tabela: tudo numa linha só, senão a tabela quebra.
    if (parentName === "TH" || parentName === "TD") {
      return content.replace(/\n+/g, " ").trim() + (el.nextElementSibling ? "<br>" : "");
    }
    // Item com um parágrafo só fica compacto ("- item"), como no
    // arquivo original; com mais de um, os parágrafos se separam.
    const item = owningListItem(el);
    if (item && paragraphCount(item) === 1) return content;

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

/** Marcador + recuo das linhas seguintes, no padrão CommonMark. */
function listItemMarkdown(content: string, marker: string, node: HTMLElement): string {
  const indent = " ".repeat(marker.length);
  const body = content
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n")
    .replace(/\n(?!$)/g, `\n${indent}`);
  const tail = node.nextSibling && !/\n$/.test(body) ? "\n" : "";
  return marker + body + tail;
}

// Item de lista compacto: "- item" e "1. item" em vez do "-   item" com
// linha em branco entre itens que o turndown produz por padrão. Respeita
// o número inicial da lista ("5. quinto").
turndown.addRule("listItemCompact", {
  filter: (node) =>
    node.nodeName === "LI" && (node as HTMLElement).getAttribute("data-type") !== "taskItem",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const parent = el.parentNode as HTMLElement;
    let marker = "- ";
    if (parent.nodeName === "OL") {
      const start = Number(parent.getAttribute("start") ?? "1") || 1;
      const index = Array.prototype.indexOf.call(parent.children, el);
      marker = `${start + index}. `;
    }
    return listItemMarkdown(content, marker, el);
  },
});

turndown.addRule("taskItem", {
  filter: (node) =>
    node.nodeName === "LI" && (node as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const checked = el.getAttribute("data-checked") === "true";
    return listItemMarkdown(content, checked ? "- [x] " : "- [ ] ", el);
  },
});

// A caixinha visível do item de tarefa: o estado já vai no marcador.
turndown.addRule("taskItemCheckbox", {
  filter: (node) =>
    node.nodeName === "LABEL" &&
    (node.parentNode as HTMLElement | null)?.getAttribute?.("data-type") === "taskItem",
  replacement: () => "",
});

// O plugin GFM escreve tachado com um til só (`~x~`). É válido, mas muda
// o arquivo de quem escreveu `~~x~~`, que é a forma comum.
turndown.addRule("strikeDouble", {
  filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: (content) => `~~${content}~~`,
});

turndown.addRule("underline", {
  filter: "u",
  replacement: (content) => `<u>${content}</u>`,
});

// `<https://site>` volta como autolink em vez de `[https://site](https://site)`.
turndown.addRule("autolink", {
  filter: (node) => {
    if (node.nodeName !== "A") return false;
    const el = node as HTMLElement;
    const href = el.getAttribute("href");
    return !!href && !el.getAttribute("title") && el.textContent === href;
  },
  replacement: (_, node) => `<${(node as HTMLElement).getAttribute("href")}>`,
});

turndown.addRule("htmlComment", {
  filter: (node) =>
    (node.nodeName === "DIV" || node.nodeName === "SPAN") &&
    (node as HTMLElement).hasAttribute("data-solon-comment"),
  replacement: (_, node) => {
    const text = decodeCommentText((node as HTMLElement).getAttribute("data-solon-comment"));
    return node.nodeName === "DIV" ? `\n\n<!--${text}-->\n\n` : `<!--${text}-->`;
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
    const title = el.getAttribute("title");
    // Imagem redimensionada: o `![]()` não guarda tamanho, então vai como
    // HTML — que o GitHub, o Obsidian e o Typora também mostram no tamanho.
    const width = el.getAttribute("width");
    if (width) {
      const attr = (name: string, value: string) => ` ${name}="${escapeHtmlAttr(value)}"`;
      return `\n\n<img${attr("src", src)}${attr("alt", el.getAttribute("alt") || "")}${
        title ? attr("title", title) : ""
      }${attr("width", width)}>\n\n`;
    }
    const alt = (el.getAttribute("alt") || "").replace(/]/g, "\\]");
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
    return `\n\n![${alt}](${src}${titlePart})\n\n`;
  },
});

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Wikilinks `[[name]]` — quando a mark "wikilink" do TipTap esta
// presente, o HTML tem `<a class="wikilink">name</a>` (ou
// `data-wikilink="true"`). Capturamos antes do default link rule pra
// emitir a sintaxe `[[...]]` em vez de `[name](href)`. Ordem importa:
// essa rule tem que vir antes da default; turndown testa em ordem
// inversa de adicao, então adicionamos POR ULTIMO entre as link rules
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
  replacement: (content, node) => {
    const target = (node as HTMLElement).getAttribute("data-target");
    if (target && target.trim() && target.trim() !== content.trim()) {
      return `[[${target.trim()}|${content}]]`;
    }
    return `[[${content}]]`;
  },
});

// Headings com text-align: emite HTML literal (perde sintaxe `#` mas
// preserva alinhamento). Turndown default não suporta atributos em
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
export const ALLOWED_TAGS = [
  // `marked` emite <del> para ~~strike~~; o editor (TipTap Strike) parseia
  // <s>/<del>/<strike>. Sem <del>/<strike> aqui o sanitize de produção
  // engolia o tachado na carga — o texto sobrevivia, a formatação não.
  "p", "br", "hr", "strong", "em", "s", "del", "strike", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  // <mark> é usado pelo Highlight extension. Sem isso o grifo
  // colorido seria stripado no save/load roundtrip.
  "mark",
  "img",
  "u",
  // Comentário HTML (`HtmlCommentNode`) viaja como <div>/<span>
  // data-solon-comment.
  "div",
  "span",
  // <a> pra wikilinks (mark `[[name]]`). Roundtrip emite back pra
  // `[[name]]`; durante a edição o WikilinkExtension reconhece o
  // <a.wikilink>.
  "a",
];

/**
 * Atributos seguros. `style` esta na whitelist pra suportar:
 *  - text-align (TextAlign extension)
 *  - background-color (Highlight extension, cores customizadas)
 *
 * O DOMPurify já sanitiza o conteudo do `style` internamente — bloqueia
 * `expression()`, `javascript:`, `-moz-binding`, etc. Como o markdown
 * vem só de input do próprio user (não de fontes hostis externas no
 * caso desktop), o risco residual é baixo.
 *
 * `data-indent` carrega indent do IndentExtension sem precisar de style.
 */
export const ALLOWED_ATTR = [
  "colspan",
  "rowspan",
  "colwidth",
  "align",
  "data-indent",
  "style",
  // Wikilink: o `class="wikilink"` + `data-wikilink="true"` viaja
  // junto do <a>. `role` mantemos pra acessibilidade. `href` fica
  // FORBID porque o click eh interceptado pelo Editor (javascript:
  // void(0) eh tratado como vazio pra que DOMPurify não bloqueie
  // a wikilink toda — `class` é o seletor real).
  "class",
  "data-wikilink",
  // Alias `[[target|exibido]]`: o alvo real viaja aqui. Sem isso na
  // allowlist o sanitize de produção engole o target e a wikilink
  // passa a apontar pro rótulo (mesma classe de bug do <del>).
  "data-target",
  "data-solon-src",
  "src",
  "alt",
  "title",
  // Largura da imagem redimensionada (`<img width="320">`).
  "width",
  "role",
  // Link comum. O DOMPurify já barra protocolos perigosos (javascript:,
  // data: em href); http(s), mailto e caminhos relativos passam.
  "href",
  // Lista numerada que não começa em 1.
  "start",
  // Lista de tarefas e comentário HTML.
  "data-type",
  "data-checked",
  "data-solon-comment",
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
    // e highlight color); `href` saiu quando o editor ganhou link comum.
    // Mantemos os outros vetores classicos de XSS.
    FORBID_ATTR: ["srcdoc", "onerror", "onload"],
  });
}

function normalizeNestedMarks(html: string): string {
  let next = html;
  let prev = "";
  while (next !== prev) {
    prev = next;
    next = next
      .replace(/<(strong|em|s|code)(\s[^>]*)?>\s*<\1(?:\s[^>]*)?>/gi, "<$1$2>")
      .replace(/<\/(strong|em|s|code)>\s*<\/\1>/gi, "</$1>");
  }
  return next;
}

function repairLiteralMarksInText(text: string): string {
  return text
    .replace(/(?:&#42;|&#x2a;|&ast;)/gi, "*")
    .replace(/(?:&#126;|&#x7e;)/gi, "~")
    .replace(/\*\*\*([^*\n][\s\S]*?[^*\n]|\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*\n][\s\S]*?[^*\n]|\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*([^*\n][^*\n]*?[^*\n]|\S)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~([^~\n][\s\S]*?[^~\n]|\S)~~/g, "<s>$1</s>");
}

function repairLiteralMarkdownMarksInHtml(html: string): string {
  const tokens = html.split(/(<[^>]+>)/g);
  let blockedDepth = 0;
  return tokens
    .map((token) => {
      if (!token) return token;
      if (token.startsWith("<")) {
        const name = tagNameOf(token);
        if (name && (name === "code" || name === "pre")) {
          if (isClosingTag(token)) {
            blockedDepth = Math.max(0, blockedDepth - 1);
          } else if (!isSelfClosingTag(token)) {
            blockedDepth += 1;
          }
        }
        return token;
      }
      if (blockedDepth > 0) return token;
      return repairLiteralMarksInText(token);
    })
    .join("");
}

function repairEscapedInlineMarks(markdown: string): string {
  let next = markdown;
  let prev = "";
  while (next !== prev) {
    prev = next;
    next = next
      .replace(/\\+(\*{1,3})/g, "$1")
      .replace(/\\+(~{2})/g, "$1");
  }
  return next;
}

/**
 * Substitui ocorrencias de `[[name]]` por `<a class="wikilink" ...>...</a>`
 * ANTES do marked parsear. Sem isso, o marked pode entender o conteudo
 * como link reference style ou ignorar — qualquer um quebra o
 * roundtrip. Fazendo a substituicao primeiro, garantimos que o output
 * eh um `<a>` que a WikilinkExtension reconhece.
 *
 * Regra: `[[X]]` onde X não tem `]` ou newline. Caso de uso comum:
 * nome de arquivo curto. Edge cases (markdown que quer LITERAL `[[`)
 * podem usar escape `\[\[` que esta fora do escopo agora.
 */
function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectWikilinks(md: string): string {
  return md.replace(/\[\[([^\]\n]+)\]\]/g, (_, inner) => {
    // `[[target|exibido]]` → alias; `[[nome]]` → target = texto.
    const pipe = String(inner).indexOf("|");
    if (pipe !== -1) {
      const target = String(inner).slice(0, pipe).trim();
      const display = String(inner).slice(pipe + 1).trim();
      if (target && display) {
        return `<a class="wikilink" data-wikilink="true" data-target="${escapeForHtml(
          target,
        )}" role="link">${escapeForHtml(display)}</a>`;
      }
    }
    return `<a class="wikilink" data-wikilink="true" role="link">${escapeForHtml(
      String(inner),
    )}</a>`;
  });
}

export function markdownToHtml(md: string): string {
  if (!md) return "";
  // 1) wikilinks PRIMEIRO — substitui [[...]] por <a class="wikilink">
  //    antes do marked, pra que o parser markdown trate como HTML
  //    inline (passa direto sem interpretar).
  // 2) marked converte o resto pra HTML.
  const withWikilinks = injectWikilinks(repairEscapedInlineMarks(md));
  const rawHtml = marked.parse(withWikilinks, { async: false }) as string;
  const withRepairedMarks = repairLiteralMarkdownMarksInHtml(rawHtml);
  // Reverse do marker EM SPACE: paragrafos cujo conteudo começa com EM
  // SPACE são identados. A regex pega `<p>` ou `<p ... >` (caso
  // marked adicione atributos no futuro). Removemos o marker pra que
  // ele não apareca como texto literal no editor.
  const withIndent = withRepairedMarks.replace(
    new RegExp(`<p([^>]*)>${EM_SPACE}`, "g"),
    '<p data-indent="true"$1>',
  );
  // Parágrafo vazio guardado como `<p><br></p>`: com o nó de quebra de
  // linha no editor, o <br> viraria uma quebra dentro do parágrafo (duas
  // linhas de altura). Vazio de verdade é `<p></p>`.
  const withEmptyParagraphs = withIndent.split(EMPTY_PARAGRAPH_HTML).join("<p></p>");
  return normalizeNestedMarks(sanitizeEditorHtml(withEmptyParagraphs));
}

/**
 * Ajustes no HTML do editor antes do turndown:
 * - `<colgroup>` das tabelas do editor impedia o plugin GFM de reconhecer
 *   a linha de cabeçalho, e a tabela ia para o arquivo como HTML cru;
 * - alinhamento centralizado/à direita do parágrafo da célula de
 *   cabeçalho vira `align` da coluna (`:-:`, `--:`).
 */
function prepareEditorHtml(html: string): string {
  return html
    .replace(/<colgroup>[\s\S]*?<\/colgroup>/g, "")
    .replace(
      /<th([^>]*)>(\s*<p[^>]*style="[^"]*text-align:\s*(center|right)[^"]*")/g,
      '<th$1 align="$3">$2',
    );
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  return repairEscapedInlineMarks(finishMarkdown(turndownEditorHtml(html)));
}

function turndownEditorHtml(html: string): string {
  return turndown.turndown(protectEditorSpaces(prepareEditorHtml(html)));
}

// Trim CONSERVADOR: só newlines e space ASCII. Nao usamos `.trim()`
// padrão porque ele considera EM SPACE como whitespace e come o
// marker de indent do primeiro paragrafo.
function finishMarkdown(markdown: string): string {
  return markdown.replace(/^[\n ]+/, "").replace(/[\n ]+$/, "\n");
}

/**
 * Serializador do documento do editor para Markdown que só converte os
 * blocos que mudaram.
 *
 * Converter o documento inteiro a cada pausa na digitação custava
 * centenas de ms num arquivo de 100 mil palavras, com a janela parada.
 * No ProseMirror um bloco que não mudou continua sendo o MESMO objeto
 * de uma edição para outra; o Markdown de cada bloco de topo fica num
 * cache indexado pelo próprio nó, e só o bloco editado passa de novo pelo
 * turndown. O resultado é idêntico ao da conversão do documento inteiro
 * (há teste que compara os dois).
 *
 * Um serializador por editor: o cache pertence a um documento.
 */
export interface DocSerializer {
  (doc: PMNode, schema: Schema): string;
  /**
   * Converte blocos ainda fora do cache até `deadline` (em
   * `performance.now()`), para adiantar o trabalho com a janela livre.
   * Devolve `true` quando não sobrou bloco por converter.
   */
  warm(doc: PMNode, schema: Schema, deadline: number): boolean;
}

export function createDocSerializer(): DocSerializer {
  const cache = new WeakMap<PMNode, string>();
  const markdownOf = (block: PMNode, schema: Schema): string => {
    let markdown = cache.get(block);
    if (markdown === undefined) {
      markdown = blockMarkdown(getHTMLFromFragment(Fragment.from(block), schema));
      cache.set(block, markdown);
    }
    return markdown;
  };

  const serialize = ((doc: PMNode, schema: Schema) => {
    const blocks: string[] = [];
    doc.forEach((block) => {
      const markdown = markdownOf(block, schema);
      if (markdown) blocks.push(markdown);
    });
    // Os mesmos cortes que o turndown e o `htmlToMarkdown` fazem nas
    // pontas do documento inteiro.
    return finishMarkdown(
      blocks.join("\n\n").replace(/^[\t\r\n]+/, "").replace(/[\t\r\n\s]+$/, ""),
    );
  }) as DocSerializer;

  serialize.warm = (doc, schema, deadline) => {
    for (let i = 0; i < doc.childCount; i++) {
      const block = doc.child(i);
      if (cache.has(block)) continue;
      if (performance.now() >= deadline) return false;
      markdownOf(block, schema);
    }
    return true;
  };

  return serialize;
}

const BLOCK_EDGE = "solonblockedge";

/**
 * Markdown de um bloco de topo exatamente como ele sai no meio do
 * documento inteiro. Convertido sozinho, o turndown apara as pontas do
 * bloco, e um parágrafo que termina em quebra de linha perdia os dois
 * espaços finais que a conversão completa mantém. Um parágrafo marcador
 * de cada lado deixa o bloco no meio, e o texto entre os marcadores é o
 * trecho que a conversão completa produziria.
 */
function blockMarkdown(html: string): string {
  const edge = `<p>${BLOCK_EDGE}</p>`;
  const wrapped = turndownEditorHtml(edge + html + edge);
  const inner = wrapped
    .slice(BLOCK_EDGE.length, wrapped.length - BLOCK_EDGE.length)
    .replace(/^\n\n/, "")
    .replace(/\n\n$/, "");
  return repairEscapedInlineMarks(inner);
}
