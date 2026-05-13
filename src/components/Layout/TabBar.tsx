import { forwardRef, useEffect, useRef, useState } from "react";
import { Columns2, ExternalLink, GripVertical, PanelRight, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { flushEditor } from "../../lib/editorRef";
import { readDraggedTab, TAB_DND_MIME } from "../../lib/tabs";
import { openTabInNewWindow } from "../../lib/windows";
import clsx from "clsx";

/**
 * Barra de abas dos arquivos abertos. Aparece entre Titlebar e o conteudo
 * (editor/canvas) sempre que ha 1+ aba aberta — ate' com 1 so aba ja'
 * mostra (consistencia + feedback visual de qual arquivo esta ativo).
 *
 * Comportamento:
 *  - Click esquerdo: ativa a aba (chama openFile do path).
 *  - Middle-click (button=1) na aba: fecha. Convencao de browser.
 *  - Click no ✕: fecha. Se era a ativa, ativa a vizinha automaticamente.
 *  - Indicador `●` antes do ✕ quando ha edits nao salvos no arquivo
 *    ATIVO (saveStatus dirty/saving). Abas inativas nao tem buffer em
 *    memoria, entao sao sempre "limpas" do ponto de vista da UI.
 *  - Scroll horizontal automatico quando ha mais abas que largura. Ao
 *    ativar uma aba off-screen, scrolla pra ela ficar visivel.
 *
 * O auto-save flusha o buffer da aba anterior em troca de arquivo (via
 * subscribe em useAutoSave + flushEditor() em openFile), entao trocar de
 * aba e' seguro mesmo com edits pendentes.
 */
export function TabBar() {
  const tabs = useAppStore((s) => s.openTabs);
  const activePath = useAppStore((s) => s.activeFilePath);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const closeTab = useAppStore((s) => s.closeTab);
  const reorderTab = useAppStore((s) => s.reorderTab);
  const setSplitPane = useAppStore((s) => s.setSplitPane);
  const openContextMenu = useAppStore((s) => s.openContextMenu);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFile } = useFileSystem();

  // Scroll automatico pra aba ativa quando ela esta off-screen — comum em
  // Ctrl+Tab que cicla pra abas fora da viewport horizontal.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  useEffect(() => {
    const el = activeTabRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath]);

  // Wheel vertical (sem shift) é convertido em horizontal scroll —
  // convencao de browsers/IDEs com tabbar. Sem isso, user precisa
  // segurar Shift ou clicar e arrastar a scrollbar minuscula pra
  // chegar em abas off-screen. `passive: false` pra poder preventDefault
  // o scroll vertical default; sem isso o webview rola a pagina toda.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // So' age se a tabbar de fato overflow-a horizontalmente (scrollLeft
      // funcional) e o user nao esta usando shift (que ja' significa horiz).
      if (e.shiftKey) return;
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (tabs.length === 0) return null;

  const onActivate = (path: string, name: string) => {
    if (path === activePath) return;
    void openFile(path, name);
    // Se o user clicou numa aba enquanto estava no canvas/home, a
    // expectativa e' "abrir o arquivo" — e arquivo eh editor.
    const view = useAppStore.getState().activeView;
    if (view === "home") setActiveView("editor");
  };

  const onClose = (path: string) => {
    const next = closeTab(path);
    if (path === activePath) {
      if (next) {
        const tab = useAppStore.getState().openTabs.find((t) => t.path === next);
        if (tab) void openFile(tab.path, tab.name);
      } else {
        // Sem aba pra ativar — flush antes de zerar pra preservar a
        // ultima janela de digitacao via useAutoSave subscribe.
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
  };

  const detachToNewWindow = async (path: string, name: string) => {
    try {
      await openTabInNewWindow({ path, name });
      onClose(path);
    } catch (err) {
      useAppStore
        .getState()
        .pushToast("error", `Não foi possível abrir nova janela: ${String(err)}`);
    }
  };

  const onTabContextMenu = (e: React.MouseEvent, path: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Abrir em nova janela",
        icon: <ExternalLink size={13} />,
        onClick: () => void detachToNewWindow(path, name),
      },
      {
        label: "Abrir como referência à direita",
        icon: <Columns2 size={13} />,
        onClick: () => setSplitPane({ kind: "reference", path, name }),
      },
      {
        label: "Canvas no painel direito",
        icon: <PanelRight size={13} />,
        onClick: () => setSplitPane({ kind: "canvas" }),
      },
      { kind: "separator" },
      {
        label: "Fechar aba",
        shortcut: "Ctrl+W",
        onClick: () => onClose(path),
      },
    ]);
  };

  return (
    <div
      ref={containerRef}
      className="flex items-stretch overflow-x-auto overflow-y-hidden flex-shrink-0"
      style={{
        background: "var(--bg-panel-2)",
        borderBottom: "1px solid var(--border-subtle)",
        // Altura fixa ajuda a previne layout shift quando a TabBar nasce/
        // morre (fixa = 32px = padding 6px × 2 + content ~20px).
        minHeight: 32,
        scrollbarWidth: "thin",
        padding: "3px 6px 0",
        gap: 4,
      }}
      role="tablist"
      aria-label="Arquivos abertos"
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        const isDirty =
          isActive && (saveStatus === "dirty" || saveStatus === "saving");
        return (
          <Tab
            key={tab.path}
            ref={isActive ? activeTabRef : undefined}
            displayName={stripExtension(tab.name)}
            fullName={tab.name}
            isActive={isActive}
            isDirty={isDirty}
            path={tab.path}
            onActivate={() => onActivate(tab.path, tab.name)}
            onClose={() => onClose(tab.path)}
            onReorder={(sourcePath) => reorderTab(sourcePath, tab.path)}
            onDetach={() => void detachToNewWindow(tab.path, tab.name)}
            onContextMenu={(e) => onTabContextMenu(e, tab.path, tab.name)}
            dragging={draggingPath === tab.path}
            dropTarget={dropTargetPath === tab.path && draggingPath !== tab.path}
            onDragStartPath={() => setDraggingPath(tab.path)}
            onDragTarget={() => setDropTargetPath(tab.path)}
            onDragDone={() => {
              setDraggingPath(null);
              setDropTargetPath(null);
            }}
          />
        );
      })}
    </div>
  );
}

interface TabProps {
  path: string;
  displayName: string;
  fullName: string;
  isActive: boolean;
  isDirty: boolean;
  onActivate: () => void;
  onClose: () => void;
  onReorder: (targetPath: string) => void;
  onDetach: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragging: boolean;
  dropTarget: boolean;
  onDragStartPath: () => void;
  onDragTarget: () => void;
  onDragDone: () => void;
}

const Tab = forwardRef<HTMLDivElement, TabProps>(function Tab(
  {
  path,
  displayName,
  fullName,
  isActive,
  isDirty,
  onActivate,
  onClose,
  onReorder,
  onDetach,
  onContextMenu,
  dragging,
  dropTarget,
  onDragStartPath,
  onDragTarget,
  onDragDone,
},
  ref,
) {
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={isActive}
      draggable
      onDragStart={(e) => {
        onDragStartPath();
        e.dataTransfer.effectAllowed = "move";
        const payload = JSON.stringify({ path, name: fullName });
        e.dataTransfer.setData(TAB_DND_MIME, payload);
        // Fallback `text/plain` — alguns webviews (incluindo o Tauri
        // em certas builds) tem restricoes no MIME type custom durante
        // dragover; ter o text/plain garante que `types.includes` pelo
        // menos detecta um. O readDraggedTab tenta primeiro o MIME
        // custom e depois fallback pro plain.
        try {
          e.dataTransfer.setData("text/plain", payload);
        } catch {
          /* alguns ambientes nao permitem setData duplicado */
        }
      }}
      onDragOver={(e) => {
        // Aceita drag se tem o nosso MIME OU se ha text/plain (fallback
        // do Tauri webview). preventDefault EH OBRIGATORIO pra que onDrop
        // dispare — esquecer disso bloqueia silenciosamente o drag.
        const types = e.dataTransfer.types;
        if (!types.includes(TAB_DND_MIME) && !types.includes("text/plain")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        onDragTarget();
      }}
      onDrop={(e) => {
        const tab = readDraggedTab(e.dataTransfer);
        if (!tab || tab.path === path) {
          onDragDone();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onReorder(tab.path);
        onDragDone();
      }}
      onDragEnd={(e) => {
        // Detach só se o drag terminou GENUINAMENTE fora da janela —
        // dropEffect = "none" quando o drop foi cancelado ou em lugar
        // invalido; "move" quando o reorder aconteceu (entao nao
        // detach). Coordenadas (0,0) ou negativas as vezes aparecem em
        // cancelamentos no Tauri webview e disparariam detach falso.
        const droppedSomewhere = e.dataTransfer.dropEffect === "move";
        const outsideWindow =
          e.clientX > 0 &&
          e.clientY > 0 &&
          (e.clientX > window.innerWidth || e.clientY > window.innerHeight);
        if (!droppedSomewhere && outsideWindow) {
          onDetach();
        }
        onDragDone();
      }}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        // Middle-click (button=1) fecha a aba. Tratamos no mouseDown pra
        // capturar antes do click — onAuxClick teoricamente pega isso mas
        // depende do browser/Tauri webview emitir click pro middle button.
        // mouseDown em button=1 eh universal.
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => {
        // Botao ✕ tem stopPropagation proprio, entao chegar aqui e' click
        // no rotulo da aba.
        if (e.button !== 0) return;
        onActivate();
      }}
      className={clsx(
        "solon-tab group relative flex items-center gap-1.5 cursor-pointer flex-shrink-0",
        "select-none transition-all",
        isActive && "solon-tab--active",
        dragging && "opacity-55",
      )}
      style={{
        // Padding lateral assimetrico — mais a' direita pra dar respiro
        // pro botao ✕. minWidth garante que aba "x" curta nao some.
        padding: "5px 7px",
        minWidth: 96,
        maxWidth: 220,
        fontSize: "0.78rem",
        // Aba ativa "destaca" do bg-panel-2 da TabBar com a cor do conteudo
        // (bg-app), criando a sensacao classica de "esta aba e' o documento
        // visivel atras". Inativas ficam no fundo.
        background: isActive ? "var(--bg-app)" : "color-mix(in srgb, var(--bg-panel) 45%, transparent)",
        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
        // Borda direita serve de separador entre abas (fica entre cada par).
        // A ativa tem borda-top accent pra reforcar o estado.
        border: `1px solid ${dropTarget ? "var(--accent)" : "var(--border-subtle)"}`,
        borderTop: isActive ? "2px solid var(--accent)" : "1px solid var(--border-subtle)",
        borderBottom: isActive
          ? "1px solid var(--bg-app)"
          : `1px solid ${dropTarget ? "var(--accent)" : "var(--border-subtle)"}`,
        borderRadius: "7px 7px 0 0",
        marginBottom: "-1px",
        boxShadow: isActive ? "var(--shadow-sm)" : undefined,
      }}
      title={fullName}
    >
      <GripVertical
        size={12}
        className="flex-shrink-0 opacity-45"
        aria-hidden
        style={{ cursor: "grab" }}
      />
      <span
        className="truncate flex-1"
        style={{
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {displayName}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          // stopPropagation aqui evita que o mouseDown do tab pai dispare
          // (que poderia interpretar middle-click como close, mas tambem
          // dispara onActivate via click subsequente — ai entrava em race
          // com o close). Encerramos aqui mesmo.
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={clsx(
          "solon-tab__close flex-shrink-0 rounded transition-all flex items-center justify-center",
          // Visivel na ativa, oculto nas outras ate o hover. Dirty deixa
          // o ● sempre visivel pra feedback de pendencia.
          isActive || isDirty
            ? "opacity-70"
            : "opacity-0 group-hover:opacity-70",
        )}
        style={{
          width: 16,
          height: 16,
          color: "var(--text-muted)",
        }}
        aria-label={`Fechar ${fullName}`}
        title="Fechar (Ctrl+W) · click do meio também fecha"
      >
        {isDirty ? (
          <span
            aria-hidden
            style={{
              display: "block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent-2, var(--text-secondary))",
            }}
          />
        ) : (
          <X size={12} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
});

/**
 * Strip da extensao .md/.txt do nome de exibicao da aba — fica mais
 * limpo. Nome real (com extensao) continua no `title` pra usuario que
 * precisa identificar o arquivo de fato.
 */
function stripExtension(name: string): string {
  return name.replace(/\.(md|txt)$/i, "");
}
