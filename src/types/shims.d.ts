/**
 * Shims para pacotes sem tipos oficiais.
 *
 * Os plugins GFM do turndown são publicados como JS puro; o turndown aceita
 * qualquer função no `use()`, então `Plugin` aqui é só um placeholder.
 */
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  type Plugin = (service: TurndownService) => void;
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
}
