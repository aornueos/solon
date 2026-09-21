import { Extension } from "@tiptap/core";

/**
 * Handler de Backspace pra sair de listas (BulletList/OrderedList).
 *
 * Comportamento padrão do TipTap:
 *  - Enter no item vazio  → já sai da lista (built-in)
 *  - Backspace no item    → so apaga char até esvaziar; chegar em
 *                           "•" sozinho com cursor posição 0 NAO sai.
 *
 * O usuário espera o oposto disso vindo de Notion/Bear/Obsidian: começa
 * a fazer uma lista, decide que não era pra ser lista, aperta Backspace
 * pra escapar. Esta extensao adiciona esse atalho universal:
 *
 *   Item de lista vazio + cursor no inicio + Backspace → liftListItem
 *
 * "Vazio" = sem texto. O cursor em parentOffset 0 numa text-node de 0
 * caracteres confirma "vou sair se Backspace".
 */
export const ListExitExtension = Extension.create({
  name: "listExit",

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        // So mexe em seleção colapsada — seleção com range vai pelo
        // delete-range padrão.
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;

        // Sobe até achar um listItem como antecessor direto.
        const grandparent = $from.node(-1);
        if (!grandparent) return false;
        if (grandparent.type.name !== "listItem") return false;

        // Item realmente vazio? (parent atual = paragraph dentro do
        // listItem; content.size === 0 = nada digitado)
        const parent = $from.parent;
        if (parent.content.size !== 0) return false;

        // Lift = sai da lista. Funciona pra bulletList e orderedList
        // pq o nome do listItem e o mesmo em ambas (TipTap unifica).
        return editor.chain().focus().liftListItem("listItem").run();
      },
    };
  },
});
