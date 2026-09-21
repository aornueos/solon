/**
 * Convenção de modificador para somar/tirar um item da seleção no canvas.
 *
 * Shift é o gesto canônico em Figma, Miro e Illustrator; Ctrl/Cmd continua
 * valendo porque já era o único aceito aqui. No macOS, Ctrl+clique é o
 * atalho do menu de contexto do sistema, então Shift é a única tecla
 * confiável nas duas plataformas.
 */
export function isSelectionToggle(e: {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return e.shiftKey || e.ctrlKey || e.metaKey;
}
