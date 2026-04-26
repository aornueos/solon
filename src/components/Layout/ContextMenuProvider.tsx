import { useEffect } from "react";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  Bold,
  Italic,
  Undo2,
  Redo2,
  CaseSensitive,
  BookPlus,
} from "lucide-react";
import { useAppStore, ContextMenuItem } from "../../store/useAppStore";
import { findWordAtCoords, replaceRange, getCurrentEditor } from "../../lib/editorRef";
import {
  addToPersonalDict,
  ensureSpellchecker,
  getSpellcheckerIfReady,
  isCorrect,
  isInPersonalDict,
  suggest,
} from "../../lib/spellcheck";

/**
 * Listener global de right-click: bloqueia o context menu nativo do
 * WebView e dispara o nosso (`openContextMenu`).
 *
 * O conteudo do menu varia por contexto:
 *  - Editor (.ProseMirror): cut/copy/paste/colar-sem-formatacao + bold/
 *    italic + undo/redo + spellcheck toggle + selecionar-tudo
 *  - Sidebar/outras areas: copy + selecionar-tudo (futuro: rename/delete
 *    quando target for um FileNode)
 *  - Generico (qualquer outro): so' selecionar-tudo + paste
 *
 * Implementacao: um unico listener no document detecta o evento e
 * inspeciona o `target` pra decidir o set de items.
 */
export function ContextMenuProvider() {
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const closeContextMenu = useAppStore((s) => s.closeContextMenu);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);
  const setSpellcheckEnabled = useAppStore((s) => s.setSpellcheckEnabled);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Areas onde a gente PROPOSITALMENTE deixa o native passar:
      // - inputs <input type="file"> (picker do OS)
      // - elementos com data-allow-native-context-menu (escape hatch)
      if (target.closest("[data-allow-native-context-menu]")) return;

      e.preventDefault();
      e.stopPropagation();

      const items = buildItems({
        target,
        clientX: e.clientX,
        clientY: e.clientY,
        spellcheckEnabled,
        setSpellcheckEnabled,
        closeContextMenu,
        pushToast,
      });
      if (items.length === 0) return;
      openContextMenu(e.clientX, e.clientY, items);
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [
    openContextMenu,
    closeContextMenu,
    spellcheckEnabled,
    setSpellcheckEnabled,
    pushToast,
  ]);

  return null;
}

function buildItems({
  target,
  clientX,
  clientY,
  spellcheckEnabled,
  setSpellcheckEnabled,
  closeContextMenu,
  pushToast,
}: {
  target: HTMLElement;
  clientX: number;
  clientY: number;
  spellcheckEnabled: boolean;
  setSpellcheckEnabled: (v: boolean) => void;
  closeContextMenu: () => void;
  pushToast: (kind: "info" | "success" | "error", msg: string) => void;
}): ContextMenuItem[] {
  const inEditor = !!target.closest(".ProseMirror");
  const inEditableInput =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  const sel = window.getSelection();
  const hasSelection = !!sel && !sel.isCollapsed && (sel.toString().length > 0);

  if (inEditor) {
    // Detecta se o clique foi sobre uma palavra errada — se sim,
    // prepende sugestoes + "Adicionar ao dicionario" no menu. Caso
    // engine ainda nao esteja carregada, dispara o load e mostra o menu
    // sem sugestoes (proximo right-click ja' tera).
    const spellcheckPrefix = spellcheckEnabled
      ? buildSpellcheckItems({
          clientX,
          clientY,
          closeContextMenu,
          pushToast,
        })
      : [];
    return [
      ...spellcheckPrefix,
      ...editorItems({
        hasSelection,
        spellcheckEnabled,
        setSpellcheckEnabled,
      }),
    ];
  }
  if (inEditableInput) {
    return inputItems({ hasSelection });
  }
  return genericItems({ hasSelection });
}

/**
 * Items de spellcheck pra prepender ao menu do editor.
 *
 * Comportamento:
 *  1. Se nao ha editor ativo ou clique nao caiu em palavra → []
 *  2. Engine nao carregada AINDA → dispara load (warm-up acontece em
 *     paralelo, este right-click ja' fica sem sugestao mas o proximo
 *     pega) e retorna []
 *  3. Palavra correta (no dict ou no personal) → []
 *  4. Palavra errada → [...sugestoes, separator, "Adicionar ao dict",
 *     separator]
 *  5. Palavra errada SEM sugestoes (raro — palavra muito distante de
 *     qualquer entry) → ["Nenhuma sugestao" disabled, "Adicionar ao dict"]
 *
 * Importante: items de sugestao usam o `editor` que pegamos uma vez
 * aqui — se o editor for desmontado entre o build do menu e o click,
 * o command e' no-op silencioso.
 */
function buildSpellcheckItems({
  clientX,
  clientY,
  closeContextMenu,
  pushToast,
}: {
  clientX: number;
  clientY: number;
  closeContextMenu: () => void;
  pushToast: (kind: "info" | "success" | "error", msg: string) => void;
}): ContextMenuItem[] {
  const editor = getCurrentEditor();
  if (!editor) return [];

  const wordInfo = findWordAtCoords(editor, clientX, clientY);
  if (!wordInfo) return [];

  // Numerais ("2026", "v0.5.0") nao sao palavras — pula. nspell
  // marcaria como erro mas o user obviamente nao quer "sugestoes" pra
  // um ano.
  if (/^\d+$/.test(wordInfo.word)) return [];

  // Engine nao carregada: dispara warm-up se ainda nao foi e retorna
  // sem prefix. Sem isso, o user clicaria, veria menu sem sugestoes,
  // sem entender por que.
  const speller = getSpellcheckerIfReady();
  if (!speller) {
    ensureSpellchecker(); // fire-and-forget
    return [];
  }

  // Ja' no dicionario pessoal — sumira como erro tambem; nada a fazer.
  if (isInPersonalDict(wordInfo.word)) return [];
  if (isCorrect(wordInfo.word)) return [];

  const suggestions = suggest(wordInfo.word);

  const items: ContextMenuItem[] = [];

  if (suggestions.length === 0) {
    items.push({
      label: "Nenhuma sugestão",
      disabled: true,
      onClick: () => {},
    });
  } else {
    for (const sug of suggestions) {
      items.push({
        // As sugestoes sao a acao primaria — listadas sem icone pra
        // ficarem visualmente destacadas das acoes operacionais
        // (recortar, etc) que tem icone. Texto puro = "voce quis dizer".
        label: sug,
        onClick: () => {
          replaceRange(editor, wordInfo.from, wordInfo.to, sug);
          closeContextMenu();
        },
      });
    }
  }

  items.push({ kind: "separator" });
  items.push({
    label: `Adicionar "${wordInfo.word}" ao dicionário`,
    icon: <BookPlus size={12} />,
    onClick: () => {
      addToPersonalDict(wordInfo.word);
      pushToast("success", `Adicionado "${wordInfo.word}" ao dicionário pessoal.`);
    },
  });
  items.push({ kind: "separator" });

  return items;
}

function editorItems({
  hasSelection,
  spellcheckEnabled,
  setSpellcheckEnabled,
}: {
  hasSelection: boolean;
  spellcheckEnabled: boolean;
  setSpellcheckEnabled: (v: boolean) => void;
}): ContextMenuItem[] {
  // Acoes no editor: usamos document.execCommand pra integrar com
  // ProseMirror sem precisar de uma referencia direta ao editor TipTap.
  // execCommand e' deprecated mas ainda funciona em todos os WebViews
  // do Tauri 2 (Chromium + WebKit) e nao quebra a undo stack do TipTap.
  return [
    {
      label: "Recortar",
      icon: <Scissors size={12} />,
      shortcut: "Ctrl+X",
      disabled: !hasSelection,
      onClick: () => document.execCommand("cut"),
    },
    {
      label: "Copiar",
      icon: <Copy size={12} />,
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      onClick: () => document.execCommand("copy"),
    },
    {
      label: "Colar",
      icon: <ClipboardPaste size={12} />,
      shortcut: "Ctrl+V",
      // Webviews bloqueiam clipboard.read() sem prompt — usamos
      // execCommand pra colar com formatacao. Se rejeitado, no-op.
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) document.execCommand("insertText", false, text);
        } catch {
          // Fallback: deixa o user usar Ctrl+V mesmo. execCommand("paste")
          // nao funciona sem user gesture em alguns webviews.
        }
      },
    },
    {
      label: "Colar sem formatação",
      shortcut: "Ctrl+Shift+V",
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) document.execCommand("insertText", false, text);
        } catch {
          /* ignora */
        }
      },
    },
    { kind: "separator" },
    {
      label: "Negrito",
      icon: <Bold size={12} />,
      shortcut: "Ctrl+B",
      disabled: !hasSelection,
      onClick: () => document.execCommand("bold"),
    },
    {
      label: "Itálico",
      icon: <Italic size={12} />,
      shortcut: "Ctrl+I",
      disabled: !hasSelection,
      onClick: () => document.execCommand("italic"),
    },
    { kind: "separator" },
    {
      label: "Desfazer",
      icon: <Undo2 size={12} />,
      shortcut: "Ctrl+Z",
      onClick: () => document.execCommand("undo"),
    },
    {
      label: "Refazer",
      icon: <Redo2 size={12} />,
      shortcut: "Ctrl+Y",
      onClick: () => document.execCommand("redo"),
    },
    { kind: "separator" },
    {
      label: "Verificar ortografia",
      icon: <CaseSensitive size={12} />,
      checked: spellcheckEnabled,
      onClick: () => {
        const next = !spellcheckEnabled;
        setSpellcheckEnabled(next);
        // Atualiza o atributo no .ProseMirror imperativamente — TipTap
        // nao reactivo a editorProps.attributes pos-init.
        const pm = document.querySelector(
          ".ProseMirror",
        ) as HTMLElement | null;
        if (pm) pm.setAttribute("spellcheck", String(next));
      },
    },
    { kind: "separator" },
    {
      label: "Selecionar tudo",
      shortcut: "Ctrl+A",
      onClick: () => document.execCommand("selectAll"),
    },
  ];
}

function inputItems({ hasSelection }: { hasSelection: boolean }): ContextMenuItem[] {
  return [
    {
      label: "Recortar",
      icon: <Scissors size={12} />,
      shortcut: "Ctrl+X",
      disabled: !hasSelection,
      onClick: () => document.execCommand("cut"),
    },
    {
      label: "Copiar",
      icon: <Copy size={12} />,
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      onClick: () => document.execCommand("copy"),
    },
    {
      label: "Colar",
      icon: <ClipboardPaste size={12} />,
      shortcut: "Ctrl+V",
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) document.execCommand("insertText", false, text);
        } catch {
          /* ignora */
        }
      },
    },
    { kind: "separator" },
    {
      label: "Selecionar tudo",
      shortcut: "Ctrl+A",
      onClick: () => document.execCommand("selectAll"),
    },
  ];
}

function genericItems({ hasSelection }: { hasSelection: boolean }): ContextMenuItem[] {
  // Areas read-only (sidebar, canvas, paineis) — basicamente so copia
  // do que ja' tiver selecionado. Selecionar-tudo nao faz sentido fora
  // de inputs/editor, entao deixamos so' Copy.
  return [
    {
      label: "Copiar",
      icon: <Copy size={12} />,
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      onClick: () => document.execCommand("copy"),
    },
  ];
}
