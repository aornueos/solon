import { useEffect } from "react";
import { AppLayout } from "./components/Layout/AppLayout";
import { useAppStore } from "./store/useAppStore";
import { useFileSystem } from "./hooks/useFileSystem";
import { useAutoSave } from "./hooks/useAutoSave";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import { useSceneCardSync } from "./hooks/useSceneCardSync";
import { checkForUpdate } from "./lib/updater";

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
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
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
  ]);

  return <AppLayout />;
}
