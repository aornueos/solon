/**
 * Se estamos rodando dentro do Tauri, que injeta `__TAURI_INTERNALS__` no
 * preload. No `vite dev` em navegador puro a global não existe e chamar
 * qualquer API nativa estoura, então todo caminho que toca disco, janela ou
 * updater passa por aqui antes.
 *
 * É uma função, não uma constante de módulo: avaliar no import amarra a
 * resposta à ordem de carregamento dos bundles.
 */
export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
