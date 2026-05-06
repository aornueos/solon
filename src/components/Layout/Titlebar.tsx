import { useEffect, useState } from "react";
import {
  PanelLeft,
  Focus,
  Info,
  ListTree,
  FileText,
  LayoutGrid,
  Moon,
  Sun,
  Minus,
  Square,
  Copy,
  X,
  Settings as SettingsIcon,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../store/useAppStore";
import { SCENE_STATUSES } from "../../types/scene";
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
  const available = isTauri();

  useEffect(() => {
    if (!available) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    (async () => {
      try {
        const win = getCurrentWindow();
        const initial = await win.isMaximized();
        if (alive) setIsMaximized(initial);
        unlisten = await win.onResized(async () => {
          const m = await win.isMaximized();
          if (alive) setIsMaximized(m);
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

  return { available, isMaximized, minimize, toggleMaximize, close };
}

export function Titlebar() {
  const {
    activeFileName,
    sceneMeta,
    isSidebarOpen,
    isOutlineOpen,
    isInspectorOpen,
    focusMode,
    activeView,
    setActiveView,
    toggleSidebar,
    toggleOutline,
    toggleInspector,
    toggleFocusMode,
    theme,
    toggleTheme,
    openSettings,
  } = useAppStore();

  const status = SCENE_STATUSES.find((s) => s.value === sceneMeta.status);
  const { available, isMaximized, minimize, toggleMaximize, close } =
    useWindowControls();

  return (
    <div
      className="flex items-center h-9 select-none"
      style={{
        background: "var(--bg-panel-2)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
      data-tauri-drag-region
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
          }}
        >
          Solon
        </button>
        {activeFileName && (
          <>
            <span style={{ color: "var(--border)" }}>/</span>
            {/* Clicavel: leva pro editor com o arquivo aberto. Util
                quando o user esta no canvas/home e quer voltar pro
                texto sem ter que achar o item no sidebar. */}
            <button
              onClick={() => setActiveView("editor")}
              onMouseDown={(e) => e.stopPropagation()}
              title="Ir para o editor"
              aria-label="Ir para o editor"
              className="text-[0.78rem] truncate max-w-[240px] transition-opacity hover:opacity-70"
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
                opacity: activeView === "editor" ? 1 : 0.85,
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

      {/* Toggle de visão (Editor ↔ Canvas) */}
      <div
        className="flex items-center gap-0 rounded-md p-0.5 mr-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <ViewTab
          onClick={() => setActiveView("editor")}
          active={activeView === "editor"}
          title="Editor (Ctrl+1)"
        >
          <FileText size={12} />
          <span className="text-[0.7rem]">Editor</span>
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
        <IconBtn
          onClick={toggleInspector}
          active={isInspectorOpen}
          title="Inspector - Cena (Ctrl+Alt+I)"
        >
          <Info size={14} />
        </IconBtn>
        <IconBtn
          onClick={toggleOutline}
          active={isOutlineOpen}
          title="Índice (Ctrl+J)"
        >
          <ListTree size={14} />
        </IconBtn>
        <div
          className="w-px h-3.5 mx-1"
          style={{ background: "var(--border-subtle)" }}
        />
        <IconBtn
          onClick={toggleTheme}
          title={
            theme === "dark"
              ? "Mudar para tema claro (Ctrl+Shift+L)"
              : "Mudar para tema escuro (Ctrl+Shift+L)"
          }
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </IconBtn>
        <IconBtn onClick={toggleFocusMode} active={focusMode} title="Modo Foco (F11)">
          <Focus size={14} />
        </IconBtn>
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
            }
          : { color: "var(--text-muted)", background: "transparent" }
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
