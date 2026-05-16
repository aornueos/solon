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
  ALLOWED_ATTR,
  ALLOWED_TAGS,
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

// Roundtrip de ficção: o corpus abaixo é o que um escritor de verdade salva.
// A propriedade central que protege contra corrupção lenta ao longo de meses
// de saves é o PONTO FIXO: depois de uma normalização inicial, o documento
// não pode mais mudar a cada ciclo save→load.
const save = (md) => htmlToMarkdown(markdownToHtml(md));
const fixedPoint = (md) => {
  const r1 = save(md);
  const r2 = save(r1);
  assert.equal(r2, r1, `roundtrip não convergiu para ponto fixo:\n${JSON.stringify(r1)}\n!==\n${JSON.stringify(r2)}`);
  return r1;
};

describe("markdown roundtrip — tachado (strike)", () => {
  // Regressão estrutural: `marked` emite <del> para ~~x~~. Em produção o
  // DOMPurify roda de verdade e remove qualquer tag fora de ALLOWED_TAGS.
  // Se <del>/<s> saírem da allowlist o tachado some na carga sem erro.
  // O ambiente de teste não tem DOM (sanitize é no-op), então este invariante
  // só é defensável checando a allowlist diretamente.
  it("keeps every tag marked emits for strike inside the sanitize allowlist", () => {
    assert.match(markdownToHtml("Isso ~~nao~~ foi."), /<del>nao<\/del>/);
    assert.ok(ALLOWED_TAGS.includes("del"), "ALLOWED_TAGS precisa de <del> (output do marked)");
    assert.ok(ALLOWED_TAGS.includes("s"), "ALLOWED_TAGS precisa de <s> (output do editor)");
    assert.ok(ALLOWED_TAGS.includes("strike"), "ALLOWED_TAGS precisa de <strike> (legado)");
  });

  it("round-trips strike applied in the editor without dropping the mark", () => {
    assert.match(htmlToMarkdown("<p>Isso <s>nao</s> foi.</p>"), /~nao~/);
    assert.match(markdownToHtml("Isso ~~nao~~ foi."), /<del>nao<\/del>/);
    assert.match(markdownToHtml("Isso ~nao~ foi."), /<del>nao<\/del>/);
    const r = fixedPoint("Ele ~~hesitou~~ e ~~recuou~~.");
    assert.match(r, /~hesitou~/);
    assert.match(r, /~recuou~/);
  });
});

describe("markdown roundtrip — construtos de ficção", () => {
  it("preserves accented pt-BR prose with no loss", () => {
    const src = "A canção da órfã ãéíõû çedilha pôs à prova o coração.";
    assert.equal(fixedPoint(src), src);
  });

  it("preserves em-dash dialogue verbatim (diálogo é o caso mais comum)", () => {
    const src = "— Você vai? — perguntou ela.\n\n— Não sei — respondeu ele.";
    assert.equal(fixedPoint(src), src);
  });

  it("keeps a scene break (---) as a scene break, not a heading", () => {
    const r = fixedPoint("Fim da cena.\n\n---\n\nNova cena começa.");
    assert.match(r, /Fim da cena\.\n\n---\n\nNova cena começa\./);
  });

  it("round-trips wikilinks", () => {
    const src = "Veja [[Elara]] e também [[capitulo-02]] no enredo.";
    assert.equal(fixedPoint(src), src);
  });

  it("keeps headings h1–h6 across save/load", () => {
    const src = "# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F";
    assert.equal(fixedPoint(src), src);
  });

  it("reaches a stable fixed point for blockquotes", () => {
    const r = fixedPoint("> Toda a vida é sonho.\n>\n> E os sonhos, sonhos são.");
    assert.match(r, /^>/);
    assert.match(r, /sonhos são\./);
  });

  it("treats markdown inside fenced code as inert and stable", () => {
    const fence = "```js\nconst a = b * c; // ~~nao~~ vira *nada*\n```";
    const html = markdownToHtml(fence);
    assert.match(html, /<pre>|<code>/);
    assert.match(html, /b \* c/);
    assert.doesNotMatch(html, /<del>|<em>/);
    fixedPoint(fence);
  });

  it("converges nested bold/italic to a stable fixed point", () => {
    const r = fixedPoint("Ela era **muito _forte_ mesmo** naquela manhã.");
    assert.match(r, /\*\*muito \*forte\* mesmo\*\*/);
  });
});

describe("markdown roundtrip — pipeline real (frontmatter + bridge)", () => {
  // O caminho de produção: parseDocument separa o YAML, só o BODY passa pelo
  // bridge, serializeDocument remonta. Este é o teste que mais se parece com
  // o que o disco realmente vê a cada save.
  const raw = [
    "---",
    "pov: Lina",
    "status: draft",
    "tags: [ato-1, ação]",
    "---",
    "# Capítulo 1",
    "",
    "— Você vem? — perguntou ela, **séria**.",
    "",
    "Ele ~~hesitou~~ e respondeu — com um *fio* de voz.",
    "",
    "> Toda vida é sonho.",
    "",
    "---",
    "",
    "Nova cena. Veja [[Elara]].",
  ].join("\n");

  const cycle = (input) => {
    const { meta, body } = parseDocument(input);
    return serializeDocument(meta, htmlToMarkdown(markdownToHtml(body)));
  };

  it("survives a full save/load cycle and is idempotent on the next", () => {
    const c1 = cycle(raw);
    const c2 = cycle(c1);
    assert.equal(c2, c1, "documento não convergiu — corrupção acumularia a cada save");
  });

  it("does not lose content through the real pipeline", () => {
    const c1 = cycle(raw);
    assert.match(c1, /pov: Lina/);
    assert.match(c1, /- ação/);
    assert.match(c1, /^# Capítulo 1/m);
    assert.match(c1, /— Você vem\? — perguntou ela, \*\*séria\*\*\./);
    assert.match(c1, /~hesitou~/);
    assert.match(c1, /\*fio\*/);
    assert.match(c1, /^> Toda vida é sonho\./m);
    assert.match(c1, /\[\[Elara\]\]/);
  });
});

describe("markdown roundtrip — wikilinks com alias", () => {
  // Mesma classe de bug do <del>: o alvo viaja em data-target e o
  // ambiente de teste não tem DOMPurify. Sem data-target na allowlist
  // o sanitize de produção engoliria o alvo e o link apontaria pro
  // rótulo. Este guard estrutural tranca o invariante no CI.
  it("keeps data-target inside the sanitize attribute allowlist", () => {
    assert.ok(
      ALLOWED_ATTR.includes("data-target"),
      "ALLOWED_ATTR precisa de data-target (alvo do alias sobrevive ao sanitize)",
    );
  });

  it("renders [[target|exibido]] with target in data-target and label as text", () => {
    const html = markdownToHtml("Veja [[capitulo-01|Capítulo Um]] aqui.");
    assert.match(html, /data-target="capitulo-01"/);
    assert.match(html, />Capítulo Um<\/a>/);
  });

  it("round-trips an aliased wikilink to [[target|label]] and is stable", () => {
    const r = fixedPoint("Veja [[capitulo-01|Capítulo Um]] e siga.");
    assert.match(r, /\[\[capitulo-01\|Capítulo Um\]\]/);
  });

  it("keeps plain [[name]] without inventing an alias (no regression)", () => {
    const html = markdownToHtml("Veja [[Elara]].");
    assert.doesNotMatch(html, /data-target/);
    assert.equal(fixedPoint("Veja [[Elara]] e [[capitulo-02]]."), "Veja [[Elara]] e [[capitulo-02]].");
  });

  it("handles accents on both sides of the alias", () => {
    const r = fixedPoint("Olhe [[órfã-arken|A Órfã de Arken]] agora.");
    assert.match(r, /\[\[órfã-arken\|A Órfã de Arken\]\]/);
  });
});
