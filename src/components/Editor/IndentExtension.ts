import { Extension } from "@tiptap/core";

/**
 * Indentação de parágrafo estilo romance.
 * Tab → aplica text-indent: 2em (primeira linha recuada)
 * Shift+Tab → remove indentação
 */
export const IndentExtension = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          indent: {
            default: false,
            // Antes usavamos `style="text-indent: 2em"`. Problema: o
            // DOMPurify do markdownBridge bloqueia `style` (vetor de
            // XSS), entao o indent era perdido ao recarregar a nota.
            // Agora usamos um data-attribute custom + CSS rule no
            // globals.css. data-indent passa pelo DOMPurify (whitelist)
            // e nao tem risco de injection.
            parseHTML: (el) => el.getAttribute("data-indent") === "true",
            renderHTML: (attrs) =>
              attrs.indent ? { "data-indent": "true" } : {},
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const node = $from.node();

        // Só age em parágrafos (não em listas, headings, etc.)
        if (node.type.name !== "paragraph") return false;

        return editor
          .chain()
          .focus()
          .updateAttributes("paragraph", { indent: true })
          .run();
      },

      "Shift-Tab": ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const node = $from.node();

        if (node.type.name !== "paragraph") return false;

        return editor
          .chain()
          .focus()
          .updateAttributes("paragraph", { indent: false })
          .run();
      },
    };
  },
});
