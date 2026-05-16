import { marked } from "marked";
import { parseDocument } from "./frontmatter";
import type { FileNode } from "../store/useAppStore";

/**
 * Export DOCX em formato manuscrito Shunn ("Proper Manuscript Format",
 * variante moderna: Times New Roman 12pt, espaço duplo, margens de 1in,
 * recuo de primeira linha 0.5in, sem espaço entre parágrafos, ragged-right).
 *
 * É o formato que agentes e revistas de ficção esperam numa submissão.
 * A geração usa a lib `docx` (OOXML real, abre limpo no Word), importada
 * sob demanda — exatamente como o `jspdf` no pdfExport — pra ficar fora
 * do bundle principal.
 */

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type ShunnCategory = "short" | "novel";

export interface DocxOptions {
  /** Nome legal do autor (canto superior esquerdo). */
  authorName: string;
  /** Endereço — linhas separadas por \n. Opcional. */
  address?: string;
  email?: string;
  phone?: string;
  /** Nome artístico para o byline ("by ..."). Default: authorName. */
  penName?: string;
  /** Título da obra. Default: nome do arquivo/pasta. */
  title?: string;
  /**
   * short = conto (palavras arredondadas à centena, corpo segue na pág. 1).
   * novel = romance (palavras à milhar, cada arquivo vira capítulo em
   * página nova).
   */
  category: ShunnCategory;
}

type DocBlock = {
  chapter: string;
  markdown: string;
  includeChapter: boolean;
};

type PreparedDoc = {
  title: string;
  blocks: DocBlock[];
};

type InlineStyle = { bold?: boolean; italic?: boolean };
type InlineSegment = InlineStyle & { text: string };

async function readBody(filePath: string): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const raw = await readTextFile(filePath);
  return parseDocument(raw).body;
}

async function prepareSingle(
  filePath: string,
  fileName: string,
  opts: DocxOptions,
): Promise<PreparedDoc> {
  if (!isTauri) throw new Error("Export DOCX disponível apenas no app Tauri.");
  const body = await readBody(filePath);
  const title = (opts.title || fileName.replace(/\.(md|txt)$/i, "")).trim();
  return {
    title,
    blocks: [{ chapter: title, markdown: body, includeChapter: false }],
  };
}

async function prepareFolder(
  folderTree: FileNode[],
  folderTitle: string,
  opts: DocxOptions,
): Promise<PreparedDoc> {
  if (!isTauri) throw new Error("Export DOCX disponível apenas no app Tauri.");
  const files = flatten(folderTree).filter((f) => /\.(md|txt)$/i.test(f.name));
  if (files.length === 0) {
    throw new Error("Pasta sem arquivos .md/.txt pra exportar.");
  }
  const title = (opts.title || folderTitle).trim();
  const blocks: DocBlock[] = [];
  for (const file of files) {
    try {
      const body = await readBody(file.path);
      blocks.push({
        chapter: file.name.replace(/\.(md|txt)$/i, ""),
        markdown: body,
        includeChapter: true,
      });
    } catch {
      continue;
    }
  }
  if (blocks.length === 0) {
    throw new Error("Nenhum arquivo .md/.txt pôde ser lido.");
  }
  return { title, blocks };
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") out.push(node);
    if (node.children) out.push(...flatten(node.children));
  }
  return out;
}

function normalizeText(value: string): string {
  return value.replace(/ /g, " ").replace(/[ \t]+/g, " ");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

/** Segmentos inline {text,bold,italic} a partir dos tokens do marked. */
function inlineSegments(
  tokens: unknown[] | undefined,
  fallback: string | undefined,
  style: InlineStyle = {},
): InlineSegment[] {
  if (!tokens || tokens.length === 0) {
    return fallback ? [{ text: normalizeText(fallback), ...style }] : [];
  }
  const segments: InlineSegment[] = [];
  for (const raw of tokens) {
    const token = raw as {
      type?: string;
      tokens?: unknown[];
      text?: string;
      raw?: string;
    };
    switch (token.type) {
      case "strong":
        segments.push(
          ...inlineSegments(token.tokens, token.text, { ...style, bold: true }),
        );
        break;
      case "em":
        segments.push(
          ...inlineSegments(token.tokens, token.text, { ...style, italic: true }),
        );
        break;
      case "codespan":
        segments.push({ text: normalizeText(token.text ?? ""), ...style });
        break;
      case "del":
      case "link":
        segments.push(...inlineSegments(token.tokens, token.text, style));
        break;
      case "image":
        segments.push({
          text: token.text ? `[imagem: ${normalizeText(token.text)}]` : "[imagem]",
          ...style,
          italic: true,
        });
        break;
      case "br":
        segments.push({ text: "\n", ...style });
        break;
      case "html":
        segments.push({
          text: normalizeText(stripHtml(token.text ?? token.raw ?? "")),
          ...style,
        });
        break;
      default:
        if (token.tokens) {
          segments.push(...inlineSegments(token.tokens, token.text, style));
        } else if (token.text || token.raw) {
          segments.push({ text: normalizeText(token.text ?? token.raw ?? ""), ...style });
        }
    }
  }
  return segments;
}

function segmentsText(segments: InlineSegment[]): string {
  return segments.map((s) => s.text).join("");
}

function countWords(text: string): number {
  const cleaned = text
    .replace(/[#*_~`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(" ").length;
}

function roundWordCount(words: number, category: ShunnCategory): number {
  const step = category === "novel" ? 1000 : 100;
  return Math.max(step, Math.round(words / step) * step);
}

/** Slug curto pro cabeçalho corrido (Shunn: "Sobrenome / PALAVRA / pág"). */
function headerKeyword(title: string): string {
  const word = title
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 3)[0];
  return (word || title.split(/\s+/)[0] || "Manuscrito").toUpperCase();
}

function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Autor";
}

export async function exportFileToDocx(
  filePath: string,
  fileName: string,
  opts: DocxOptions,
): Promise<string | null> {
  const prepared = await prepareSingle(filePath, fileName, opts);
  return buildAndSave(prepared, opts);
}

export async function exportFolderToDocx(
  folderTree: FileNode[],
  folderTitle: string,
  opts: DocxOptions,
): Promise<string | null> {
  const prepared = await prepareFolder(folderTree, folderTitle, opts);
  return buildAndSave(prepared, opts);
}

async function buildAndSave(
  prepared: PreparedDoc,
  opts: DocxOptions,
): Promise<string | null> {
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Header,
    PageNumber,
    AlignmentType,
    LineRuleType,
    convertInchesToTwip,
    TabStopType,
  } = docx;

  const FONT = "Times New Roman";
  const SIZE = 24; // 12pt em meios-pontos
  const DOUBLE = { line: 480, lineRule: LineRuleType.AUTO } as const;
  const indentFirst = convertInchesToTwip(0.5);
  const rightTab = convertInchesToTwip(6.5); // 8.5in - 2 margens de 1in

  const author = opts.authorName.trim() || "[Seu Nome]";
  const byline = (opts.penName || opts.authorName).trim() || author;
  const totalWords = prepared.blocks.reduce(
    (sum, b) => sum + countWords(b.markdown),
    0,
  );
  const wordLabel = `Cerca de ${roundWordCount(
    totalWords,
    opts.category,
  ).toLocaleString("pt-BR")} palavras`;

  const run = (text: string, style?: InlineStyle) =>
    new TextRun({
      text,
      bold: style?.bold,
      italics: style?.italic,
      font: FONT,
      size: SIZE,
    });

  const body: InstanceType<typeof Paragraph>[] = [];

  // --- Folha de rosto: contato (canto sup. esq.) + contagem (sup. dir.) ---
  const contactLines = [
    author,
    ...(opts.address ? opts.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []),
    ...(opts.email ? [opts.email.trim()] : []),
    ...(opts.phone ? [opts.phone.trim()] : []),
  ];
  // Primeira linha do contato compartilha a faixa com a contagem (dir.).
  body.push(
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
      spacing: { line: 240, lineRule: LineRuleType.AUTO },
      children: [run(contactLines[0]), run("\t"), run(wordLabel)],
    }),
  );
  for (const line of contactLines.slice(1)) {
    body.push(
      new Paragraph({
        spacing: { line: 240, lineRule: LineRuleType.AUTO },
        children: [run(line)],
      }),
    );
  }

  // Empurra o título pra ~meio da página (Shunn: título ~1/3 a 1/2 abaixo).
  for (let i = 0; i < 8; i++) {
    body.push(new Paragraph({ spacing: DOUBLE, children: [] }));
  }

  // Título + byline, centralizados.
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: DOUBLE,
      children: [run(prepared.title)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: DOUBLE,
      children: [run(`por ${byline}`)],
    }),
    new Paragraph({ spacing: DOUBLE, children: [] }),
  );

  // --- Corpo ---
  const pushPara = (segments: InlineSegment[]) => {
    const clean = segments.filter((s) => s.text !== "");
    if (segmentsText(clean).trim() === "") return;
    body.push(
      new Paragraph({
        spacing: DOUBLE,
        indent: { firstLine: indentFirst },
        children: clean.map((s) => run(s.text, s)),
      }),
    );
  };
  const pushCentered = (text: string) => {
    if (!text.trim()) return;
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DOUBLE,
        children: [run(text)],
      }),
    );
  };
  const renderInto = (markdown: string) => {
    const tokens = marked.lexer(markdown, { gfm: true, breaks: false }) as Array<{
      type?: string;
      text?: string;
      raw?: string;
      tokens?: unknown[];
      items?: Array<{ tokens?: unknown[]; text?: string }>;
      ordered?: boolean;
    }>;
    for (const token of tokens) {
      switch (token.type) {
        case "space":
          break;
        case "heading":
          pushCentered(normalizeText(token.text ?? ""));
          break;
        case "paragraph":
        case "text":
          pushPara(inlineSegments(token.tokens, token.text));
          break;
        case "hr":
          pushCentered("#"); // separador de cena
          break;
        case "blockquote": {
          const segs = (token.tokens ?? []).flatMap((t) => {
            const tk = t as { tokens?: unknown[]; text?: string };
            return inlineSegments(tk.tokens, tk.text);
          });
          const clean = segs.filter((s) => s.text !== "");
          if (segmentsText(clean).trim() !== "") {
            body.push(
              new Paragraph({
                spacing: DOUBLE,
                indent: { left: indentFirst, firstLine: indentFirst },
                children: clean.map((s) => run(s.text, { ...s, italic: true })),
              }),
            );
          }
          break;
        }
        case "list":
          for (const item of token.items ?? []) {
            const inner = Array.isArray(item.tokens)
              ? (item.tokens.find(
                  (t) => (t as { type?: string }).type !== "space",
                ) as { tokens?: unknown[]; text?: string } | undefined)
              : undefined;
            const segs = inner
              ? inlineSegments(inner.tokens, inner.text)
              : [{ text: normalizeText(item.text ?? "") }];
            pushPara([{ text: token.ordered ? "— " : "• " }, ...segs]);
          }
          break;
        case "code":
          for (const line of (token.text ?? "").split(/\r?\n/)) {
            pushPara([{ text: line || " " }]);
          }
          break;
        case "html":
          pushPara([{ text: normalizeText(stripHtml(token.text ?? token.raw ?? "")) }]);
          break;
        default:
          if (token.text || token.raw) {
            pushPara([{ text: normalizeText(token.text ?? token.raw ?? "") }]);
          }
      }
    }
  };

  prepared.blocks.forEach((block, index) => {
    if (opts.category === "novel") {
      body.push(
        new Paragraph({
          pageBreakBefore: index > 0,
          alignment: AlignmentType.CENTER,
          spacing: { before: convertInchesToTwip(2), after: 480 },
          children: [run(block.includeChapter ? block.chapter : prepared.title)],
        }),
      );
    }
    renderInto(block.markdown);
  });

  // Marca de fim de manuscrito.
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: DOUBLE,
      children: [run("# # #")],
    }),
  );

  const doc = new Document({
    creator: "Solon",
    title: prepared.title,
    styles: {
      default: { document: { run: { font: FONT, size: SIZE } } },
    },
    sections: [
      {
        properties: {
          titlePage: true, // página 1 usa header "first" (vazio)
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          first: new Header({ children: [] }),
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${surnameOf(author)} / ${headerKeyword(prepared.title)} / `,
                    font: FONT,
                    size: SIZE,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: SIZE,
                  }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return writeDocx(bytes, prepared.title);
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Solon";
}

async function writeDocx(
  bytes: Uint8Array,
  title: string,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const selected = await save({
    defaultPath: `${safeFileName(title)}.docx`,
    filters: [{ name: "Word", extensions: ["docx"] }],
  });
  if (!selected) return null;
  const target = /\.docx$/i.test(selected) ? selected : `${selected}.docx`;
  await writeFile(target, bytes);
  return target;
}
