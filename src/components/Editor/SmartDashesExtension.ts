import { Extension, textInputRule } from "@tiptap/core";

/**
 * Smart dashes — converte `--` em em dash (`—`) automaticamente
 * enquanto o user digita.
 *
 * Em pt-BR e ingles, em dash é o caractere padrão pra:
 *  - Marcar um aposto/parentese estilistico ("A casa — feita de pedra
 *    — era antiga.")
 *  - Substituir reticencias em interrupcoes de fala
 *  - Range de pages num índice ("p. 12—15") quando se usa em dash
 *
 * Sem essa extensao, o user teria que copiar de outro lugar ou usar
 * codigo Unicode (Alt+0151 no Windows). Markdown puro também não tem
 * sintaxe nativa pra em dash.
 *
 * Implementacao: input rule do TipTap. Quando o segundo `-` é digitado
 * após um primeiro `-`, o regex `--$` casa e substitui por `—`. Fire
 * imediato — não espera espaco. Em pt-BR é raro alguem digitar `--`
 * com outra intencao (palavras hifenizadas tem 1 hifen so').
 */
export const SmartDashesExtension = Extension.create({
  name: "smartDashes",

  addInputRules() {
    return [
      textInputRule({
        find: /--$/,
        replace: "—",
      }),
    ];
  },
});
