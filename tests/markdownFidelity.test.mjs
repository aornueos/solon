// O DOM precisa existir antes de o editor e o DOMPurify carregarem.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Editor } from "@tiptap/core";
import { createEditorExtensions } from "../src/components/Editor/editorExtensions.ts";
import {
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

function roundtrip(markdown) {
  editor.commands.setContent(markdownToHtml(markdown), false);
  return htmlToMarkdown(editor.getHTML()).trim();
}

function same(name, markdown) {
  it(name, () => {
    assert.equal(roundtrip(markdown), markdown.trim());
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
