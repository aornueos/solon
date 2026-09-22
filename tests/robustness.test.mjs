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
import {
  countWords,
  headerKeyword,
  roundWordCount,
  surnameOf,
} from "../src/lib/docxExport.ts";
import { isSafeAssetSrc } from "../src/lib/canvasImages.ts";
import { useCanvasStore } from "../src/store/useCanvasStore.ts";
import {
  clientToSurface,
  contentBoxes,
  entityRects,
  fitAllViewport,
  neighbourId,
  zoomToLevel,
} from "../src/lib/canvasViewport.ts";
import { isSelectionToggle } from "../src/lib/canvasSelectionInput.ts";
import {
  EDITOR_PAGE_MARGIN_RATIO,
  EDITOR_PAGE_SIZES,
} from "../src/store/useAppStore.ts";
import {
  auditThemes,
  contrast,
  readThemes,
} from "./helpers/themeContrast.mjs";

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

// DOCX / formato Shunn — helpers puros. A folha de rosto Shunn vive ou
// morre nesses números (contagem "Cerca de N palavras", cabeçalho
// corrido). Travados no CI no mesmo padrão do roundtrip.
describe("docx Shunn — contagem de palavras", () => {
  it("rounds short stories to the nearest 100, never below one step", () => {
    assert.equal(roundWordCount(0, "short"), 100);
    assert.equal(roundWordCount(3500, "short"), 3500);
    assert.equal(roundWordCount(3540, "short"), 3500);
    assert.equal(roundWordCount(3560, "short"), 3600);
  });

  it("rounds novels to the nearest 1000, never below one step", () => {
    assert.equal(roundWordCount(50, "novel"), 1000);
    assert.equal(roundWordCount(82000, "novel"), 82000);
    assert.equal(roundWordCount(82490, "novel"), 82000);
    assert.equal(roundWordCount(82500, "novel"), 83000);
  });

  it("counts words ignoring markdown punctuation", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("a b c"), 3);
    assert.equal(countWords("uma frase **simples** aqui"), 4);
    assert.equal(countWords("# Capítulo 1"), 2);
    assert.equal(countWords("> citação `code` _enf_"), 3);
  });
});

describe("docx Shunn — cabeçalho corrido", () => {
  it("derives a keyword: first word longer than 3 chars, uppercased", () => {
    assert.equal(headerKeyword("O Portal de Arken"), "PORTAL");
    assert.equal(headerKeyword("Canção Órfã"), "CANÇÃO");
  });

  it("falls back to the first word, then to a default", () => {
    assert.equal(headerKeyword("Sol"), "SOL");
    assert.equal(headerKeyword(""), "MANUSCRITO");
  });

  it("takes the surname as the last name token", () => {
    assert.equal(surnameOf("Lua Arpessoal"), "Arpessoal");
    assert.equal(surnameOf("Ana Maria de Souza"), "Souza");
    assert.equal(surnameOf("  Clarice  "), "Clarice");
    assert.equal(surnameOf(""), "Autor");
  });
});

describe("canvas — zoom ancorado no ponteiro", () => {
  const surfacePoint = (x, y) => {
    const { viewport } = useCanvasStore.getState();
    return {
      x: (x - viewport.x) / viewport.zoom,
      y: (y - viewport.y) / viewport.zoom,
    };
  };

  it("keeps the world point under the anchor fixed", () => {
    useCanvasStore.getState().reset();
    useCanvasStore.getState().setViewport({ x: -120, y: 40, zoom: 0.8 });

    // Ponto da superfície sobre o qual o usuário está com o cursor.
    const anchorX = 430;
    const anchorY = 275;
    const before = surfacePoint(anchorX, anchorY);

    useCanvasStore.getState().zoomAt(anchorX, anchorY, -200);
    const after = surfacePoint(anchorX, anchorY);

    assert.ok(useCanvasStore.getState().viewport.zoom > 0.8);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
  });

  it("clamps zoom to the supported range", () => {
    useCanvasStore.getState().reset();
    for (let i = 0; i < 40; i += 1) useCanvasStore.getState().zoomAt(0, 0, -500);
    assert.equal(useCanvasStore.getState().viewport.zoom, 3);
    for (let i = 0; i < 80; i += 1) useCanvasStore.getState().zoomAt(0, 0, 500);
    assert.equal(useCanvasStore.getState().viewport.zoom, 0.2);
  });
});

describe("canvas — seleção primária e grupo andam juntos", () => {
  it("replaces an active group when a new item is created", () => {
    const store = useCanvasStore.getState();
    store.reset();
    const a = store.addCard({ x: 0, y: 0 });
    const b = store.addCard({ x: 400, y: 0 });
    useCanvasStore.getState().selectMany([a, b], a);
    assert.equal(useCanvasStore.getState().selectedIds.size, 2);

    const fresh = useCanvasStore.getState().addCard({ x: 800, y: 0 });
    const after = useCanvasStore.getState();
    assert.equal(after.selectedId, fresh);
    assert.deepEqual([...after.selectedIds], [fresh]);

    // Delete agora apaga o card recém-criado, não o grupo anterior.
    useCanvasStore.getState().removeSelected();
    const ids = useCanvasStore.getState().cards.map((c) => c.id);
    assert.deepEqual(ids.sort(), [a, b].sort());
  });

  it("drops a removed item from the group without clearing the rest", () => {
    const store = useCanvasStore.getState();
    store.reset();
    const a = store.addCard({ x: 0, y: 0 });
    const b = store.addCard({ x: 400, y: 0 });
    const c = store.addCard({ x: 800, y: 0 });
    useCanvasStore.getState().selectMany([a, b, c], a);

    useCanvasStore.getState().removeCard(b);
    const after = useCanvasStore.getState();
    assert.deepEqual([...after.selectedIds].sort(), [a, c].sort());
    assert.equal(after.selectedId, a);

    useCanvasStore.getState().removeCard(a);
    assert.equal(useCanvasStore.getState().selectedId, null);
    assert.deepEqual([...useCanvasStore.getState().selectedIds], [c]);
  });
});

describe("canvas — enquadrar tudo", () => {
  const surface = { width: 1000, height: 600 };

  it("frames strokes, not only cards and images", () => {
    const store = useCanvasStore.getState();
    store.reset();
    store.addCard({ x: 0, y: 0, w: 200, h: 100 });
    store.addStroke({ points: [0, 0, 4000, 3000], color: "", width: 2 });

    const viewport = fitAllViewport(surface);
    // O traço é largo demais para caber em 1:1 — o enquadramento precisa
    // afastar. Sem contar os traços, o zoom continuaria no teto (1.2).
    assert.ok(viewport.zoom < 1);

    // O canto inferior direito do traço cabe na superfície.
    const screenX = 4000 * viewport.zoom + viewport.x;
    const screenY = 3000 * viewport.zoom + viewport.y;
    assert.ok(screenX <= surface.width + 1e-6);
    assert.ok(screenY <= surface.height + 1e-6);
  });

  it("returns the neutral viewport for an empty canvas", () => {
    useCanvasStore.getState().reset();
    assert.deepEqual(fitAllViewport(surface), { x: 0, y: 0, zoom: 1 });
  });
});

describe("canvas — referencial da superfície", () => {
  it("converts pointer coordinates into the surface frame", () => {
    // `viewport.x/y` é relativo à superfície do canvas, que começa depois
    // da sidebar e abaixo do titlebar. Usar clientX/clientY cru ancorava o
    // zoom deslocado por exatamente essa margem.
    const rect = { left: 268, top: 72, width: 900, height: 500 };
    assert.deepEqual(clientToSurface(300, 100, rect), { x: 32, y: 28 });
  });

  it("falls back to raw coordinates when there is no surface", () => {
    assert.deepEqual(clientToSurface(300, 100, null), { x: 300, y: 100 });
  });
});

describe("canvas — modificador de seleção", () => {
  const evt = (over = {}) => ({
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...over,
  });

  it("accepts shift, ctrl and cmd", () => {
    // Shift é a convenção de Figma/Miro; Ctrl/Cmd já valia aqui. No macOS
    // Ctrl+clique abre o menu do sistema, então Shift precisa funcionar.
    assert.equal(isSelectionToggle(evt({ shiftKey: true })), true);
    assert.equal(isSelectionToggle(evt({ ctrlKey: true })), true);
    assert.equal(isSelectionToggle(evt({ metaKey: true })), true);
  });

  it("leaves a plain click replacing the selection", () => {
    assert.equal(isSelectionToggle(evt()), false);
  });
});

describe("canvas — zoom em nível exato", () => {
  it("keeps the point at the centre of the surface fixed", () => {
    const store = useCanvasStore.getState();
    store.reset();
    store.setViewport({ x: -340, y: 128, zoom: 2.5 });

    // Sem DOM o helper cai em 0x0; o ponto de referencia e o mesmo antes e
    // depois, que e a propriedade em teste.
    const w = 0;
    const h = 0;
    const centre = () => {
      const { viewport } = useCanvasStore.getState();
      return {
        x: (w / 2 - viewport.x) / viewport.zoom,
        y: (h / 2 - viewport.y) / viewport.zoom,
      };
    };

    const before = centre();
    zoomToLevel(1);
    const after = centre();

    assert.equal(useCanvasStore.getState().viewport.zoom, 1);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
  });
});

describe("canvas — percurso por teclado", () => {
  const seed = () => {
    const store = useCanvasStore.getState();
    store.reset();
    // Criados fora de ordem de leitura de propósito: o percurso ordena.
    const baixo = store.addCard({ x: 0, y: 500, w: 200, h: 100 });
    const cimaDireita = store.addCard({ x: 400, y: 0, w: 200, h: 100 });
    const cimaEsquerda = store.addCard({ x: 0, y: 0, w: 200, h: 100 });
    return { baixo, cimaDireita, cimaEsquerda };
  };

  it("walks top-to-bottom then left-to-right", () => {
    const { baixo, cimaDireita, cimaEsquerda } = seed();
    const ordem = entityRects().map((e) => e.id);
    assert.deepEqual(ordem, [cimaEsquerda, cimaDireita, baixo]);
  });

  it("wraps around at both ends", () => {
    const { baixo, cimaEsquerda } = seed();
    assert.equal(neighbourId(baixo, 1), cimaEsquerda);
    assert.equal(neighbourId(cimaEsquerda, -1), baixo);
  });

  it("starts from either end when nothing is selected", () => {
    const { baixo, cimaEsquerda } = seed();
    assert.equal(neighbourId(null, 1), cimaEsquerda);
    assert.equal(neighbourId(null, -1), baixo);
  });

  it("reaches arrows, which have no box of their own", () => {
    const store = useCanvasStore.getState();
    store.reset();
    const a = store.addCard({ x: 0, y: 0, w: 100, h: 100 });
    const b = store.addCard({ x: 600, y: 0, w: 100, h: 100 });
    useCanvasStore.getState().addArrow(a, b);
    const arrowId = useCanvasStore.getState().arrows[0].id;
    assert.ok(entityRects().some((e) => e.id === arrowId));
    // O enquadramento ignora quem não ocupa área.
    assert.equal(contentBoxes().length, 2);
  });

  it("nudges the whole selection and collapses a burst into one undo", () => {
    const store = useCanvasStore.getState();
    store.reset();
    const a = store.addCard({ x: 0, y: 0, w: 100, h: 100 });
    const b = store.addCard({ x: 300, y: 0, w: 100, h: 100 });
    useCanvasStore.getState().selectMany([a, b], a);

    const historyBefore = useCanvasStore.getState().past.length;
    for (let i = 0; i < 5; i += 1) {
      useCanvasStore.getState().nudgeSelection(1, 0);
    }
    const state = useCanvasStore.getState();
    const byId = Object.fromEntries(state.cards.map((c) => [c.id, c]));
    assert.equal(byId[a].x, 5);
    assert.equal(byId[b].x, 305);
    assert.equal(state.past.length, historyBefore + 1);
  });

  it("does nothing without a selection", () => {
    const store = useCanvasStore.getState();
    store.reset();
    store.addCard({ x: 0, y: 0 });
    useCanvasStore.getState().select(null);
    const before = useCanvasStore.getState().cards[0].x;
    useCanvasStore.getState().nudgeSelection(10, 10);
    assert.equal(useCanvasStore.getState().cards[0].x, before);
  });
});

describe("temas — contraste WCAG", () => {
  it("keeps every theme above the floor for the pairs that reach the screen", () => {
    const failures = auditThemes();
    const report = failures
      .map(
        (f) =>
          `${f.theme}: ${f.fgName} sobre ${f.bgName} = ${f.ratio} (mínimo ${f.min})`,
      )
      .join("\n");
    assert.equal(failures.length, 0, `contraste insuficiente:\n${report}`);
  });

  it("covers every theme declared in the stylesheet", () => {
    const { themes } = readThemes();
    // 18 variantes `data-paper` mais o tema claro do :root. O piso pega
    // um tema que suma da conta por regressão no parser — foi assim que
    // `noir` e `amanhecer` passaram despercebidos.
    assert.ok(themes.size >= 19, `só ${themes.size} temas encontrados`);
    for (const nome of [
      "tokyo",
      "noir",
      "amanhecer",
      "creme",
      "mel",
      "vinho",
      "sangue",
      "claro",
    ]) {
      assert.ok(themes.has(nome), `tema ausente: ${nome}`);
    }
  });

  it("measures contrast the way WCAG does", () => {
    const preto = { rgb: [0, 0, 0], a: 1 };
    const branco = { rgb: [255, 255, 255], a: 1 };
    assert.equal(Math.round(contrast(preto, branco)), 21);
    assert.equal(Math.round(contrast(branco, branco)), 1);
  });
});

describe("editor — formatos de folha", () => {
  it("uses the ISO ratio for every size", () => {
    // Todo formato A tem proporção 1:√2; um valor errado apareceria aqui
    // antes de virar uma folha torta na tela.
    for (const size of EDITOR_PAGE_SIZES) {
      const ratio = size.height / size.width;
      assert.ok(
        Math.abs(ratio - Math.SQRT2) < 0.01,
        `${size.value}: proporção ${ratio.toFixed(3)}`,
      );
    }
  });

  it("halves the area from one size to the next", () => {
    const [a5, a4, a3] = EDITOR_PAGE_SIZES;
    assert.ok(Math.abs(a4.width / a5.height - 1) < 0.01, "A4 nasce do A5");
    assert.ok(Math.abs(a3.width / a4.height - 1) < 0.01, "A3 nasce do A4");
  });

  it("keeps the margin proportional, so A5 is not swallowed by it", () => {
    const margens = EDITOR_PAGE_SIZES.map((s) =>
      Math.round(s.width * EDITOR_PAGE_MARGIN_RATIO),
    );
    // A margem do A4 é a polegada clássica.
    assert.equal(margens[1], 96);
    // Cresce com a folha, sem nunca comer mais de um terço da largura.
    assert.ok(margens[0] < margens[1] && margens[1] < margens[2]);
    for (const [i, m] of margens.entries()) {
      assert.ok(m * 2 < EDITOR_PAGE_SIZES[i].width / 1.5, `margem grande demais em ${EDITOR_PAGE_SIZES[i].value}`);
    }
  });
});
