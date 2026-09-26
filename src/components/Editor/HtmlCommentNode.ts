import { Node } from "@tiptap/core";
import { decodeCommentText, encodeCommentText } from "./markdownBridge";

/**
 * Comentário HTML `<!-- ... -->` numa linha própria do Markdown.
 *
 * Escritor usa comentário como nota para si ("<!-- revisar a cena -->").
 * Sem este nó o editor descartava o comentário ao abrir, e ele sumia do
 * arquivo no primeiro salvamento. Aqui ele vira um bloco atômico, só de
 * leitura, que aparece discreto no texto e volta intacto para o arquivo.
 *
 * O `markdownBridge` troca o comentário por
 * `<div data-solon-comment="...">` (texto codificado) antes de entregar ao
 * editor, e faz o caminho inverso ao salvar.
 */
export const HtmlCommentNode = Node.create({
  name: "htmlComment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => decodeCommentText(element.getAttribute("data-solon-comment")),
        renderHTML: (attributes) => ({
          "data-solon-comment": encodeCommentText(attributes.text as string),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-solon-comment]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      { ...HTMLAttributes, class: "solon-html-comment", contenteditable: "false" },
      (node.attrs.text as string).trim(),
    ];
  },
});

/** O mesmo comentário no meio de uma linha: "Texto <!-- nota --> aqui." */
export const HtmlCommentInlineNode = Node.create({
  name: "htmlCommentInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => decodeCommentText(element.getAttribute("data-solon-comment")),
        renderHTML: (attributes) => ({
          "data-solon-comment": encodeCommentText(attributes.text as string),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-solon-comment]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      { ...HTMLAttributes, class: "solon-html-comment-inline", contenteditable: "false" },
      (node.attrs.text as string).trim(),
    ];
  },
});
