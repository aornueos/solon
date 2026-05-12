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
import { requestedFileFromUrl } from "./lib/windows";

const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ !== undefined;

export default function App() {
  // Seletores granulares: destructure direto de `useAppStore()` assinaria
  // a cada mudança de qualquer field do store (wordCount, cards, toasts...),
  // re-renderizando o App inteiro e todos os seus filhos a cada keystroke.
  const theme = useAppStore((s) => s.theme);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleOutline = useAppStore((s) => s.toggleOutline);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const openSettings = useAppStore((s) => s.openSettings);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const openGlobalSearch = useAppStore((s) => s.openGlobalSearch);
  const openLocalHistory = useAppStore((s) => s.openLocalHistory);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const openExport = useAppStore((s) => s.openExport);
  const openScratchpad = useAppStore((s) => s.openScratchpad);
  const toggleReadingMode = useAppStore((s) => s.toggleReadingMode);
  const { restoreLastFolder, refresh, openFile, createUntitled } = useFileSystem();

  // Aplica tema no <html data-theme="...">
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
      await openFile(requested.path, requested.name);
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
      if (e.key === "F11") {
        e.preventDefault();
        // Se reading mode esta ligado, F11 PRIORIZA sair de reading
        // (panic-key behavior). Sem isso, o user em reading sem chrome
        // visivel apertaria F11 esperando algum efeito e nao acharia
        // o atalho real (Ctrl+Shift+R).
        if (useAppStore.getState().readingMode) {
          toggleReadingMode();
        } else {
          toggleFocusMode();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        toggleTheme();
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
      // como sair. Nao toca em settings persistidas (typewriter,
      // theme, paper) — so' nos modos transientes.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Escape") {
        e.preventDefault();
        useAppStore.setState({
          readingMode: false,
          focusMode: false,
          isSidebarOpen: true,
          isOutlineOpen: true,
          isInspectorOpen: true,
        });
        return;
      }
      // F11 alterna focus mode normalmente, MAS se reading mode estiver
      // ligado, F11 vira "sair do reading mode" — comportamento panic
      // pra muscle memory de fullscreen toggle. Sem isso, o user que
      // esquecer Ctrl+Shift+R nao acha o atalho.
      // (F11 ja' eh tratado acima nesse mesmo handler — adicionamos a
      // logica extra dentro do bloco F11 abaixo.)

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
        if (tab) void openFile(tab.path, tab.name);
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
          if (tab) void openFile(tab.path, tab.name);
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
          void openFile(next.path, next.name);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    toggleSidebar,
    toggleOutline,
    toggleInspector,
    toggleFocusMode,
    setActiveView,
    toggleTheme,
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
  ]);

  return <AppLayout />;
}
