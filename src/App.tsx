import { useEffect } from "react";
import { AppLayout } from "./components/Layout/AppLayout";
import { useAppStore } from "./store/useAppStore";
import { useFileSystem } from "./hooks/useFileSystem";
import { useAutoSave } from "./hooks/useAutoSave";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import { useSceneCardSync } from "./hooks/useSceneCardSync";
import { checkForUpdate } from "./lib/updater";

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
  const { restoreLastFolder, refresh } = useFileSystem();

  // Aplica tema no <html data-theme="...">
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useAutoSave();
  useCanvasPersistence();
  useSceneCardSync();

  // Restaura última pasta aberta
  useEffect(() => {
    restoreLastFolder();
  }, [restoreLastFolder]);

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

  // Refresca árvore quando a janela ganha foco (pega mudanças externas)
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
        toggleFocusMode();
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
  ]);

  return <AppLayout />;
}
