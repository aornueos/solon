import { Mark, markInputRule } from "@tiptap/core";

/**
 * Wikilinks `[[name]]` estilo Obsidian — uma mark visual que aplica
 * estilo de link interno num trecho de texto. NAO carrega atributo
 * "target" separado do textContent: o conteudo da mark E' o target.
 * Isso garante que editar o texto da wikilink dentro do editor
 * naturalmente muda pra onde ela aponta — sem dessincronia.
 *
 * Trade-off vs node-based:
 *  - Pro: editavel inline, sem complicacoes de NodeView ou estado
 *    paralelo.
 *  - Con: nao da' pra ter "alias" tipo `[[Cap1|Capitulo Um]]` (Obsidian
 *    feature). Pode vir em 0.9.
 *
 * Roundtrip com markdown e' feito em `markdownBridge.ts`:
 *  - Lendo: `[[name]]` -> `<a class="wikilink">name</a>` antes do TipTap.
 *  - Salvando: turndown rule captura `<a class="wikilink">` e emite
 *    `[[textContent]]`.
 *
 * Click e' tratado no Editor.tsx via delegate global (mais flexivel
 * que ProseMirror plugin pra esse caso).
 */
export const WikilinkExtension = Mark.create({
  name: "wikilink",

  // Exclui mark de bold/italic/etc — wikilink eh uma "alavanca de
  // navegacao", nao formatacao. Sobrepor formatacao confunde o user e
  // complica turndown.
  excludes: "bold italic strike code",

  parseHTML() {
    return [
      {
        tag: 'a.wikilink',
      },
      {
        tag: 'a[data-wikilink="true"]',
      },
    ];
  },

  renderHTML() {
    return [
      "a",
      {
        class: "wikilink",
        "data-wikilink": "true",
        // href fake — o click handler real intercepta e abre via store.
        // Sem href, o cursor nao mostra pointer; com href="#" o browser
        // tenta scrollar pro top. Solucao: pointer-events via CSS +
        // role=link semantico.
        href: "javascript:void(0)",
        role: "link",
      },
      0,
    ];
  },

  addInputRules() {
    return [
      // `[[texto]]` digitado vira mark automaticamente quando o user
      // fecha o segundo `]`. Regex captura o que ta entre os colchetes.
      // Funciona em digitacao ao vivo — assim o usuario nem precisa
      // saber que "wikilinks existem".
      markInputRule({
        find: /\[\[([^\]\n]+)\]\]$/,
        type: this.type,
      }),
    ];
  },
});
