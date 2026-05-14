import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDocument, serializeDocument } from "../src/lib/frontmatter.ts";
import { snapshotBucket } from "../src/lib/localHistory.ts";
import {
  removeFromOrder,
  renameFolderInOrder,
  reorderInFolder,
} from "../src/lib/sidebarOrder.ts";
import {
  canMoveIntoFolder,
  isSameOrDescendantPath,
} from "../src/lib/sidebarDrop.ts";
import {
  isInsideProject,
  isProjectNotePath,
  isSafeEntryName,
} from "../src/lib/pathSecurity.ts";
import {
  htmlToMarkdown,
  markdownToHtml,
} from "../src/components/Editor/markdownBridge.ts";
import { isSafeAssetSrc } from "../src/lib/canvasImages.ts";

describe("frontmatter", () => {
  it("keeps body separators out of the yaml parser", () => {
    const raw = [
      "---",
      "pov: Lina",
      "status: draft",
      "---",
      "# Cena",
      "",
      "---",
      "",
      "Separador dentro do texto.",
    ].join("\n");
    const parsed = parseDocument(raw);
    assert.equal(parsed.meta.pov, "Lina");
    assert.match(parsed.body, /^# Cena/);
    assert.match(parsed.body, /Separador dentro do texto/);
  });

  it("round-trips scene metadata without empty noise", () => {
    const raw = serializeDocument(
      {
        pov: "Elara",
        location: "Tiralen",
        tags: ["ato-1"],
      },
      "\n\nTexto",
    );
    const parsed = parseDocument(raw);
    assert.deepEqual(parsed.meta.tags, ["ato-1"]);
    assert.equal(parsed.meta.location, "Tiralen");
    assert.equal(parsed.body.trim(), "Texto");
  });
});

describe("local history", () => {
  it("creates stable buckets for equivalent relative file paths", () => {
    const root = "C:\\Projeto";
    assert.equal(
      snapshotBucket(root, "C:\\Projeto\\Notas\\Cena.md"),
      snapshotBucket(root, "C:/Projeto/Notas/Cena.md"),
    );
  });
});

describe("sidebar order", () => {
  it("moves an item within a folder without duplicating entries", () => {
    const order = reorderInFolder(
      { version: 1, folders: {} },
      ".",
      "B.md",
      "A.md",
      ["A.md", "B.md", "C.md"],
    );
    assert.deepEqual(order.folders["."], ["B.md", "A.md", "C.md"]);
  });

  it("removes moved items from their old folder order", () => {
    const order = removeFromOrder(
      { version: 1, folders: { ".": ["A", "B", "C"] } },
      "B",
      ".",
    );
    assert.deepEqual(order.folders["."], ["A", "C"]);
  });

  it("renames nested folder keys when a folder is moved", () => {
    const order = renameFolderInOrder(
      { version: 1, folders: { "Old": ["a.md"], "Old/Sub": ["b.md"] } },
      "Old",
      "New/Old",
    );
    assert.deepEqual(Object.keys(order.folders).sort(), ["New/Old", "New/Old/Sub"]);
  });
});

describe("sidebar folder drops", () => {
  it("allows moving a folder into a sibling folder", () => {
    assert.equal(
      canMoveIntoFolder(
        "C:\\Projeto\\Narrativas\\arcadia",
        "C:\\Projeto\\Narrativas\\caos-eminente",
      ),
      true,
    );
  });

  it("blocks dropping a folder into itself or its own child", () => {
    assert.equal(
      canMoveIntoFolder("C:/Projeto/Narrativas", "C:/Projeto/Narrativas"),
      false,
    );
    assert.equal(
      canMoveIntoFolder(
        "C:/Projeto/Narrativas",
        "C:/Projeto/Narrativas/arcadia",
      ),
      false,
    );
    assert.equal(
      isSameOrDescendantPath(
        "C:/Projeto/Narrativas/arcadia",
        "C:/Projeto/Narrativas",
      ),
      true,
    );
  });

  it("ignores drops into the current parent because they are no-ops", () => {
    assert.equal(
      canMoveIntoFolder(
        "C:/Projeto/Narrativas/arcadia",
        "C:/Projeto/Narrativas",
      ),
      false,
    );
  });
});

describe("project path safety", () => {
  it("accepts notes only inside the active project", () => {
    const root = "C:\\Projeto\\Livro";
    assert.equal(isInsideProject(root, "C:\\Projeto\\Livro\\Cena.md"), true);
    assert.equal(isProjectNotePath(root, "C:\\Projeto\\Livro\\Cena.md"), true);
    assert.equal(isProjectNotePath(root, "C:\\Projeto\\Livro\\asset.png"), false);
    assert.equal(isProjectNotePath(root, "C:\\Projeto\\Outro\\Cena.md"), false);
    assert.equal(isProjectNotePath(root, "C:\\Projeto\\Livro\\..\\Outro\\Cena.md"), false);
  });

  it("rejects unsafe entry names", () => {
    assert.equal(isSafeEntryName("Cena 1.md", "file"), true);
    assert.equal(isSafeEntryName("Cena 1", "file"), false);
    assert.equal(isSafeEntryName("../Cena.md", "file"), false);
    assert.equal(isSafeEntryName("CON.md", "file"), false);
    assert.equal(isSafeEntryName("Notas", "folder"), true);
  });

  it("keeps canvas/editor asset paths inside .solon assets", () => {
    assert.equal(isSafeAssetSrc("assets/image.png"), true);
    assert.equal(isSafeAssetSrc("assets/../secret.png"), false);
    assert.equal(isSafeAssetSrc("../assets/image.png"), false);
    assert.equal(isSafeAssetSrc("assets/vector.svg"), false);
  });
});

describe("editor markdown bridge", () => {
  it("preserves leading visual spaces in paragraphs", () => {
    const md = htmlToMarkdown("<p>  OLHOS</p>");
    assert.equal(md, "\u00a0\u00a0OLHOS");
  });

  it("preserves repeated spaces inside prose without turning them into code", () => {
    const md = htmlToMarkdown("<p>Kyra  percebe</p>");
    assert.equal(md, `Kyra \u00a0percebe`);
  });

  it("keeps bullets, ordered lists, alignment, and editor indent markers", () => {
    assert.match(htmlToMarkdown("<ul><li><p>item</p></li></ul>"), /^-\s+item/);
    assert.match(htmlToMarkdown("<ol><li><p>item</p></li></ol>"), /^1\.\s+item/);
    assert.equal(
      htmlToMarkdown('<p data-indent="true" style="text-align: center">Cena</p>'),
      '<p style="text-align: center">\u2003Cena</p>',
    );
  });

  it("restores saved visual spaces and indent markers when loading markdown", () => {
    assert.match(markdownToHtml("\u00a0\u00a0OLHOS"), /\u00a0\u00a0OLHOS/);
    assert.match(
      markdownToHtml('<p style="text-align: center">\u2003Cena</p>'),
      /<p data-indent="true" style="text-align: center">Cena<\/p>/,
    );
  });

  it("preserves empty paragraphs used as visual spacing", () => {
    const md = htmlToMarkdown("<p>Um</p><p></p><p>Dois</p>");
    assert.match(md, /Um\n\n<p><br><\/p>\n\nDois/);
    assert.match(markdownToHtml(md), /<p>Um<\/p>\n<p><br><\/p>\n+<p>Dois<\/p>/);
  });

  it("preserves empty paragraphs represented with br", () => {
    const md = htmlToMarkdown("<p>Um</p><p><br></p><p>Dois</p>");
    assert.match(md, /Um\n\n<p><br><\/p>\n\nDois/);
  });

  it("round-trips inline editor images through .solon assets", () => {
    const md = htmlToMarkdown(
      '<img src="blob:preview" data-solon-src=".solon/assets/ref.png" alt="Mapa">',
    );
    assert.match(md, /!\[Mapa\]\(\.solon\/assets\/ref\.png\)/);
    assert.match(markdownToHtml(md), /<img[^>]+src="\.solon\/assets\/ref\.png"/);
  });

  it("keeps inline code markup loadable by the editor schema", () => {
    const html = markdownToHtml("Use `atalho` aqui.");
    assert.match(html, /<code>atalho<\/code>/);
    assert.match(htmlToMarkdown(html), /`atalho`/);
  });

  it("round-trips bold and italic without multiplying markers", () => {
    assert.equal(htmlToMarkdown(markdownToHtml("**negrito**")).trim(), "**negrito**");
    assert.equal(htmlToMarkdown(markdownToHtml("*italico*")).trim(), "*italico*");
    assert.equal(htmlToMarkdown(markdownToHtml("***ambos***")).trim(), "***ambos***");
  });

  it("normalizes accidentally nested markdown marks on load", () => {
    const repaired = htmlToMarkdown(markdownToHtml("****negrito****")).trim();
    assert.equal(repaired, "**negrito**");
  });

  it("repairs escaped inline marks from older save/load cycles", () => {
    const brokenBold = String.raw`\\\\\*\\\\\*Onírica\\\\\*\\\\\*`;
    const html = markdownToHtml(brokenBold);
    assert.match(html, /<strong>Onírica<\/strong>/);
    assert.equal(htmlToMarkdown(`<p>${brokenBold}</p>`).trim(), "**Onírica**");
  });

  it("repairs literal markdown marks inside raw html blocks", () => {
    assert.match(markdownToHtml("<p>**Onírica**</p>"), /<strong>Onírica<\/strong>/);
    assert.match(
      markdownToHtml("<p>&#42;&#42;Real&#42;&#42;</p>"),
      /<strong>Real<\/strong>/,
    );
    assert.match(markdownToHtml("<p>*Sonho*</p>"), /<em>Sonho<\/em>/);
  });
});
