import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDocument, serializeDocument } from "../src/lib/frontmatter.ts";
import { snapshotBucket } from "../src/lib/localHistory.ts";
import {
  removeFromOrder,
  renameFolderInOrder,
  reorderInFolder,
} from "../src/lib/sidebarOrder.ts";

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
