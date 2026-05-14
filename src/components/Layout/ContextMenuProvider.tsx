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
  Search,
  Settings,
  FileDown,
  BookOpen,
} from "lucide-react";
import { useAppStore, ContextMenuItem } from "../../store/useAppStore";
import { findWordAtCoords, replaceRange, getCurrentEditor } from "../../lib/editorRef";
import {
  addToPersonalDict,
  ensureSpellchecker,
  isCorrect,
  isSpellcheckerReady,
  shouldSpellcheckWord,
  suggest,
} from "../../lib/spellcheck";
import type { Editor } from "@tiptap/react";

/**
 * Listener global de right-click: bloqueia o context menu nativo do
 * WebView e dispara o nosso (`openContextMenu`).
 *
 * Fluxo:
 *  1. Click direito → `onContextMenu` previne default
 *  2. Build items sync conforme contexto (editor/input/generic)
 *  3. Abre menu IMEDIATAMENTE com os items basicos
 *  4. Se foi em palavra dentro do editor → dispara checagem async no
 *     worker. Se misspelled, atualiza items do menu prepending com
 *     sugestoes.
 *
 * Crucial: NADA na pipeline e' bloqueante. Menu abre instantaneo
 * mesmo quando o spellcheck ainda esta carregando o dicionario (o
 * que demora 8-10s na primeira vez, mas no worker nao trava a UI).
 */
export function ContextMenuProvider() {
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const closeContextMenu = useAppStore((s) => s.closeContextMenu);
  const updateContextMenuItems = useAppStore((s) => s.updateContextMenuItems);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);
  const setSpellcheckEnabled = useAppStore((s) => s.setSpellcheckEnabled);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest("[data-allow-native-context-menu]")) return;

      e.preventDefault();
      e.stopPropagation();

      // Build dos items sync — mesmo no caso "talvez tenha sugestao",
      // precisamos abrir o menu imediato. Sugestoes vem depois via
      // updateContextMenuItems.
      const inEditor = !!target.closest(".ProseMirror");
      const inEditableInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const sel = window.getSelection();
      const hasSelection =
        !!sel && !sel.isCollapsed && sel.toString().length > 0;

      let baseItems: ContextMenuItem[];
      if (inEditor) {
        baseItems = editorItems({
          hasSelection,
          spellcheckEnabled,
          setSpellcheckEnabled,
        });
      } else if (inEditableInput) {
        baseItems = inputItems({ hasSelection });
      } else {
        baseItems = genericItems({ hasSelection });
      }

      if (baseItems.length === 0) return;

      // Se for editor + spellcheck on + caiu numa palavra checavel,
      // prepende um placeholder "Verificando ortografia..." enquanto o
      // worker checa. Isso da feedback IMEDIATO ao usuario de que o
      // sistema esta trabalhando — antes o menu abria sem nada de
      // spellcheck mesmo quando a palavra estava errada, e o usuario
      // pensava que a feature so' nao funcionava.
      let menuItems = baseItems;
      let wordToCheck: { word: string; from: number; to: number } | null =
        null;
      let editorRef: ReturnType<typeof getCurrentEditor> = null;

      if (inEditor && spellcheckEnabled) {
        editorRef = getCurrentEditor();
        if (editorRef) {
          const wordInfo = findWordAtCoords(
            editorRef,
            e.clientX,
            e.clientY,
          );
          // So' mostra placeholder se for uma palavra "checavel" — nao
          // numero, nao no dict pessoal. Senao deixa o menu abrir
          // limpo (sem placeholder que ficaria pra sempre).
          if (wordInfo && shouldSpellcheckWord(wordInfo.word)) {
            wordToCheck = wordInfo;
            menuItems = [
              {
                label: "Verificando ortografia…",
                disabled: true,
                onClick: () => {},
              },
              { kind: "separator" },
              ...baseItems,
            ];
          }
        }
      }

      // Abre o menu agora (com ou sem placeholder).
      const menuId = openContextMenu(e.clientX, e.clientY, menuItems);

      // Se prepended placeholder, dispara o async pra resolver.
      if (wordToCheck && editorRef) {
        attachSuggestionsAsync({
          editor: editorRef,
          wordInfo: wordToCheck,
          menuId,
          baseItems,
          updateContextMenuItems,
          closeContextMenu,
          pushToast,
        });
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [
    openContextMenu,
    closeContextMenu,
    updateContextMenuItems,
    spellcheckEnabled,
    setSpellcheckEnabled,
    pushToast,
  ]);

  return null;
}

/**
 * Roda a checagem ortografica em background (worker) e, se a palavra
 * estiver errada, atualiza o menu aberto prepending sugestoes +
 * "Adicionar ao dicionario".
 *
 * Como o menu ja' esta visivel quando entramos aqui, o usuario ve uma
 * "atualizacao" do menu quando as sugestoes chegam — UX equivalente a
 * loading inline. Tipicamente <100ms quando engine ja' carregada,
 * 8-10s na primeira vez (engine compilando o .dic). UI fica responsiva
 * porque worker nao bloqueia main thread.
 */
async function attachSuggestionsAsync({
  editor,
  wordInfo,
  menuId,
  baseItems,
  updateContextMenuItems,
  closeContextMenu,
  pushToast,
}: {
  editor: Editor;
  wordInfo: { word: string; from: number; to: number };
  menuId: string;
  baseItems: ContextMenuItem[];
  updateContextMenuItems: (id: string, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
  pushToast: (
    kind: "info" | "success" | "error",
    message: string,
  ) => void;
}): Promise<void> {
  // Se engine nao esta pronta, kicka o init em background. A propria
  // chamada de isCorrect abaixo vai esperar (no worker) ate ficar
  // pronta, entao o menu so' atualiza apos o load completar — mas SEM
  // travar UI no meio.
  if (!isSpellcheckerReady()) {
    ensureSpellchecker();
  }

  let correct: boolean;
  try {
    correct = await isCorrect(wordInfo.word);
  } catch (err) {
    console.warn("[spellcheck] isCorrect failed:", err);
    // Remove placeholder restaurando baseItems pra nao deixar
    // "Verificando ortografia…" la' pra sempre.
    updateContextMenuItems(menuId, baseItems);
    return;
  }
  if (correct) {
    // Palavra correta — remove placeholder restaurando o menu normal.
    updateContextMenuItems(menuId, baseItems);
    return;
  }

  let suggestions: string[];
  try {
    suggestions = await suggest(wordInfo.word);
  } catch (err) {
    console.warn("[spellcheck] suggest failed:", err);
    suggestions = [];
  }
  // Build do prefix com sugestoes
  const prefix: ContextMenuItem[] = [];

  if (suggestions.length === 0) {
    prefix.push({
      label: "Nenhuma sugestão",
      disabled: true,
      onClick: () => {},
    });
  } else {
    for (const sug of suggestions) {
      prefix.push({
        label: sug,
        onClick: () => {
          replaceRange(editor, wordInfo.from, wordInfo.to, sug);
          closeContextMenu();
        },
      });
    }
  }

  prefix.push({ kind: "separator" });
  prefix.push({
    label: `Adicionar "${wordInfo.word}" ao dicionário`,
    icon: <BookPlus size={12} />,
    onClick: () => {
      addToPersonalDict(wordInfo.word);
      pushToast(
        "success",
        `Adicionado "${wordInfo.word}" ao dicionário pessoal.`,
      );
    },
  });
  prefix.push({ kind: "separator" });

  // Atualiza o menu (se ainda for o mesmo — store check via menuId)
  updateContextMenuItems(menuId, [...prefix, ...baseItems]);
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
          /* clipboard sem permissao — usar Ctrl+V */
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
      },
    },
    { kind: "separator" },
    {
      label: "Buscar na nota",
      icon: <Search size={12} />,
      shortcut: "Ctrl+F",
      onClick: () =>
        document.dispatchEvent(new CustomEvent("solon:find-open")),
    },
    {
      label: "Exportar PDF",
      icon: <FileDown size={12} />,
      shortcut: "Ctrl+Shift+E",
      onClick: () => useAppStore.getState().openExport(),
    },
    {
      label: "Modo leitura",
      icon: <BookOpen size={12} />,
      shortcut: "Ctrl+Shift+R",
      onClick: () => useAppStore.getState().toggleReadingMode(),
    },
    { kind: "separator" },
    {
      label: "Selecionar tudo",
      shortcut: "Ctrl+A",
      onClick: () => document.execCommand("selectAll"),
    },
  ];
}

function inputItems({
  hasSelection,
}: {
  hasSelection: boolean;
}): ContextMenuItem[] {
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

function genericItems({
  hasSelection,
}: {
  hasSelection: boolean;
}): ContextMenuItem[] {
  return [
    {
      label: "Copiar",
      icon: <Copy size={12} />,
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      onClick: () => document.execCommand("copy"),
    },
    { kind: "separator" },
    {
      label: "Buscar notas e pastas",
      icon: <Search size={12} />,
      shortcut: "Ctrl+K",
      onClick: () => useAppStore.getState().openCommandPalette(),
    },
    {
      label: "Buscar no projeto",
      icon: <Search size={12} />,
      shortcut: "Ctrl+Shift+F",
      onClick: () => useAppStore.getState().openGlobalSearch(),
    },
    {
      label: "Modo leitura",
      icon: <BookOpen size={12} />,
      shortcut: "Ctrl+Shift+R",
      onClick: () => useAppStore.getState().toggleReadingMode(),
    },
    {
      label: "Exportar PDF",
      icon: <FileDown size={12} />,
      shortcut: "Ctrl+Shift+E",
      onClick: () => useAppStore.getState().openExport(),
    },
    {
      label: "Preferencias",
      icon: <Settings size={12} />,
      shortcut: "Ctrl+,",
      onClick: () => useAppStore.getState().openSettings(),
    },
  ];
}
