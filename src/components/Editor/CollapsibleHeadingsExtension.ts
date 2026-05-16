import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Headings colapsáveis no editor.
 *
 * INVARIANTE CRÍTICO: o estado de fold vive SÓ no state do plugin. Ele
 * NUNCA vira atributo de nó nem toca o documento — logo não passa pelo
 * markdownBridge, não é serializado no .md e não polui o histórico
 * (undo). Dobrar/desdobrar não é uma edição. Reabrir o arquivo reseta
 * tudo desdobrado, o que é o comportamento seguro (markdown não tem
 * conceito de fold).
 *
 * Mecânica (espelha o padrão do SpellcheckExtension deste mesmo código:
 * decorations remapeadas por tr.mapping):
 *  - `collapsed`: posições-início dos headings dobrados.
 *  - Em docChanged, cada posição é remapeada e descartada se não apontar
 *    mais para um heading.
 *  - As decorations são reconstruídas do doc: cada heading ganha um
 *    widget-chevron clicável; headings dobrados recebem `Decoration.node`
 *    com classe `solon-collapsed-hidden` em cada bloco-irmão até o
 *    próximo heading de nível <= (semântica de outline).
 *
 * Não testável por UI neste ambiente — compila e é logicamente
 * consistente, mas a corretude de interação (clique do chevron, caret
 * em região escondida, undo/redo, convivência com Spellcheck/Wikilink/
 * Find decorations) precisa de validação no app rodando.
 */

const key = new PluginKey<CollapseState>("solon-collapsible-headings");

interface CollapseState {
  collapsed: number[];
  deco: DecorationSet;
}

function isHeadingAt(doc: PMNode, pos: number): PMNode | null {
  const node = doc.nodeAt(pos);
  return node && node.type.name === "heading" ? node : null;
}

function buildDecorations(doc: PMNode, collapsed: number[]): DecorationSet {
  const decos: Decoration[] = [];
  const collapsedSet = new Set(collapsed);

  // Itera só os filhos de topo do doc — ficção é majoritariamente plana
  // (parágrafos + headings). offset = posição ANTES do nó.
  const children: { node: PMNode; offset: number; index: number }[] = [];
  doc.forEach((node, offset, index) => {
    children.push({ node, offset, index });
  });

  for (let i = 0; i < children.length; i++) {
    const { node, offset } = children[i];
    if (node.type.name !== "heading") continue;

    const isCollapsed = collapsedSet.has(offset);

    // Chevron clicável em todo heading. mousedown.preventDefault evita
    // mexer na seleção; o toggle vai por meta (sem docChange → sem
    // markdown, sem undo).
    const headingPos = offset;
    decos.push(
      Decoration.widget(
        offset + 1,
        (view) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "solon-fold-toggle" + (isCollapsed ? " is-collapsed" : "");
          btn.setAttribute("aria-label", isCollapsed ? "Expandir seção" : "Recolher seção");
          btn.setAttribute("contenteditable", "false");
          btn.textContent = "▾";
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch(
              view.state.tr
                .setMeta(key, { toggle: headingPos })
                .setMeta("addToHistory", false),
            );
          });
          return btn;
        },
        { side: -1, ignoreSelection: true, key: `fold-${offset}-${isCollapsed}` },
      ),
    );

    if (!isCollapsed) continue;

    // Esconde os blocos-irmão até o próximo heading de nível <=.
    const level = (node.attrs.level as number) ?? 1;
    for (let j = i + 1; j < children.length; j++) {
      const sib = children[j];
      if (
        sib.node.type.name === "heading" &&
        ((sib.node.attrs.level as number) ?? 1) <= level
      ) {
        break;
      }
      decos.push(
        Decoration.node(sib.offset, sib.offset + sib.node.nodeSize, {
          class: "solon-collapsed-hidden",
        }),
      );
    }
  }

  return DecorationSet.create(doc, decos);
}

export const CollapsibleHeadingsExtension = Extension.create({
  name: "solonCollapsibleHeadings",

  addProseMirrorPlugins() {
    return [
      new Plugin<CollapseState>({
        key,
        state: {
          init: (_config, state) => ({
            collapsed: [],
            deco: buildDecorations(state.doc, []),
          }),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(key) as { toggle?: number } | undefined;
            let collapsed = value.collapsed;

            if (tr.docChanged) {
              // Remapeia e descarta posições que não são mais heading.
              collapsed = collapsed
                .map((pos) => tr.mapping.map(pos, -1))
                .filter((pos) => isHeadingAt(newState.doc, pos) != null);
            }

            let changed = tr.docChanged;
            if (meta && typeof meta.toggle === "number") {
              const pos = meta.toggle;
              if (collapsed.includes(pos)) {
                collapsed = collapsed.filter((p) => p !== pos);
              } else if (isHeadingAt(newState.doc, pos)) {
                collapsed = [...collapsed, pos];
              }
              changed = true;
            }

            if (!changed) return value;
            return { collapsed, deco: buildDecorations(newState.doc, collapsed) };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.deco ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
