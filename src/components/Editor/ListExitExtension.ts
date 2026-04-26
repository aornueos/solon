import { Extension } from "@tiptap/core";

/**
 * Handler de Backspace pra sair de listas (BulletList/OrderedList).
 *
 * Comportamento padrao do TipTap:
 *  - Enter no item vazio  → ja' sai da lista (built-in)
 *  - Backspace no item    → so apaga char ate' esvaziar; chegar em
 *                           "•" sozinho com cursor posicao 0 NAO sai.
 *
 * O usuario espera o oposto disso vindo de Notion/Bear/Obsidian: comeca
 * a fazer uma lista, decide que nao era pra ser lista, aperta Backspace
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
        // So mexe em selecao colapsada — selecao com range vai pelo
        // delete-range padrao.
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;

        // Sobe ate' achar um listItem como antecessor direto.
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
