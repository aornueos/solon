// O DOM precisa existir antes de o editor carregar.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Editor } from "@tiptap/core";
import { createEditorExtensions } from "../src/components/Editor/editorExtensions.ts";
import { markdownToHtml } from "../src/components/Editor/markdownBridge.ts";
import { collectWordRanges } from "../src/components/Editor/SpellcheckExtension.ts";
import {
  isSentenceStart,
  matchCase,
  normalizeSpellWord,
  shouldSpellcheckWord,
  wordAtOffset,
} from "../src/lib/spellcheck.ts";

describe("corretor — o que é checado", () => {
  it("começo de frase: início do parágrafo, depois de pontuação final e do travessão", () => {
    assert.equal(isSentenceStart(""), true);
    assert.equal(isSentenceStart("Ela saiu. "), true);
    assert.equal(isSentenceStart("Sério? "), true);
    assert.equal(isSentenceStart("E então… "), true);
    assert.equal(isSentenceStart("— "), true);
    assert.equal(isSentenceStart('Ele disse: "'), false);
    assert.equal(isSentenceStart("Encontrei a "), false);
  });

  it("maiúscula só no começo de frase; sigla nunca", () => {
    assert.equal(shouldSpellcheckWord("Nao", true), true);
    assert.equal(shouldSpellcheckWord("Nao", false), false);
    assert.equal(shouldSpellcheckWord("ONU", true), false);
    assert.equal(shouldSpellcheckWord("nao"), true);
  });

  it("a sugestão herda a caixa da palavra digitada", () => {
    assert.equal(matchCase("Nao", "não"), "Não");
    assert.equal(matchCase("NAO", "não"), "NÃO");
    assert.equal(matchCase("nao", "não"), "não");
  });

  it("apóstrofo: consulta com o reto, devolve no estilo do texto", () => {
    assert.equal(normalizeSpellWord("Don’t"), "don't");
    assert.equal(matchCase("dont’", "don't"), "don’t");
    assert.equal(matchCase("Isnt", "isn't"), "Isn't");
    assert.equal(shouldSpellcheckWord("isn’t"), true);
  });

  it("a palavra sob o cursor inclui o apóstrofo do meio, não as aspas", () => {
    const text = "say don’t 'go' now";
    assert.deepEqual(wordAtOffset(text, 6), { start: 4, end: 9 });
    assert.deepEqual(wordAtOffset(text, 12), { start: 11, end: 13 });
    // Entre "say" e "don’t", no espaço, a ponta de "say" conta.
    assert.deepEqual(wordAtOffset(text, 3), { start: 0, end: 3 });
    assert.equal(wordAtOffset("  ", 1), null);
  });
});

describe("corretor — posição das palavras no editor", () => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: createEditorExtensions(),
    content: "",
  });
  after(() => editor.destroy());

  // O corretor pula a palavra onde está o cursor (não sublinha enquanto
  // se digita); o cursor fica num parágrafo vazio no fim.
  const words = (markdown) => {
    editor.commands.setContent(markdownToHtml(`${markdown}\n\n<p><br></p>`), false);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    return collectWordRanges(editor.view).map((r) =>
      editor.state.doc.textBetween(r.from, r.to),
    );
  };

  it("depois de uma quebra de linha a faixa ainda cai na palavra certa", () => {
    // Antes a quebra (um nó sem texto) deslocava tudo em uma posição e o
    // sublinhado e a correção pegavam o trecho errado.
    assert.deepEqual(words("primeira linha  \nsegunda palavra"), [
      "primeira",
      "linha",
      "segunda",
      "palavra",
    ]);
  });

  it("checa a palavra com maiúscula que abre frase, pula nome no meio", () => {
    const found = words("Nao sei. Ela viu Lina ontem.");
    assert.ok(found.includes("Nao"), JSON.stringify(found));
    assert.ok(found.includes("Ela"), JSON.stringify(found));
    assert.ok(!found.includes("Lina"), JSON.stringify(found));
  });

  it("contração e elisão são uma palavra só; hífen separa", () => {
    const found = words("I don’t know why it isn’t here, caixa-d’água e guarda-chuva.");
    for (const word of ["don’t", "know", "isn’t", "here", "caixa", "d’água", "guarda", "chuva"]) {
      assert.ok(found.includes(word), `${word}: ${JSON.stringify(found)}`);
    }
    assert.ok(!found.includes("don"), JSON.stringify(found));
  });

  it("negrito no meio do parágrafo não muda o que abre frase", () => {
    const found = words("Ele **correu**. Depois parou.");
    assert.ok(found.includes("Depois"), JSON.stringify(found));
  });
});
