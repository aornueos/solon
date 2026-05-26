import { useEffect, useRef, useState } from "react";
import {
  PanelLeft,
  Focus,
  Info,
  ListTree,
  FileText,
  LayoutGrid,
  Minus,
  Square,
  Copy,
  X,
  Settings as SettingsIcon,
  Maximize2,
  Minimize2,
  Search,
  FileDown,
  BookOpen,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EDITOR_PAPERS, useAppStore, type EditorPaper } from "../../store/useAppStore";
import { SCENE_STATUSES } from "../../types/scene";
import { toggleAppFullscreen } from "../../lib/windows";
import clsx from "clsx";

/**
 * Detecta se estamos rodando dentro do Tauri (que injeta
 * `window.__TAURI_INTERNALS__` no preload). No vite dev em browser puro
 * essa global nao existe, e chamar `getCurrentWindow()` explode com
 * "Cannot read properties of undefined (reading 'metadata')". Guardamos
 * antes pra que dev em browser funcione e o build de producao (sempre
 * Tauri) tenha os controles.
 */
const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ !== undefined;

/**
 * Tauri 2 com `decorations: false` esconde a barra nativa do SO. Esse
 * util encapsula o handle do `Window` e expõe os 3 controles classicos
 * (min/max/close) com tracking do estado maximized — necessario pra
 * trocar o icone (Square ↔ Copy de "restore" ao maximizar).
 *
 * `available` indica se podemos chamar a API; em dev/browser puro retorna
 * false e os botoes sao escondidos pelo caller.
 */
function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const available = isTauri();

  useEffect(() => {
    if (!available) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    (async () => {
      try {
        const win = getCurrentWindow();
        const initial = await win.isMaximized();
        const fullscreen = await win.isFullscreen();
        if (alive) setIsMaximized(initial);
        if (alive) {
          setIsFullscreen(fullscreen);
          document.documentElement.toggleAttribute(
            "data-solon-fullscreen",
            fullscreen,
          );
        }
        unlisten = await win.onResized(async () => {
          const m = await win.isMaximized();
          const f = await win.isFullscreen();
          if (alive) setIsMaximized(m);
          if (alive) {
            setIsFullscreen(f);
            document.documentElement.toggleAttribute(
              "data-solon-fullscreen",
              f,
            );
          }
        });
      } catch {
        // Defensivo — se a chamada falhar mesmo com __TAURI_INTERNALS__
        // presente (versao incompativel, etc) silencia o erro pra nao
        // crashar a UI inteira.
      }
    })();
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [available]);

  // Erros aqui significam permissao faltando no capabilities/default.json
  // (core:window:allow-minimize, allow-toggle-maximize, allow-close).
  // Logamos pra que o problema seja visivel ao inves de silencioso.
  const minimize = () => {
    if (!available) return;
    getCurrentWindow().minimize().catch((e) => console.error("minimize:", e));
  };
  const toggleMaximize = () => {
    if (!available) return;
    getCurrentWindow()
      .toggleMaximize()
      .catch((e) => console.error("toggleMaximize:", e));
  };
  const close = () => {
    if (!available) return;
    getCurrentWindow().close().catch((e) => console.error("close:", e));
  };
  const toggleFullscreen = () => {
    if (!available) return;
    toggleAppFullscreen()
      .then((next) => {
        if (typeof next === "boolean") setIsFullscreen(next);
      })
      .catch((e) => console.error("setFullscreen:", e));
  };

  return { available, isMaximized, isFullscreen, minimize, toggleMaximize, toggleFullscreen, close };
}

/**
 * Dropdown custom de tema. <select> nativo só aceita `color-scheme`
 * (light/dark) para o popup do SO — não dá pra forçar a paleta exata
 * do tema atual. No Noir o popup nativo saía cinza-OS, destoando do
 * preto puro do app. Este popover usa as CSS vars como o resto da UI:
 * o popup vira `--bg-panel` com border `--border` e shadow temática,
 * item ativo ganha o `--accent` do tema corrente. Coerência total.
 */
function ThemePicker({
  value,
  onChange,
}: {
  value: EditorPaper;
  onChange: (v: EditorPaper) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = EDITOR_PAPERS.find((paper) => paper.value === value);

  // Click fora fecha o popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Esc fecha — capture pra não competir com handlers do editor.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      // titlebar é zona de drag (data-tauri-drag-region) — sem este stop,
      // mousedown no botão viraria drag da janela em vez de abrir.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Tema visual"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Tema visual"
        onClick={() => setOpen((o) => !o)}
        className="h-6 ml-0.5 px-1.5 text-[0.7rem] rounded inline-flex items-center gap-1 transition-colors outline-none"
        style={{
          background: open ? "var(--bg-hover)" : "transparent",
          color: open ? "var(--text-primary)" : "var(--text-secondary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <span>{current?.label ?? "Tema"}</span>
        <ChevronDown size={10} style={{ opacity: 0.65 }} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Temas"
          className="absolute right-0 mt-1 rounded-md overflow-hidden z-[60]"
          style={{
            top: "100%",
            minWidth: 168,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-md)",
            color: "var(--text-primary)",
          }}
        >
          {(["light", "dark"] as const).map((tone, groupIndex) => {
            const items = EDITOR_PAPERS.filter((paper) => paper.tone === tone);
            if (items.length === 0) return null;
            return (
              <div key={tone}>
                {groupIndex > 0 && (
                  <div
                    className="h-px mt-1"
                    style={{ background: "var(--border-subtle)" }}
                  />
                )}
                <div
                  className="px-2.5 pt-1.5 pb-0.5 text-[0.6rem] uppercase tracking-widest font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {tone === "light" ? "Claros" : "Escuros"}
                </div>
                {items.map((paper) => {
                  const active = paper.value === value;
                  return (
                    <button
                      key={paper.value}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onClick={() => {
                        onChange(paper.value);
                        setOpen(false);
                      }}
                      className="block w-full px-2.5 py-1.5 text-left text-[0.72rem] transition-colors"
                      style={{
                        background: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: active ? 600 : 400,
                        borderLeft: active
                          ? "2px solid var(--accent)"
                          : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--bg-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background =
                            "transparent";
                        }
                      }}
                    >
                      {paper.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Titlebar() {
  // Seletores granulares — `useAppStore()` cru re-renderizava a Titlebar
  // (e calculava o lookup de SCENE_STATUSES) a cada keystroke por causa
  // de fileBody/wordCount/etc na mesma store.
  const activeFileName = useAppStore((s) => s.activeFileName);
  const sceneMeta = useAppStore((s) => s.sceneMeta);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const isOutlineOpen = useAppStore((s) => s.isOutlineOpen);
  const isInspectorOpen = useAppStore((s) => s.isInspectorOpen);
  const focusMode = useAppStore((s) => s.focusMode);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const editorPageLayout = useAppStore((s) => s.editorPageLayout);
  const setEditorPageLayout = useAppStore((s) => s.setEditorPageLayout);
  const editorPaper = useAppStore((s) => s.editorPaper);
  const setEditorPaper = useAppStore((s) => s.setEditorPaper);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleOutline = useAppStore((s) => s.toggleOutline);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleReadingMode = useAppStore((s) => s.toggleReadingMode);
  const readingMode = useAppStore((s) => s.readingMode);
  const openSettings = useAppStore((s) => s.openSettings);
  const openGlobalSearch = useAppStore((s) => s.openGlobalSearch);
  const openExport = useAppStore((s) => s.openExport);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const showTitlebarActions = useAppStore((s) => s.showTitlebarActions);

  const status = SCENE_STATUSES.find((s) => s.value === sceneMeta.status);
  const { available, isMaximized, isFullscreen, minimize, toggleMaximize, toggleFullscreen, close } =
    useWindowControls();

  const onTitlebarDoubleClick = (e: React.MouseEvent) => {
    if (!available) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    toggleMaximize();
  };

  const openFluidEditor = () => {
    setEditorPageLayout("fluid");
    setActiveView("editor");
  };

  const openPageEditor = () => {
    setEditorPageLayout("a4-continuous");
    setActiveView("editor");
  };

  return (
    <div
      className="solon-titlebar flex items-center h-9 select-none"
      style={{
        background: "var(--bg-panel-2)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
      data-tauri-drag-region
      onDoubleClick={onTitlebarDoubleClick}
    >
      {/* Logo / Nome — clicavel, leva pra home page. Stop drag pra que o
          clique nao seja interceptado pelo `data-tauri-drag-region` do pai. */}
      <div className="px-4 flex items-center gap-2">
        <button
          onClick={() => setActiveView("home")}
          onMouseDown={(e) => e.stopPropagation()}
          title="Início"
          aria-label="Inicio"
          className="font-serif font-bold text-[0.95rem] transition-opacity hover:opacity-70"
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            opacity: activeView === "home" ? 0.6 : 1,
            cursor: "default",
          }}
        >
          Solon
        </button>
        {activeFileName && (
          <>
            <span style={{ color: "var(--border)" }}>/</span>
            {/* Clicavel: leva para a escrita com o arquivo aberto. Util
                quando o user esta no canvas/home e quer voltar pro
                texto sem ter que achar o item no sidebar. */}
            <button
              onClick={() => setActiveView("editor")}
              onMouseDown={(e) => e.stopPropagation()}
              title="Ir para escrita"
              aria-label="Ir para escrita"
              className="text-[0.78rem] truncate max-w-[240px] transition-opacity hover:opacity-70"
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
                opacity: activeView === "editor" ? 1 : 0.85,
                cursor: "default",
              }}
            >
              {activeFileName.replace(/\.(md|txt)$/, "")}
            </button>
            {status && (
              <span
                className="text-[0.62rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: `${status.color}22`, color: status.color }}
                title={`Status: ${status.label}`}
              >
                {status.label}
              </span>
            )}
            {sceneMeta.pov && (
              <span
                className="text-[0.7rem] italic"
                style={{ color: "var(--text-muted)" }}
              >
                · {sceneMeta.pov}
              </span>
            )}
          </>
        )}
      </div>

      {/* Espaço arrastável */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Toggle de visão (Livre / Página / Canvas) */}
      <div
        className="flex items-center gap-0 rounded-md p-0.5 mr-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <ViewTab
          onClick={openFluidEditor}
          active={activeView === "editor" && editorPageLayout === "fluid"}
          title="Livre (Ctrl+1)"
        >
          <FileText size={12} />
          <span className="text-[0.7rem]">Livre</span>
        </ViewTab>
        <ViewTab
          onClick={openPageEditor}
          active={activeView === "editor" && editorPageLayout === "a4-continuous"}
          title="Página A4 contínua"
        >
          <BookOpen size={12} />
          <span className="text-[0.7rem]">Página</span>
        </ViewTab>
        <ViewTab
          onClick={() => setActiveView("canvas")}
          active={activeView === "canvas"}
          title="Canvas (Ctrl+2)"
        >
          <LayoutGrid size={12} />
          <span className="text-[0.7rem]">Canvas</span>
        </ViewTab>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-0.5 px-2">
        <IconBtn
          onClick={toggleSidebar}
          active={isSidebarOpen}
          title="Explorador (Ctrl+\)"
        >
          <PanelLeft size={14} />
        </IconBtn>
        {showTitlebarActions && (
          <IconBtn
            onClick={toggleInspector}
            active={isInspectorOpen}
            title="Inspector - Cena (Ctrl+Alt+I)"
          >
            <Info size={14} />
          </IconBtn>
        )}
        <IconBtn
          onClick={toggleOutline}
          active={isOutlineOpen}
          title="Índice (Ctrl+J)"
        >
          <ListTree size={14} />
        </IconBtn>
        {showTitlebarActions && (
          <>
            <div
              className="w-px h-3.5 mx-1"
              style={{ background: "var(--border-subtle)" }}
            />
            <IconBtn
              onClick={openGlobalSearch}
              title="Buscar no projeto (Ctrl+Shift+F)"
            >
              <Search size={14} />
            </IconBtn>
            <IconBtn onClick={toggleFocusMode} active={focusMode} title="Modo foco">
              <Focus size={14} />
            </IconBtn>
            <IconBtn
              onClick={toggleReadingMode}
              active={readingMode}
              title="Modo leitura (Ctrl+Shift+R)"
            >
              <BookOpen size={14} />
            </IconBtn>
            <IconBtn onClick={() => openExport()} title="Exportar (Ctrl+Shift+E)">
              <FileDown size={14} />
            </IconBtn>
            <IconBtn onClick={openShortcuts} title="Atalhos (Ctrl+/)">
              <HelpCircle size={14} />
            </IconBtn>
            {available && (
              <IconBtn
                onClick={toggleFullscreen}
                active={isFullscreen}
                title={isFullscreen ? "Sair da tela cheia (F11)" : "Tela cheia (F11)"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </IconBtn>
            )}
          </>
        )}
        {/* Theme picker fica FORA do gate showTitlebarActions: trocar tema
            é ação essencial mesmo com a fileira de ações extras escondida.
            Antes ficava dentro do bloco e sumia junto, o que mascarava o
            seletor pra quem reduziu o chrome. */}
        <ThemePicker value={editorPaper} onChange={setEditorPaper} />
        <IconBtn onClick={openSettings} title="Preferências (Ctrl+,)">
          <SettingsIcon size={14} />
        </IconBtn>
      </div>

      {/* Controles de janela (Tauri custom titlebar — `decorations: false`).
          Sem essa barra o usuario nao tinha como minimizar/maximizar/fechar
          pelo proprio app, so via teclado/SO. Convencao Windows: min, max,
          close — nessa ordem, encostado na borda direita.
          Renderizamos so quando `available` (estamos dentro do Tauri); em
          vite dev/browser puro escondemos pra nao crashar e pra nao expor
          botoes que nao fariam nada. */}
      {available && (
        <div className="flex items-stretch h-full">
          <WindowBtn onClick={minimize} title="Minimizar">
            <Minus size={14} />
          </WindowBtn>
          <WindowBtn
            onClick={toggleMaximize}
            title={isMaximized ? "Restaurar" : "Maximizar"}
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </WindowBtn>
          <WindowBtn onClick={close} title="Fechar" danger>
            <X size={14} />
          </WindowBtn>
        </div>
      )}
    </div>
  );
}

/**
 * Botao de window-control (min/max/close). Diferente do `IconBtn` porque:
 * - ocupa altura total da titlebar (sensa~o de "cantinho do SO");
 * - e mais largo (46px) pra bater na area de clique padrao do Windows;
 * - close em hover vira vermelho (convencao universal).
 */
function WindowBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = hovered
    ? danger
      ? "var(--danger)"
      : "var(--bg-hover)"
    : "transparent";
  const fg = hovered
    ? danger
      ? "var(--text-inverse)"
      : "var(--text-secondary)"
    : "var(--text-placeholder)";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 46,
        background: bg,
        color: fg,
        cursor: "default",
      }}
    >
      {children}
    </button>
  );
}

function ViewTab({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx(
        "flex items-center gap-1 px-2 py-1 rounded transition-colors",
      )}
      style={
        active
          ? {
              background: "var(--bg-panel)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-sm)",
              cursor: "default",
            }
          : {
              color: "var(--text-muted)",
              background: "transparent",
              cursor: "default",
            }
      }
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="p-1.5 rounded transition-colors"
      style={{
        color: active ? "var(--text-secondary)" : "var(--text-placeholder)",
        background: active ? "var(--bg-hover)" : "transparent",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.color = "var(--text-placeholder)";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
