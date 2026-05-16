import { Mark, markInputRule, mergeAttributes, InputRule } from "@tiptap/core";

/**
 * Wikilinks estilo Obsidian — uma mark visual de link interno.
 *
 * Duas formas:
 *  - `[[nome]]`            → o texto visível É o target.
 *  - `[[target|exibido]]`  → "exibido" é o texto visível; o target real
 *                            viaja no atributo `target` (data-target no
 *                            HTML). É o alias do Obsidian.
 *
 * Quando não há alias, `target` fica null e o alvo é o próprio
 * textContent — então editar o texto inline naturalmente muda pra onde
 * a wikilink aponta, sem estado paralelo. Com alias, editar o texto só
 * muda o rótulo; o alvo persiste no atributo.
 *
 * Roundtrip com markdown em `markdownBridge.ts`:
 *  - Lendo: `[[t|d]]` → `<a class="wikilink" data-target="t">d</a>`.
 *  - Salvando: turndown emite `[[t|d]]` (ou `[[d]]` sem alias).
 * `data-target` está no ALLOWED_ATTR do sanitize — sem isso o alias
 * seria engolido na carga e o link apontaria pro rótulo errado.
 *
 * Click é tratado no Editor.tsx (delegate global) lendo data-target ??
 * textContent.
 */
export const WikilinkExtension = Mark.create({
  name: "wikilink",

  // Exclui formatação — wikilink é navegação, não estilo.
  excludes: "bold italic strike code",

  addAttributes() {
    return {
      target: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute("data-target") || null,
        renderHTML: (attrs) =>
          attrs.target ? { "data-target": attrs.target } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "a.wikilink" }, { tag: 'a[data-wikilink="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(
        {
          class: "wikilink",
          "data-wikilink": "true",
          // href fake — click handler real intercepta. Sem href não há
          // pointer; href="#" scrollaria pro topo.
          href: "javascript:void(0)",
          role: "link",
        },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addInputRules() {
    return [
      // `[[target|exibido]]` digitado ao vivo: substitui tudo pelo texto
      // "exibido" já com a mark carregando target. markInputRule não dá
      // conta (ele só marca o grupo, não separa rótulo/alvo).
      new InputRule({
        find: /\[\[([^\]\n|]+)\|([^\]\n]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const target = (match[1] || "").trim();
          const display = (match[2] || "").trim();
          if (!target || !display) return;
          state.tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(display, [this.type.create({ target })]),
          );
        },
      }),
      // `[[nome]]` simples — comportamento antigo, sem alias (target null).
      // Regex exclui `|` pra não colidir com a regra de alias acima.
      markInputRule({
        find: /\[\[([^\]\n|]+)\]\]$/,
        type: this.type,
      }),
    ];
  },
});
