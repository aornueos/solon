import { useEffect } from "react";
import { AppLayout } from "./components/Layout/AppLayout";
import { useAppStore } from "./store/useAppStore";
import { useFileSystem } from "./hooks/useFileSystem";
import { useAutoSave } from "./hooks/useAutoSave";
import { useCrashRecovery } from "./hooks/useCrashRecovery";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import { useSceneCardSync } from "./hooks/useSceneCardSync";
import { checkForUpdate } from "./lib/updater";
import { flushEditor } from "./lib/editorRef";
import {
  isTauriRuntime,
  requestedFileFromUrl,
  setAppFullscreen,
  toggleAppFullscreen,
} from "./lib/windows";
import { EDITOR_PAPERS } from "./store/useAppStore";

function cycleVisualTheme() {
  const state = useAppStore.getState();
  const currentIndex = EDITOR_PAPERS.findIndex(
    (option) => option.value === state.editorPaper,
  );
  const next =
    EDITOR_PAPERS[(currentIndex + 1) % EDITOR_PAPERS.length] ?? EDITOR_PAPERS[0];
  state.setEditorPaper(next.value);
  state.pushToast("info", `Tema visual: ${next.label}`, 1600);
}

export default function App() {
  // Seletores granulares: destructure direto de `useAppStore()` assinaria
  // a cada mudança de qualquer field do store (wordCount, cards, toasts...),
  // re-renderizando o App inteiro e todos os seus filhos a cada keystroke.
  const editorPaper = useAppStore((s) => s.editorPaper);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleOutline = useAppStore((s) => s.toggleOutline);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const openSettings = useAppStore((s) => s.openSettings);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const openGlobalSearch = useAppStore((s) => s.openGlobalSearch);
  const openLocalHistory = useAppStore((s) => s.openLocalHistory);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const openExport = useAppStore((s) => s.openExport);
  const openScratchpad = useAppStore((s) => s.openScratchpad);
  const toggleReadingMode = useAppStore((s) => s.toggleReadingMode);
  const appZoom = useAppStore((s) => s.appZoom);
  const setAppZoom = useAppStore((s) => s.setAppZoom);
  const { restoreLastFolder, refresh, openFile, createUntitled, openFolder } = useFileSystem();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    if (editorPaper === "default") {
      document.documentElement.removeAttribute("data-paper");
    } else {
      document.documentElement.setAttribute("data-paper", editorPaper);
    }
  }, [editorPaper]);

  useEffect(() => {
    const scale = appZoom / 100;
    if (!isTauriRuntime()) {
      document.documentElement.style.setProperty("--app-zoom", String(scale));
      return;
    }
    document.documentElement.style.setProperty("--app-zoom", "1");
    let alive = true;
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => {
        if (!alive) return;
        return getCurrentWebview().setZoom(scale);
      })
      .catch((err) => {
        console.warn("[zoom] setZoom failed:", err);
      });
    return () => {
      alive = false;
    };
  }, [appZoom]);

  useAutoSave();
  useCrashRecovery();
  useCanvasPersistence();
  useSceneCardSync();

  // Restaura última pasta aberta
  useEffect(() => {
    void restoreLastFolder().then(async () => {
      const requested = requestedFileFromUrl();
      if (!requested) return;
      useAppStore.setState({ openTabs: [] });
      await openFile(requested.path, requested.name, { tab: "new" });
      setActiveView(requested.view);
    });
  }, [openFile, restoreLastFolder, setActiveView]);

  // Update check no boot, com defer pra nao concorrer com bootstrap (lendo
  // pasta, montando editor, etc). 5s e suficiente pra app sentir snappy.
  // Throttle de 6h fica dentro do `checkForUpdate` — chamadas subsequentes
  // (ex: foco da janela) sao cheap se ja checou recente.
  // Respeitamos a pref `autoCheckUpdates` — usuario que desligou nao quer
  // ver banner de update no proximo boot.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const { autoCheckUpdates: enabled } = useAppStore.getState();
      if (!enabled) return;
      setUpdateStatus({ kind: "checking" });
      const result = await checkForUpdate();
      if (result.kind === "available") {
        setUpdateStatus({ kind: "available", info: result.info });
      } else if (result.kind === "error") {
        // Silencioso — so log. Volta pra idle pra UI nao travar em "checking".
        setUpdateStatus({ kind: "idle" });
      } else {
        // none / skipped / unsupported — todos viram idle visualmente.
        setUpdateStatus({ kind: "idle" });
      }
    }, 5000);
    return () => window.clearTimeout(t);
  }, [setUpdateStatus]);

  // Refresca árvore quando a janela ganha foco (pega mudanças externas).
  // Debounce de 400ms pra absorver alt-tab rapido e clicks em sequencia
  // que disparam multiplos `focus` no mesmo "evento" pra o user. Sem isso,
  // alternar janelas N vezes em sequencia faz N reads do FS em paralelo.
  useEffect(() => {
    let timer: number | null = null;
    const onFocus = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refresh();
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // No app desktop, bloqueia os atalhos classicos de DevTools. No browser
  // web eles continuam livres, o que ajuda no desenvolvimento da versao web.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const devtoolsShortcut =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          (key === "i" || key === "j" || key === "c")) ||
        ((e.ctrlKey || e.metaKey) && key === "u");
      if (!devtoolsShortcut) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Atalhos globais de painel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const native = isTauriRuntime();

      if (ctrl && !e.shiftKey && key === "p") {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (ctrl && e.shiftKey && key === "p") {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (native && ctrl && !e.shiftKey && key === "o") {
        e.preventDefault();
        void openFolder();
        return;
      }
      if (native && ctrl && !e.shiftKey && key === "r") {
        e.preventDefault();
        refresh();
        return;
      }
      if (native && e.key === "F5") {
        e.preventDefault();
        refresh();
        return;
      }
      if (native && ctrl && !e.shiftKey && key === "l") {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (ctrl && e.shiftKey && key === "l") {
        e.preventDefault();
        cycleVisualTheme();
        return;
      }
      if (ctrl && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setAppZoom(useAppStore.getState().appZoom + 10);
        return;
      }
      if (ctrl && e.key === "-") {
        e.preventDefault();
        setAppZoom(useAppStore.getState().appZoom - 10);
        return;
      }
      if (ctrl && e.key === "0") {
        e.preventDefault();
        setAppZoom(100);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        toggleOutline();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandPalette();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openGlobalSearch();
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        openLocalHistory();
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleInspector();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        e.preventDefault();
        setActiveView("editor");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "2") {
        e.preventDefault();
        setActiveView("canvas");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "3") {
        e.preventDefault();
        setActiveView("home");
      }
      if (e.key === "F11") {
        e.preventDefault();
        void toggleAppFullscreen().catch((err) => {
          console.error("F11 fullscreen failed:", err);
        });
        return;
      }
      // Ctrl+, abre preferencias — convencao de macOS/VSCode/Obsidian.
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
      // Ctrl+/ abre cheatsheet de atalhos. Padrao herdado de
      // Slack/GitHub/Notion (US keyboards). `e.key === "/"` cobre
      // o caso normal; em layouts pt-BR ABNT2, "?" tambem casa como
      // alternativa pq o "/" exige Shift+Q. Mantemos ambos pra cobrir
      // os dois casos sem ergonomia ruim.
      if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        openShortcuts();
      }
      // Ctrl+Shift+E abre dialog de export pra PDF — convencao herdada
      // de editores de texto que tem "Export" no menu Arquivo.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "e"
      ) {
        e.preventDefault();
        openExport();
      }
      // Ctrl+Shift+R alterna reading mode (modo livro — esconde todo
      // chrome). R aqui *nao* eh "reload" do browser; em Tauri release
      // o reload nao tem efeito util e em dev fica como Ctrl+R puro.
      // Combinacao com Shift evita colidir com Ctrl+R do TipTap.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "r"
      ) {
        e.preventDefault();
        toggleReadingMode();
      }
      // PANIC KEY — Ctrl+Shift+Esc reseta TODOS os modos especiais e
      // restaura o chrome ao default. Pensado pra cenarios onde o user
      // fica "preso" num modo (reading sem chrome visivel) sem saber
      // como sair. Nao toca em ajustes persistidos — so' nos modos transientes.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Escape") {
        e.preventDefault();
        useAppStore.setState({
          readingMode: false,
          focusMode: false,
          isSidebarOpen: true,
          isOutlineOpen: true,
          isInspectorOpen: true,
        });
        void setAppFullscreen(false).catch(() => {});
        return;
      }
      // Esc em reading mode sai do modo (mesmo padrao de presentation
      // mode em browsers/Keynote). Nao bloqueia outros usos do Esc
      // (dialogs, etc) — esses tem listeners proprios com stopPropagation.
      // Capture phase pra sair ANTES de outros listeners consumirem o Esc.
      if (e.key === "Escape" && useAppStore.getState().readingMode) {
        // So' sai se nao tem texto selecionado ou dialog aberto. Dialogs
        // ja se fecham primeiro via seus proprios handlers — se chegou
        // aqui, nada esta priorizando o Esc.
        if (!useAppStore.getState().showCommandPalette) {
          e.preventDefault();
          toggleReadingMode();
        }
      }
      // Ctrl+T cria nova nota "Sem titulo" na raiz do projeto e abre
      // como aba ativa. Convencao classica de browsers/editores. Sem
      // pasta aberta, mostra toast (createUntitled cuida).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void createUntitled();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openScratchpad();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const tab = useAppStore.getState().reopenClosedTab();
        if (tab) void openFile(tab.path, tab.name, { tab: "preserve" });
        return;
      }
      // Ctrl+W fecha aba ativa. Se nao houver aba ativa, no-op (browser
      // fecharia a janela; nao queremos isso). Se a aba fechada era a
      // unica, limpa o arquivo ativo.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        const { activeFilePath, closeTab, openTabs } = useAppStore.getState();
        if (!activeFilePath) return;
        e.preventDefault();
        const next = closeTab(activeFilePath);
        if (next) {
          const tab = useAppStore.getState().openTabs.find((t) => t.path === next);
          if (tab) void openFile(tab.path, tab.name, { tab: "preserve" });
        } else if (openTabs.length <= 1) {
          // Era a unica aba: limpa o arquivo ativo (mesmo comportamento
          // do botao ✕ na ultima aba). Flush ANTES de zerar pra que
          // useAutoSave persista a ultima janela de digitacao no arquivo
          // que esta saindo de foco.
          flushEditor();
          useAppStore.setState({
            activeFilePath: null,
            activeFileName: null,
            fileBody: "",
            sceneMeta: {},
            headings: [],
            wordCount: 0,
            charCount: 0,
          });
        }
      }
      // Ctrl+Tab e Ctrl+Shift+Tab ciclam entre abas. Nao usa Ctrl+PageUp/Down
      // pra nao colidir com scroll de paginacao em outros contextos.
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
        const { openTabs, activeFilePath } = useAppStore.getState();
        if (openTabs.length < 2) return;
        e.preventDefault();
        const idx = openTabs.findIndex((t) => t.path === activeFilePath);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + dir + openTabs.length) % openTabs.length;
        const next = openTabs[nextIdx];
        if (next && next.path !== activeFilePath) {
          void openFile(next.path, next.name, { tab: "preserve" });
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    toggleSidebar,
    toggleOutline,
    toggleInspector,
    setActiveView,
    openSettings,
    openCommandPalette,
    openGlobalSearch,
    openLocalHistory,
    openShortcuts,
    openExport,
    openScratchpad,
    toggleReadingMode,
    openFile,
    createUntitled,
    openFolder,
    refresh,
    setAppZoom,
  ]);

  return <AppLayout />;
}
