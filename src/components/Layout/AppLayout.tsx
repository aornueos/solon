import { useCallback } from "react";
import { useAppStore } from "../../store/useAppStore";
import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Outline } from "../Outline/Outline";
import { Inspector } from "../Inspector/Inspector";
import { CanvasView } from "../Canvas/CanvasView";
import { HomePage } from "../HomePage/HomePage";
import { Titlebar } from "./Titlebar";
import { StatusBar } from "./StatusBar";
import { ToastLayer } from "./ToastLayer";
import { DialogLayer } from "./DialogLayer";
import { UpdateNotesDialog } from "./UpdateNotesDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ContextMenuLayer } from "./ContextMenuLayer";
import { ContextMenuProvider } from "./ContextMenuProvider";
import { startDrag } from "../../lib/drag";

export function AppLayout() {
  // Seletores granulares evitam re-render do AppLayout a cada keystroke
  // (o fileBody e headings também vivem nessa store e mudam constantemente).
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const isOutlineOpen = useAppStore((s) => s.isOutlineOpen);
  const isInspectorOpen = useAppStore((s) => s.isInspectorOpen);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const outlineWidth = useAppStore((s) => s.outlineWidth);
  const focusMode = useAppStore((s) => s.focusMode);
  const activeView = useAppStore((s) => s.activeView);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const setOutlineWidth = useAppStore((s) => s.setOutlineWidth);

  const inCanvas = activeView === "canvas";
  const inHome = activeView === "home";
  const showSidebar = isSidebarOpen && !focusMode && !inHome;
  // No canvas/home: painel direito não faz sentido (Inspector/Outline são do editor).
  // Home tambem fica sem chrome — landing limpa, so o conteudo central.
  const showInspector = isInspectorOpen && !focusMode && !inCanvas && !inHome;
  const showOutline = isOutlineOpen && !focusMode && !inCanvas && !inHome;
  const showRightPanel = showInspector || showOutline;

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
      <Titlebar />

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
          className="flex-1 min-w-0 overflow-hidden"
          style={{ background: "var(--bg-app)" }}
        >
          {inHome ? <HomePage /> : inCanvas ? <CanvasView /> : <Editor />}
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

      <StatusBar />
      <ToastLayer />
      <DialogLayer />
      <UpdateNotesDialog />
      <SettingsDialog />
      <ContextMenuLayer />
      <ContextMenuProvider />
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
