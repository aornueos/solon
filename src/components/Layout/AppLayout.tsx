import { lazy, Suspense, useCallback, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { Sidebar } from "../Sidebar/Sidebar";
import { Outline } from "../Outline/Outline";
import { Inspector } from "../Inspector/Inspector";
import { Titlebar } from "./Titlebar";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { ToastLayer } from "./ToastLayer";
import { DialogLayer } from "./DialogLayer";
import { UpdateNotesDialog } from "./UpdateNotesDialog";
import { SettingsDialog } from "./SettingsDialog";
import { RecoveryDialog } from "./RecoveryDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ExportDialog } from "./ExportDialog";
import { CommandPalette } from "./CommandPalette";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { LocalHistoryDialog } from "./LocalHistoryDialog";
import { ContextMenuLayer } from "./ContextMenuLayer";
import { ContextMenuProvider } from "./ContextMenuProvider";
import { ReferencePane } from "./ReferencePane";
import { Scratchpad } from "./Scratchpad";
import { startDrag } from "../../lib/drag";
import { readDraggedTab, TAB_DND_MIME } from "../../lib/tabs";
import { X } from "lucide-react";

const Editor = lazy(() =>
  import("../Editor/Editor").then((m) => ({ default: m.Editor })),
);
const CanvasView = lazy(() =>
  import("../Canvas/CanvasView").then((m) => ({ default: m.CanvasView })),
);
const HomePage = lazy(() =>
  import("../HomePage/HomePage").then((m) => ({ default: m.HomePage })),
);

export function AppLayout() {
  // Seletores granulares evitam re-render do AppLayout a cada keystroke
  // (o fileBody e headings também vivem nessa store e mudam constantemente).
  const showShortcuts = useAppStore((s) => s.showShortcuts);
  const closeShortcuts = useAppStore((s) => s.closeShortcuts);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const isOutlineOpen = useAppStore((s) => s.isOutlineOpen);
  const isInspectorOpen = useAppStore((s) => s.isInspectorOpen);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const outlineWidth = useAppStore((s) => s.outlineWidth);
  const focusMode = useAppStore((s) => s.focusMode);
  const readingMode = useAppStore((s) => s.readingMode);
  const toggleReadingMode = useAppStore((s) => s.toggleReadingMode);
  const activeView = useAppStore((s) => s.activeView);
  const splitPane = useAppStore((s) => s.splitPane);
  const setSplitPane = useAppStore((s) => s.setSplitPane);
  const floatingInspector = useAppStore((s) => s.floatingInspector);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const setOutlineWidth = useAppStore((s) => s.setOutlineWidth);
  const [tabDropHint, setTabDropHint] = useState(false);

  const inCanvas = activeView === "canvas";
  const inHome = activeView === "home";
  // Reading mode esconde TODO chrome — supera focusMode + chrome-toggles.
  // Outros toggles (sidebar/outline/inspector) sao ignorados enquanto
  // reading mode estiver ativo; quando sai, volta ao que estava.
  const showSidebar = isSidebarOpen && !focusMode && !readingMode && !inHome;
  // No canvas/home: painel direito não faz sentido (Inspector/Outline são do editor).
  // Home tambem fica sem chrome — landing limpa, so o conteudo central.
  const showInspector =
    isInspectorOpen &&
    !floatingInspector.enabled &&
    !focusMode &&
    !readingMode &&
    !inCanvas &&
    !inHome;
  const showOutline =
    isOutlineOpen && !focusMode && !readingMode && !inCanvas && !inHome;
  const showRightPanel = showInspector || showOutline;
  const showTitlebar = !readingMode;
  const showStatusBar = !readingMode;
  const showTabBar = !inHome && !readingMode;
  const showSplit = !inHome && !readingMode && splitPane.kind !== "none";

  const renderCurrentView = () =>
    inHome ? <HomePage /> : inCanvas ? <CanvasView /> : <Editor />;

  const onMainDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TAB_DND_MIME)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const inRightHalf = e.clientX > rect.left + rect.width * 0.55;
    if (!inRightHalf) {
      setTabDropHint(false);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setTabDropHint(true);
  };

  const onMainDrop = (e: React.DragEvent) => {
    const tab = readDraggedTab(e.dataTransfer);
    if (!tab) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const inRightHalf = e.clientX > rect.left + rect.width * 0.55;
    setTabDropHint(false);
    if (!inRightHalf) return;
    e.preventDefault();
    setSplitPane({ kind: "reference", path: tab.path, name: tab.name });
  };

  const onSidebarMouseDown = useCallback(() => {
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const finish = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    startDrag({
      onMove: (e) => setSidebarWidth(Math.max(160, Math.min(400, e.clientX))),
      onEnd: finish,
      onCancel: finish,
    });
  }, [setSidebarWidth]);

  const onOutlineMouseDown = useCallback(() => {
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const finish = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    startDrag({
      onMove: (e) =>
        setOutlineWidth(
          Math.max(200, Math.min(440, window.innerWidth - e.clientX)),
        ),
      onEnd: finish,
      onCancel: finish,
    });
  }, [setOutlineWidth]);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-panel)" }}
    >
      {showTitlebar && <Titlebar />}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="flex-shrink-0 overflow-hidden"
            >
              <Sidebar />
            </div>
            <ResizeGutter onMouseDown={onSidebarMouseDown} />
          </>
        )}

        {/* Área principal — Editor ou Canvas */}
        <div
          className="flex-1 min-w-0 overflow-hidden flex flex-col"
          style={{ background: "var(--bg-app)" }}
          onDragOver={onMainDragOver}
          onDragLeave={() => setTabDropHint(false)}
          onDrop={onMainDrop}
        >
          {/* TabBar aparece fora da home — na landing nao faz sentido,
              e ela ja' tem chrome proprio. Em focus mode permanece: o
              user pediu pra ela ficar aberta porque navegar entre abas
              e parte do fluxo de escrita; eh menos chrome do que tirar
              a navegacao. */}
          {showTabBar && <TabBar />}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<ViewLoading />}>
              {showSplit ? (
                <div className="h-full flex min-w-0">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {renderCurrentView()}
                  </div>
                  <div
                    className="w-px flex-shrink-0"
                    style={{ background: "var(--border-subtle)" }}
                  />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {splitPane.kind === "canvas" ? (
                      <CanvasView />
                    ) : splitPane.kind === "reference" ? (
                      <ReferencePane path={splitPane.path} name={splitPane.name} />
                    ) : null}
                  </div>
                </div>
              ) : (
                renderCurrentView()
              )}
            </Suspense>
            {tabDropHint && (
              <div
                className="absolute top-3 bottom-3 right-3 w-[45%] rounded-lg pointer-events-none flex items-center justify-center text-[0.78rem]"
                style={{
                  border: "1px solid var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                  color: "var(--text-primary)",
                }}
              >
                Soltar como painel de referência
              </div>
            )}
          </div>
        </div>

        {/* Painel direito: Inspector e/ou Outline */}
        {showRightPanel && (
          <>
            <ResizeGutter onMouseDown={onOutlineMouseDown} />
            <div
              style={{ width: outlineWidth }}
              className="flex-shrink-0 overflow-hidden flex flex-col"
            >
              {showInspector && showOutline ? (
                <>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <Inspector />
                  </div>
                  <div
                    className="h-px flex-shrink-0"
                    style={{ background: "var(--border-subtle)" }}
                  />
                  <div
                    className="flex-shrink-0 overflow-hidden"
                    style={{ height: "min(40%, 280px)" }}
                  >
                    <Outline />
                  </div>
                </>
              ) : showInspector ? (
                <Inspector />
              ) : (
                <Outline />
              )}
            </div>
          </>
        )}
      </div>

      {showStatusBar && <StatusBar />}
      <ToastLayer />
      <DialogLayer />
      <CommandPalette />
      <GlobalSearchDialog />
      <LocalHistoryDialog />
      <UpdateNotesDialog />
      <SettingsDialog />
      <RecoveryDialog />
      <ShortcutsDialog open={showShortcuts} onClose={closeShortcuts} />
      <ExportDialog />
      <Scratchpad />
      {floatingInspector.enabled && isInspectorOpen && !readingMode && (
        <FloatingInspector />
      )}
      {readingMode && (
        <button
          type="button"
          onClick={toggleReadingMode}
          aria-label="Sair do modo leitura"
          title="Sair do modo leitura (Esc, F11 ou Ctrl+Shift+R)"
          className="fixed top-3 right-3 z-[90] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-opacity text-[0.72rem]"
          style={{
            // Opacidade alta (0.85) — antes era 0.3, quase invisivel
            // no dark theme. Em fundo escuro, 0.3 dava preto-em-preto
            // e o user nao via o botao. Confiavel > sutil.
            background: "var(--bg-panel)",
            border: "1px solid var(--accent)",
            color: "var(--text-primary)",
            opacity: 0.85,
            boxShadow: "var(--shadow-md)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.85")}
        >
          <X size={12} />
          <span>Sair</span>
        </button>
      )}
      <ContextMenuLayer />
      <ContextMenuProvider />
    </div>
  );
}

function ViewLoading() {
  return (
    <div
      className="h-full w-full flex items-center justify-center text-[0.78rem]"
      style={{ color: "var(--text-muted)", background: "var(--bg-app)" }}
    >
      Carregando...
    </div>
  );
}

function FloatingInspector() {
  const rect = useAppStore((s) => s.floatingInspector);
  const setRect = useAppStore((s) => s.setFloatingInspectorRect);

  const startMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button,input,textarea,select")) return;
    if (e.clientY > rect.y + 44) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = rect.x;
    const origY = rect.y;
    startDrag({
      onMove: (ev) => {
        setRect({
          x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, origX + ev.clientX - startX)),
          y: Math.max(8, Math.min(window.innerHeight - 120, origY + ev.clientY - startY)),
        });
      },
    });
  }, [rect.height, rect.width, rect.x, rect.y, setRect]);

  return (
    <div
      className="fixed z-[120] overflow-hidden rounded-lg"
      onMouseDownCapture={startMove}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: "var(--bg-panel-2)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <Inspector />
    </div>
  );
}

/**
 * Gutter vertical de resize. Tem 1px de largura mas uma hit-box de 5px
 * via `::before` pra o cursor pegar sem precisão cirúrgica. A cor muda
 * no hover pra dar feedback — usa `var(--accent)` pra seguir o tema.
 */
function ResizeGutter({ onMouseDown }: { onMouseDown: () => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 cursor-col-resize transition-colors"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    />
  );
}
