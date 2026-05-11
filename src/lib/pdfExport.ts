/**
 * Export pra PDF via window.print() do WebView do Tauri.
 *
 * Decisao arquitetural: nao bundlamos pandoc/weasyprint/etc. Em vez
 * disso, montamos o documento em HTML estilizado pra impressao (com
 * @page, font sizes ajustados, page breaks em headings de capitulo)
 * e disparamos `window.print()`. O user escolhe "Microsoft Print to
 * PDF" (Windows) ou similar — todos os SOs modernos tem destino PDF
 * embutido no print dialog.
 *
 * Trade-off: menos controle fino (sem TOC clicavel, sem custom font
 * embedding garantido) MAS:
 *  - zero deps de runtime, zero +150MB no bundle
 *  - funciona offline
 *  - WYSIWYG: o que o user ve no print preview e' o que sai
 *
 * Pra 0.7.0 isso e' suficiente. PDF gerado e' valido pra leitura,
 * revisao e impressao caseira. Pra submissao a editora (DOCX manuscript)
 * fica em backlog 0.7.x ou 0.8.
 */
import { marked } from "marked";
import DOMPurify from "dompurify";
import { parseDocument } from "./frontmatter";
import type { FileNode } from "../store/useAppStore";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type PrintSize = "a5" | "a4" | "book"; // book = 5.5x8.5in (US trade)
export type PrintFont = "serif" | "sans";

export interface PrintOptions {
  /** Titulo exibido na capa + cabecalho. Default: nome do arquivo/pasta. */
  title?: string;
  /** Tamanho da pagina. */
  size: PrintSize;
  /** Familia de fonte do corpo. */
  font: PrintFont;
  /** Inclui sumario gerado dos H1/H2 antes do conteudo. */
  toc: boolean;
}

const SIZE_CSS: Record<PrintSize, string> = {
  a4: "A4",
  a5: "A5",
  book: '5.5in 8.5in',
};

const FONT_CSS: Record<PrintFont, string> = {
  serif: '"Lora", "EB Garamond", Georgia, serif',
  sans: '"Inter", system-ui, -apple-system, sans-serif',
};

interface PreparedDoc {
  /** HTML do body completo (capa + sumario + conteudo). */
  html: string;
  /** Titulo final usado. */
  title: string;
}

/**
 * Prepara o HTML pra um unico arquivo. Le do disco, parseia, converte
 * markdown -> HTML, sanitiza.
 */
async function prepareSingle(
  filePath: string,
  fileName: string,
  opts: PrintOptions,
): Promise<PreparedDoc> {
  if (!isTauri) {
    throw new Error("Export PDF disponivel apenas no app Tauri.");
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const raw = await readTextFile(filePath);
  const { body } = parseDocument(raw);
  const title = opts.title ?? fileName.replace(/\.(md|txt)$/i, "");
  return {
    html: renderBody(title, [{ heading: title, html: mdToHtml(body) }], opts),
    title,
  };
}

/**
 * Prepara HTML pra projeto inteiro (uma pasta como antologia/livro).
 * Cada `.md` vira uma "secao" — recebe um H1 com o nome do arquivo (se
 * o conteudo ja' nao comecar com H1).
 */
async function prepareFolder(
  folderTree: FileNode[],
  folderTitle: string,
  opts: PrintOptions,
): Promise<PreparedDoc> {
  if (!isTauri) {
    throw new Error("Export PDF disponivel apenas no app Tauri.");
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const files = flatten(folderTree).filter((f) =>
    /\.(md|txt)$/i.test(f.name),
  );
  if (files.length === 0) {
    throw new Error("Pasta sem arquivos .md/.txt pra exportar.");
  }
  const title = opts.title ?? folderTitle;
  const sections: { heading: string; html: string }[] = [];
  for (const f of files) {
    try {
      const raw = await readTextFile(f.path);
      const { body } = parseDocument(raw);
      const sectionTitle = f.name.replace(/\.(md|txt)$/i, "");
      sections.push({
        heading: sectionTitle,
        html: mdToHtml(body),
      });
    } catch {
      /* arquivo ilegivel — pula */
    }
  }
  return { html: renderBody(title, sections, opts), title };
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) out.push(...flatten(n.children));
  }
  return out;
}

function mdToHtml(md: string): string {
  if (!md) return "";
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    // Lista permissiva — mesmo conjunto do markdownBridge, mas sem o
    // FORBID `href` (queremos preservar links no PDF, mesmo que nao
    // clicaveis em todos os viewers).
    ALLOWED_TAGS: [
      "p", "br", "hr", "strong", "em", "s", "code", "pre",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote",
      "table", "thead", "tbody", "tr", "th", "td",
      "mark", "a",
    ],
    ALLOWED_ATTR: ["href", "colspan", "rowspan", "align", "style"],
    FORBID_ATTR: ["srcdoc", "src", "onerror", "onload"],
  });
}

/**
 * Monta o documento final: capa + (opcional) sumario + secoes.
 */
function renderBody(
  title: string,
  sections: { heading: string; html: string }[],
  opts: PrintOptions,
): string {
  const cover = `
    <section class="solon-pdf-cover">
      <h1 class="solon-pdf-title">${escapeHtml(title)}</h1>
    </section>
  `;
  const tocHtml = opts.toc
    ? `
      <section class="solon-pdf-toc">
        <h2>Sumário</h2>
        <ol>
          ${sections.map((s) => `<li>${escapeHtml(s.heading)}</li>`).join("\n")}
        </ol>
      </section>
    `
    : "";
  const sectionsHtml = sections
    .map(
      (s) => `
        <section class="solon-pdf-section">
          ${s.html}
        </section>
      `,
    )
    .join("\n");
  return cover + tocHtml + sectionsHtml;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CSS de impressao. Centraliza tipografia + layout de pagina aqui pra
 * que o documento gerado seja independente do tema do app (PDF nao
 * precisa de dark mode).
 */
function buildCss(opts: PrintOptions): string {
  return `
    @page {
      size: ${SIZE_CSS[opts.size]};
      margin: 22mm 18mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      color: #1a1a1a;
      font-family: ${FONT_CSS[opts.font]};
      font-size: 11pt;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Capa */
    .solon-pdf-cover {
      min-height: 85vh;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      text-align: center;
    }
    .solon-pdf-title {
      font-size: 2.4em;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
      letter-spacing: -0.01em;
    }
    /* Sumario */
    .solon-pdf-toc {
      page-break-after: always;
    }
    .solon-pdf-toc h2 {
      font-size: 1.4em;
      margin-bottom: 1em;
      border-bottom: 1px solid #ccc;
      padding-bottom: 0.4em;
    }
    .solon-pdf-toc ol {
      padding-left: 1.5em;
      line-height: 2;
    }
    /* Secoes (uma por arquivo em export de pasta) */
    .solon-pdf-section {
      page-break-before: always;
    }
    .solon-pdf-section:first-of-type {
      /* primeira secao nao precisa de page-break extra apos cover/toc */
    }
    /* Tipografia */
    h1 {
      font-size: 1.7em;
      font-weight: 700;
      margin: 0 0 0.8em 0;
      page-break-after: avoid;
    }
    h2 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 1.6em 0 0.6em;
      page-break-after: avoid;
    }
    h3 {
      font-size: 1.12em;
      font-weight: 600;
      margin: 1.3em 0 0.5em;
      page-break-after: avoid;
    }
    h4, h5, h6 {
      font-size: 1em;
      font-weight: 600;
      margin: 1.1em 0 0.4em;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 0.6em 0;
      text-align: justify;
      hyphens: auto;
      orphans: 3;
      widows: 3;
    }
    p[data-indent="true"] { text-indent: 2em; }
    blockquote {
      margin: 0.8em 1.5em;
      padding: 0.2em 1em;
      border-left: 3px solid #999;
      font-style: italic;
      color: #555;
    }
    hr {
      border: none;
      text-align: center;
      margin: 1.5em 0;
      page-break-after: avoid;
    }
    hr::after {
      content: "* * *";
      letter-spacing: 0.5em;
      color: #555;
    }
    code {
      font-family: "Courier New", monospace;
      font-size: 0.92em;
      background: #f2f2f2;
      padding: 0.05em 0.3em;
      border-radius: 2px;
    }
    pre {
      background: #f2f2f2;
      padding: 0.6em 0.9em;
      border-radius: 4px;
      overflow: hidden;
      font-size: 0.9em;
      page-break-inside: avoid;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    ul, ol {
      padding-left: 1.4em;
      margin: 0.4em 0 0.6em;
    }
    li { margin: 0.1em 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.8em 0;
      font-size: 0.92em;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #aaa;
      padding: 0.35em 0.6em;
      text-align: left;
    }
    th { background: #ececec; font-weight: 600; }
    mark { background: yellow; padding: 0 0.1em; }
    a { color: #1a4480; text-decoration: underline; }
    img { max-width: 100%; height: auto; page-break-inside: avoid; }
  `;
}

/**
 * Constroi e abre uma janela nova com o documento estilizado pra
 * impressao, e dispara o print dialog. User escolhe "Save as PDF" no
 * destino do dialog.
 *
 * Em Tauri WebView, `window.open` retorna uma referencia mas o documento
 * roda na mesma origem — entao podemos injetar HTML e CSS livremente.
 *
 * A janela fecha sozinha apos o user concluir/cancelar o print
 * (evento `afterprint`). Fallback: timeout de 60s.
 */
async function openPrintWindow(html: string, css: string, title: string): Promise<void> {
  const popup = window.open("", "_blank", "width=900,height=1000");
  if (!popup) {
    throw new Error("Pop-up bloqueado. Permita pop-ups pra este app.");
  }
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
  </head>
  <body>
    ${html}
  </body>
</html>`);
  popup.document.close();
  // Espera fonts/layout antes de chamar print. requestAnimationFrame +
  // pequeno timeout cobrem a maioria dos casos; sem isso o Chrome pode
  // chamar print antes do layout terminar.
  await new Promise<void>((resolve) => {
    const onLoad = () => {
      // Janela bracket: requestAnimationFrame + 300ms pra fonts.
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 300);
      });
    };
    if (popup.document.readyState === "complete") {
      onLoad();
    } else {
      popup.addEventListener("load", onLoad);
    }
  });
  // Auto-close apos print (ou cancel).
  const cleanup = () => {
    try {
      popup.close();
    } catch {
      /* webview pode bloquear close */
    }
  };
  popup.addEventListener("afterprint", cleanup);
  // Fallback timeout de 60s.
  window.setTimeout(cleanup, 60_000);
  popup.focus();
  popup.print();
}

/**
 * Export de um unico arquivo. Le do disco, monta HTML, abre print
 * dialog.
 */
export async function exportFileToPdf(
  filePath: string,
  fileName: string,
  opts: PrintOptions,
): Promise<void> {
  const { html, title } = await prepareSingle(filePath, fileName, opts);
  const css = buildCss(opts);
  await openPrintWindow(html, css, title);
}

/**
 * Export de uma pasta inteira como livro/antologia. Concatena todos
 * os arquivos `.md`/`.txt` na ordem do tree.
 */
export async function exportFolderToPdf(
  folderTree: FileNode[],
  folderTitle: string,
  opts: PrintOptions,
): Promise<void> {
  const { html, title } = await prepareFolder(folderTree, folderTitle, opts);
  const css = buildCss(opts);
  await openPrintWindow(html, css, title);
}
