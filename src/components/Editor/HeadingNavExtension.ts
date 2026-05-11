import { Extension } from "@tiptap/core";

/**
 * Tab / Shift+Tab em heading promove/demote o level.
 *
 * - Tab: aumenta o level (H1 -> H2 -> H3 ... H6). Cap em 6.
 * - Shift+Tab: diminui o level (H6 -> H5 ... H2 -> H1). Floor em 1.
 *
 * IMPORTANTE: deve ser carregado ANTES de IndentExtension na lista de
 * extensions (assim TipTap testa esse shortcut primeiro; se nao for
 * heading, retorna false e o Indent assume).
 *
 * Promover/demote em ficcao reorganiza a hierarquia sem mexer no texto.
 * Exemplo: "## Cena 3" virou "### Cena 3" subordinada ao capitulo
 * anterior — fluxo classico de outliner.
 */
export const HeadingNavExtension = Extension.create({
  name: "headingNav",

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const node = $from.node();
        if (node.type.name !== "heading") return false;
        const currentLevel = (node.attrs.level as number) ?? 1;
        const nextLevel = Math.min(6, currentLevel + 1);
        if (nextLevel === currentLevel) {
          // ja' em H6 — bloqueia o Tab pra nao escapar do editor mesmo
          // sem mudanca de level.
          return true;
        }
        return editor
          .chain()
          .focus()
          .setHeading({ level: nextLevel as 1 | 2 | 3 | 4 | 5 | 6 })
          .run();
      },
      "Shift-Tab": ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const node = $from.node();
        if (node.type.name !== "heading") return false;
        const currentLevel = (node.attrs.level as number) ?? 1;
        const prevLevel = Math.max(1, currentLevel - 1);
        if (prevLevel === currentLevel) return true;
        return editor
          .chain()
          .focus()
          .setHeading({ level: prevLevel as 1 | 2 | 3 | 4 | 5 | 6 })
          .run();
      },
    };
  },
});
