import { marked } from "marked";
import { parseDocument } from "./frontmatter";
import type { FileNode } from "../store/useAppStore";

type PdfDocument = import("jspdf").jsPDF;

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type PrintSize = "a5" | "a4" | "book";
export type PrintFont = "serif" | "sans";

export interface PrintOptions {
  title?: string;
  size: PrintSize;
  font: PrintFont;
  toc: boolean;
}

type PdfBlock = {
  heading: string;
  markdown: string;
  includeHeading: boolean;
};

type PreparedDoc = {
  title: string;
  blocks: PdfBlock[];
};

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: boolean;
};

type InlineSegment = InlineStyle & {
  text: string;
};

type PageSpec = {
  format: [number, number];
  marginX: number;
  marginY: number;
};

const PAGE_SPECS: Record<PrintSize, PageSpec> = {
  a4: { format: [595.28, 841.89], marginX: 62, marginY: 64 },
  a5: { format: [419.53, 595.28], marginX: 42, marginY: 46 },
  book: { format: [396, 612], marginX: 46, marginY: 50 },
};

const FONT_FAMILY: Record<PrintFont, string> = {
  serif: "times",
  sans: "helvetica",
};

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
    title,
    blocks: [{ heading: title, markdown: body, includeHeading: false }],
  };
}

async function prepareFolder(
  folderTree: FileNode[],
  folderTitle: string,
  opts: PrintOptions,
): Promise<PreparedDoc> {
  if (!isTauri) {
    throw new Error("Export PDF disponivel apenas no app Tauri.");
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const files = flatten(folderTree).filter((f) => /\.(md|txt)$/i.test(f.name));
  if (files.length === 0) {
    throw new Error("Pasta sem arquivos .md/.txt pra exportar.");
  }

  const title = opts.title ?? folderTitle;
  const blocks: PdfBlock[] = [];
  for (const file of files) {
    try {
      const raw = await readTextFile(file.path);
      const { body } = parseDocument(raw);
      blocks.push({
        heading: file.name.replace(/\.(md|txt)$/i, ""),
        markdown: body,
        includeHeading: true,
      });
    } catch {
      continue;
    }
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

async function writePdf(doc: PdfDocument, title: string): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const selected = await save({
    defaultPath: `${safeFileName(title)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!selected) return null;
  const target = /\.pdf$/i.test(selected) ? selected : `${selected}.pdf`;
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  await writeFile(target, bytes);
  return target;
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Solon";
}

async function createDoc(prepared: PreparedDoc, opts: PrintOptions): Promise<PdfDocument> {
  const { jsPDF } = await import("jspdf");
  const spec = PAGE_SPECS[opts.size];
  const doc = new jsPDF({
    unit: "pt",
    format: spec.format,
    compress: true,
    putOnlyUsedFonts: true,
  });

  const renderer = new PdfRenderer(doc, spec, opts.font);
  doc.setProperties({
    title: prepared.title,
    creator: "Solon",
    subject: "Exportacao PDF",
  });

  if (opts.toc && prepared.blocks.length > 1) {
    renderer.heading(prepared.title, 1);
    renderer.heading("Sumario", 2);
    prepared.blocks.forEach((block, index) => {
      renderer.listItem(`${index + 1}. ${block.heading}`, 0, false);
    });
    renderer.newPage();
  }

  prepared.blocks.forEach((block, index) => {
    if (index > 0) renderer.newPage();
    if (block.includeHeading) renderer.heading(block.heading, 1);
    renderer.markdown(block.markdown);
  });

  return doc;
}

class PdfRenderer {
  private readonly doc: PdfDocument;
  private readonly pageWidth: number;
  private readonly pageHeight: number;
  private readonly marginX: number;
  private readonly marginY: number;
  private readonly baseFont: string;
  private y: number;

  constructor(doc: PdfDocument, spec: PageSpec, font: PrintFont) {
    this.doc = doc;
    this.pageWidth = spec.format[0];
    this.pageHeight = spec.format[1];
    this.marginX = spec.marginX;
    this.marginY = spec.marginY;
    this.baseFont = FONT_FAMILY[font];
    this.y = spec.marginY;
    this.setFont(11, {});
  }

  markdown(markdown: string): void {
    const tokens = marked.lexer(markdown, { gfm: true, breaks: false }) as any[];
    tokens.forEach((token) => this.block(token));
  }

  heading(text: string, depth: number): void {
    const size = depth === 1 ? 20 : depth === 2 ? 15 : depth === 3 ? 13 : 11.5;
    const before = depth === 1 ? 12 : 10;
    const after = depth === 1 ? 10 : 7;
    this.space(before);
    this.ensure(size * 1.45);
    this.renderInline([{ text: normalizeText(text), bold: true }], {
      fontSize: size,
      lineHeight: size * 1.22,
      maxWidth: this.contentWidth(),
    });
    if (depth <= 2) {
      this.ensure(7);
      this.doc.setDrawColor(210, 183, 111);
      this.doc.setLineWidth(0.8);
      this.doc.line(this.marginX, this.y, this.pageWidth - this.marginX, this.y);
      this.y += 7;
    }
    this.space(after);
  }

  listItem(text: string, indent: number, bullet: boolean): void {
    this.ensure(16);
    const marker = bullet ? "\u2022" : "";
    const markerX = this.marginX + indent * 18;
    const textX = marker ? markerX + 14 : markerX;
    this.setFont(10.5, {});
    if (marker) this.doc.text(marker, markerX, this.y);
    this.renderInline([{ text: normalizeText(text) }], {
      fontSize: 10.5,
      lineHeight: 15,
      x: textX,
      maxWidth: this.pageWidth - this.marginX - textX,
    });
    this.space(2);
  }

  newPage(): void {
    this.doc.addPage();
    this.y = this.marginY;
  }

  private block(token: any): void {
    switch (token.type) {
      case "space":
        this.space(6);
        break;
      case "heading":
        this.heading(token.text ?? "", token.depth ?? 2);
        break;
      case "paragraph":
        this.paragraph(this.inlineSegments(token.tokens, token.text));
        break;
      case "text":
        this.paragraph(this.inlineSegments(token.tokens, token.text));
        break;
      case "list":
        this.list(token);
        break;
      case "blockquote":
        this.blockquote(token);
        break;
      case "hr":
        this.rule();
        break;
      case "code":
        this.code(token.text ?? "");
        break;
      case "table":
        this.table(token);
        break;
      case "html":
        this.paragraph([{ text: normalizeText(stripHtml(token.text ?? token.raw ?? "")) }]);
        break;
      default:
        if (token.raw || token.text) {
          this.paragraph([{ text: normalizeText(token.text ?? token.raw) }]);
        }
    }
  }

  private paragraph(segments: InlineSegment[], options?: { indent?: number }): void {
    const clean = trimSegments(segments);
    if (clean.length === 0) return;
    const x = this.marginX + (options?.indent ?? 0);
    this.renderInline(clean, {
      fontSize: 11,
      lineHeight: 16.4,
      x,
      maxWidth: this.pageWidth - this.marginX - x,
    });
    this.space(6);
  }

  private list(token: any): void {
    const ordered = !!token.ordered;
    let number = Number(token.start ?? 1);
    for (const item of token.items ?? []) {
      const marker = ordered ? `${number}. ` : "\u2022 ";
      const segments = [
        { text: marker, bold: ordered },
        ...this.segmentsFromListItem(item),
      ];
      this.renderInline(trimSegments(segments), {
        fontSize: 10.8,
        lineHeight: 15.8,
        x: this.marginX + 14,
        maxWidth: this.contentWidth() - 14,
      });
      this.space(3);
      number += 1;
    }
    this.space(3);
  }

  private blockquote(token: any): void {
    const oldX = this.marginX + 16;
    this.ensure(18);
    this.doc.setDrawColor(170, 170, 170);
    this.doc.setLineWidth(2);
    const startY = this.y - 11;
    const segments = this.blocksToSegments(token.tokens ?? []);
    this.renderInline(trimSegments(segments), {
      fontSize: 10.8,
      lineHeight: 15.8,
      x: oldX,
      maxWidth: this.pageWidth - this.marginX - oldX,
      color: [82, 82, 82],
      italic: true,
    });
    this.doc.line(this.marginX, startY, this.marginX, Math.max(startY + 16, this.y - 8));
    this.space(7);
  }

  private rule(): void {
    this.space(10);
    this.ensure(16);
    const center = this.pageWidth / 2;
    this.setFont(11, {});
    this.doc.setTextColor(90, 90, 90);
    this.doc.text("* * *", center, this.y, { align: "center" });
    this.doc.setTextColor(26, 26, 26);
    this.y += 18;
  }

  private code(text: string): void {
    const lines = text.replace(/\t/g, "  ").split(/\r?\n/);
    this.space(5);
    this.setFont(9.5, { code: true });
    for (const line of lines) {
      this.ensure(13.5);
      const wrapped = this.doc.splitTextToSize(line || " ", this.contentWidth()) as string[];
      for (const part of wrapped) {
        this.ensure(13.5);
        this.doc.text(part, this.marginX, this.y);
        this.y += 13.5;
      }
    }
    this.space(7);
  }

  private table(token: any): void {
    const rows = [
      ...(token.header ? [token.header] : []),
      ...(token.rows ?? []),
    ];
    rows.forEach((row: any[], index: number) => {
      const text = row
        .map((cell: any) => normalizeText(cell?.text ?? ""))
        .filter(Boolean)
        .join(" | ");
      if (!text) return;
      this.renderInline([{ text, bold: index === 0 }], {
        fontSize: 9.8,
        lineHeight: 14.5,
        maxWidth: this.contentWidth(),
      });
      this.space(2);
    });
    this.space(6);
  }

  private renderInline(
    segments: InlineSegment[],
    options: {
      fontSize: number;
      lineHeight: number;
      maxWidth: number;
      x?: number;
      color?: [number, number, number];
      italic?: boolean;
    },
  ): void {
    const startX = options.x ?? this.marginX;
    let x = startX;
    this.ensure(options.lineHeight);

    for (const segment of segments) {
      const pieces = splitTextPieces(segment.text);
      for (const piece of pieces) {
        const text = piece.replace(/\s+/g, " ");
        if (!text) continue;
        const leading = x === startX && /^\s+$/.test(text);
        if (leading) continue;

        this.setFont(options.fontSize, {
          bold: segment.bold,
          italic: segment.italic || options.italic,
          code: segment.code,
        });
        const color = segment.link ? [26, 85, 142] : options.color ?? [26, 26, 26];
        this.doc.setTextColor(color[0], color[1], color[2]);

        const width = this.doc.getTextWidth(text);
        if (x > startX && x + width > startX + options.maxWidth) {
          this.y += options.lineHeight;
          x = startX;
          this.ensure(options.lineHeight);
          if (/^\s+$/.test(text)) continue;
        }

        const printable = x === startX ? text.trimStart() : text;
        if (!printable) continue;
        this.doc.text(printable, x, this.y);
        x += this.doc.getTextWidth(printable);
      }
    }

    this.doc.setTextColor(26, 26, 26);
    this.y += options.lineHeight;
  }

  private inlineSegments(tokens?: any[], fallback?: string, style: InlineStyle = {}): InlineSegment[] {
    if (!tokens || tokens.length === 0) {
      return fallback ? [{ text: normalizeText(fallback), ...style }] : [];
    }

    const segments: InlineSegment[] = [];
    for (const token of tokens) {
      switch (token.type) {
        case "strong":
          segments.push(...this.inlineSegments(token.tokens, token.text, { ...style, bold: true }));
          break;
        case "em":
          segments.push(...this.inlineSegments(token.tokens, token.text, { ...style, italic: true }));
          break;
        case "codespan":
          segments.push({ text: normalizeText(token.text ?? ""), ...style, code: true });
          break;
        case "del":
          segments.push(...this.inlineSegments(token.tokens, token.text, style));
          break;
        case "link":
          segments.push(...this.inlineSegments(token.tokens, token.text, { ...style, link: true }));
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
          segments.push({ text: normalizeText(stripHtml(token.text ?? token.raw ?? "")), ...style });
          break;
        default:
          if (token.tokens) {
            segments.push(...this.inlineSegments(token.tokens, token.text, style));
          } else {
            segments.push({ text: normalizeText(token.text ?? token.raw ?? ""), ...style });
          }
      }
    }
    return segments;
  }

  private segmentsFromListItem(item: any): InlineSegment[] {
    if (Array.isArray(item.tokens) && item.tokens.length > 0) {
      const first = item.tokens.find((token: any) => token.type !== "space");
      if (first?.tokens) return this.inlineSegments(first.tokens, first.text);
      if (first?.text) return [{ text: normalizeText(first.text) }];
    }
    return [{ text: normalizeText(item.text ?? "") }];
  }

  private blocksToSegments(tokens: any[]): InlineSegment[] {
    return tokens.flatMap((token) => {
      if (token.tokens) return this.inlineSegments(token.tokens, token.text);
      if (token.text) return [{ text: normalizeText(token.text) }];
      return [];
    });
  }

  private setFont(size: number, style: InlineStyle): void {
    const family = style.code ? "courier" : this.baseFont;
    const weight =
      style.bold && style.italic
        ? "bolditalic"
        : style.bold
          ? "bold"
          : style.italic
            ? "italic"
            : "normal";
    this.doc.setFont(family, weight);
    this.doc.setFontSize(size);
  }

  private contentWidth(): number {
    return this.pageWidth - this.marginX * 2;
  }

  private ensure(height: number): void {
    if (this.y + height <= this.pageHeight - this.marginY) return;
    this.newPage();
  }

  private space(amount: number): void {
    this.y += amount;
    if (this.y > this.pageHeight - this.marginY) this.newPage();
  }
}

function splitTextPieces(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(\n|\s+|[^\s]+)/g)
    .filter(Boolean)
    .flatMap((piece) => (piece === "\n" ? [" "] : [piece]));
}

function trimSegments(segments: InlineSegment[]): InlineSegment[] {
  const joined = segments.map((segment) => segment.text).join("");
  if (!joined.trim()) return [];

  let consumedStart = false;
  let consumedEnd = false;
  return segments
    .map((segment, index) => {
      let text = segment.text;
      if (!consumedStart) {
        text = text.replace(/^\s+/, "");
        if (text.length > 0 || index === segments.length - 1) consumedStart = true;
      }
      if (!consumedEnd && index === segments.length - 1) {
        text = text.replace(/\s+$/, "");
        consumedEnd = true;
      }
      return { ...segment, text };
    })
    .filter((segment) => segment.text.length > 0);
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

export async function exportFileToPdf(
  filePath: string,
  fileName: string,
  opts: PrintOptions,
): Promise<string | null> {
  const prepared = await prepareSingle(filePath, fileName, opts);
  const doc = await createDoc(prepared, opts);
  return writePdf(doc, prepared.title);
}

export async function exportFolderToPdf(
  folderTree: FileNode[],
  folderTitle: string,
  opts: PrintOptions,
): Promise<string | null> {
  const prepared = await prepareFolder(folderTree, folderTitle, opts);
  const doc = await createDoc(prepared, opts);
  return writePdf(doc, prepared.title);
}
