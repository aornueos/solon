import type { Editor } from "@tiptap/react";

/**
 * Referencia ao editor TipTap ativo.
 *
 * Existe pra que codigo NAO-React (handlers globais como o
 * ContextMenuProvider, atalhos, etc) consiga conversar com o editor sem
 * precisar passar refs por arvore de props ou usar Context.
 *
 * Editor.tsx registra/desregistra via `setCurrentEditor` no ciclo de
 * vida. So' existe um editor por janela do app — ate que a gente
 * implemente split view, a singleton e' suficiente.
 */
let currentEditor: Editor | null = null;

export function setCurrentEditor(editor: Editor | null): void {
  currentEditor = editor;
}

export function getCurrentEditor(): Editor | null {
  return currentEditor;
}

/**
 * Flush sincrono do trabalho pendente do `onUpdate` do editor. O Editor
 * debounce em ~180ms o turndown + setFileBody (caro em docs grandes); se
 * o user dispara Ctrl+S OU troca de arquivo dentro dessa janela, a store
 * tem fileBody desatualizado. O useAutoSave chama flush() antes de
 * persistir; o useEffect de troca de arquivo chama antes do hidrate.
 *
 * Editor.tsx registra/desregistra via `setEditorFlush` no ciclo de
 * vida (mesma pegada do `setCurrentEditor`).
 */
let editorFlush: (() => void) | null = null;

export function setEditorFlush(fn: (() => void) | null): void {
  editorFlush = fn;
}

export function flushEditor(): void {
  editorFlush?.();
}

/**
 * Encontra a palavra na posicao client (mouse coords) dentro do editor.
 *
 * Usa `posAtCoords` do ProseMirror pra mapear pixel → posicao do doc, e
 * depois caminha pra tras/frente no texto do textblock pai pra achar
 * limites de palavra. Considera "letra" qualquer codepoint Unicode em
 * \p{L} ou \p{M} (combining marks pra acentos compostos).
 *
 * Retorna null se:
 *  - o clique foi fora de qualquer texto
 *  - o textblock nao tem conteudo de texto
 *  - a posicao caiu numa quebra de palavra (espaco, pontuacao)
 */
export function findWordAtCoords(
  editor: Editor,
  clientX: number,
  clientY: number,
): { word: string; from: number; to: number } | null {
  const view = editor.view;
  const coords = view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) return null;

  const $pos = view.state.doc.resolve(coords.pos);
  const node = $pos.parent;
  if (!node.isTextblock) return null;

  const blockStart = $pos.start();
  const text = node.textContent;
  const offset = coords.pos - blockStart;
  if (offset < 0 || offset > text.length) return null;

  // \p{L} = letras (todas as scripts), \p{M} = combining marks (acentos
  // que vem como codepoint separado em formas decompostas NFD).
  // Apostrofes/hifens NAO contam como parte de palavra — "guarda-chuva"
  // vira ["guarda", "chuva"], cada uma checada separadamente. Aceitavel.
  const isWordChar = (ch: string | undefined): boolean =>
    ch ? /[\p{L}\p{M}]/u.test(ch) : false;

  let s = offset;
  while (s > 0 && isWordChar(text[s - 1])) s--;
  let e = offset;
  while (e < text.length && isWordChar(text[e])) e++;

  if (s === e) return null;

  return {
    word: text.slice(s, e),
    from: blockStart + s,
    to: blockStart + e,
  };
}

/**
 * Substitui o range [from, to] do doc pela `replacement`. Usa o command
 * pipeline do TipTap pra que a operacao apareca no undo stack como uma
 * unica acao (Ctrl+Z desfaz a correcao volta ao texto errado).
 */
export function replaceRange(
  editor: Editor,
  from: number,
  to: number,
  replacement: string,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, replacement)
    .run();
}
