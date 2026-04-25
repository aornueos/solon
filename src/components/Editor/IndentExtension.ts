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
            parseHTML: (el) => el.style.textIndent === "2em",
            renderHTML: (attrs) =>
              attrs.indent ? { style: "text-indent: 2em" } : {},
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
