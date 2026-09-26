// O DOM precisa existir antes de o editor e o DOMPurify carregarem.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Editor } from "@tiptap/core";
import { createEditorExtensions } from "../src/components/Editor/editorExtensions.ts";
import {
  createDocSerializer,
  htmlToMarkdown,
  markdownToHtml,
} from "../src/components/Editor/markdownBridge.ts";

// O caminho do salvamento de verdade: Markdown → HTML sanitizado → schema
// do editor → HTML do editor → Markdown. Testar só a ponte, sem o schema,
// deixava passar nó ou marca que o editor descarta (foi assim que links
// perdiam a URL no primeiro salvamento).
const editor = new Editor({
  element: document.createElement("div"),
  extensions: createEditorExtensions(),
  content: "",
});
after(() => editor.destroy());

// Corta só quebras de linha das pontas: `.trim()` também apagaria o EM
// SPACE do recuo de romance, e o teste do recuo não testaria nada.
const trimNewlines = (text) => text.replace(/^\n+|\n+$/g, "");

function roundtrip(markdown) {
  editor.commands.setContent(markdownToHtml(markdown), false);
  return trimNewlines(htmlToMarkdown(editor.getHTML()));
}

// O serializador incremental (usado a cada pausa na digitação) tem de
// dar exatamente o mesmo texto que a conversão do documento inteiro.
const serializeIncremental = createDocSerializer();
function incrementalMatchesFull() {
  assert.equal(
    serializeIncremental(editor.state.doc, editor.schema),
    htmlToMarkdown(editor.getHTML()),
  );
}

function same(name, markdown) {
  it(name, () => {
    assert.equal(roundtrip(markdown), trimNewlines(markdown));
    incrementalMatchesFull();
  });
}

describe("fidelidade do Markdown — o que o arquivo tem, o arquivo mantém", () => {
  same("link", "Veja [o site](https://exemplo.com) aqui.");
  same("link com título", '[site](https://exemplo.com "Página inicial")');
  same("link relativo para outra nota", "Ver [capítulo 2](capitulo-2.md).");
  same("autolink", "Acesse <https://exemplo.com>.");
  same("quebra de linha com dois espaços", "linha um  \nlinha dois");
  same("lista de tarefas", "- [ ] comprar pão\n- [x] revisar");
  same("lista mista de tarefa e item comum", "- [ ] tarefa\n- item comum");
  same("nota de rodapé", "Texto[^1].\n\n[^1]: A nota.");
  same("colchete em prosa não ganha barra", "Ele riu [risos] e saiu.");
  same("sublinhado", "texto <u>sublinhado</u> aqui");
  same("comentário HTML", "<!-- lembrete: revisar -->\n\nParágrafo.");
  same("comentário no meio da linha", "Texto <!-- nota --> aqui.");
  same("lista numerada que começa em 5", "5. quinto\n6. sexto");
  same("lista compacta", "- um\n- dois");
  same("lista aninhada", "- um\n  - um.a\n- dois");
  same("lista numerada com sublista", "1. um\n   - sub\n2. dois");
  same("tabela", "| a | b |\n| --- | --- |\n| 1 | 2 |");
  same("tabela com colunas alinhadas", "| a | b |\n| :-: | --: |\n| 1 | 2 |");
  same("imagem sozinha", "![capa](imagens/capa.png)");
  same("imagem redimensionada", '<img src="imagens/capa.png" alt="capa" width="320">');
  same("imagem redimensionada em porcentagem", '<img src="capa.png" alt="" width="50%">');
  same(
    "imagem redimensionada com título e caracteres especiais",
    '<img src="a&amp;b.png" alt="x" title="Um &quot;título&quot;" width="200">',
  );
  same("imagem redimensionada entre parágrafos", 'Antes.\n\n<img src="c.png" alt="c" width="240">\n\nDepois.');
  same("código com linguagem", "```js\nconst a = 1;\n```");
  same("negrito e itálico", "Um **forte** e *leve*.");
  same("tachado", "~~riscado~~");
  same("grifo", "<mark>grifo</mark>");
  same("título e parágrafo", "# Título\n\nTexto.");
  same("citação", "> citação");
  same("parágrafo vazio guardado", "A\n\n<p><br></p>\n\nB");
  same("wikilink", "[[Capítulo 1]]");
  same("wikilink com apelido", "[[cap1|o início]]");
  same("recuo de romance", " Recuado.");
  same("travessão de diálogo", "— Vamos? — perguntou ela.");

  it("serializador incremental = conversão completa num documento misto, antes e depois de editar", () => {
    const doc = [
      "# Capítulo\n\n\u2003Recuado com [link](https://x.com) e <u>sublinhado</u>.",
      "<!-- nota -->",
      "- [ ] tarefa\n- [x] feita",
      "5. quinto\n6. sexto",
      "| a | b |\n| :-: | --: |\n| 1 | 2 |",
      "> citação",
      "```js\nconst a = 1;\n```",
      "linha um  \nlinha dois",
      "A\n\n<p><br></p>\n\nB",
      "---",
      "![capa](capa.png)",
      "Fim com **negrito** e *itálico*.",
    ].join("\n\n");
    editor.commands.setContent(markdownToHtml(doc), false);
    incrementalMatchesFull();
    // Edita um bloco: só ele muda, o resto sai do cache.
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("Novo ");
    incrementalMatchesFull();
    editor.commands.focus("end");
    editor.commands.insertContent(" E mais.");
    incrementalMatchesFull();
  });

  it("serializador incremental mantém a quebra de linha no fim de um parágrafo do meio", () => {
    // Convertido sozinho, o bloco perdia os dois espaços finais.
    editor.commands.setContent("<p>linha</p><p>seguinte</p>", false);
    editor.commands.setTextSelection(6);
    editor.commands.setHardBreak();
    incrementalMatchesFull();
  });

  it("serializador incremental em documento vazio ou só com parágrafos vazios", () => {
    for (const markdown of ["", "<p><br></p>", "<p><br></p>\n\nTexto", "Texto\n\n<p><br></p>"]) {
      editor.commands.setContent(markdownToHtml(markdown), false);
      incrementalMatchesFull();
    }
  });

  it("aquecimento em fatias converte tudo e dá o mesmo texto", () => {
    const doc = Array.from({ length: 40 }, (_, i) => `## Cena ${i}\n\nTexto da cena ${i}.`).join("\n\n");
    editor.commands.setContent(markdownToHtml(doc), false);
    const serialize = createDocSerializer();
    let slices = 0;
    while (!serialize.warm(editor.state.doc, editor.schema, performance.now() + 0.05)) {
      slices++;
      assert.ok(slices < 1000, "o aquecimento não termina");
    }
    assert.equal(serialize.warm(editor.state.doc, editor.schema, 0), true);
    assert.equal(serialize(editor.state.doc, editor.schema), htmlToMarkdown(editor.getHTML()));
  });

  it("largura da imagem vira atributo do nó; tirar a largura volta ao ![]()", () => {
    editor.commands.setContent(markdownToHtml('<img src="c.png" alt="c" width="240px">'), false);
    const image = editor.state.doc.child(0);
    assert.equal(image.type.name, "image");
    assert.equal(image.attrs.width, "240");
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { ...image.attrs, width: null });
      return true;
    });
    assert.equal(trimNewlines(htmlToMarkdown(editor.getHTML())), "![c](c.png)");
  });

  it("largura inválida é ignorada", () => {
    editor.commands.setContent(markdownToHtml('<img src="c.png" alt="c" width="grande">'), false);
    assert.equal(editor.state.doc.child(0).attrs.width, null);
  });

  it("link com javascript: perde o destino, não vira link clicável", () => {
    const out = roundtrip("[clique](javascript:alert(1))");
    assert.ok(!/javascript:/i.test(out), out);
  });

  it("parágrafo vazio não vira quebra de linha dentro do editor", () => {
    editor.commands.setContent(markdownToHtml("A\n\n<p><br></p>\n\nB"), false);
    const empty = editor.state.doc.child(1);
    assert.equal(empty.type.name, "paragraph");
    assert.equal(empty.childCount, 0);
  });
});
