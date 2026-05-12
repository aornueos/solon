import { forwardRef, useEffect, useRef } from "react";
import { Columns2, ExternalLink, PanelRight, X } from "lucide-react";
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
  useEffect(() => {
    const el = activeTabRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath]);

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
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          TAB_DND_MIME,
          JSON.stringify({ path, name: fullName }),
        );
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DND_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        const tab = readDraggedTab(e.dataTransfer);
        if (!tab || tab.path === path) return;
        e.preventDefault();
        e.stopPropagation();
        onReorder(tab.path);
      }}
      onDragEnd={(e) => {
        const outside =
          e.clientX < 0 ||
          e.clientY < 0 ||
          e.clientX > window.innerWidth ||
          e.clientY > window.innerHeight;
        if (outside) onDetach();
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
        "select-none transition-colors",
        isActive && "solon-tab--active",
      )}
      style={{
        // Padding lateral assimetrico — mais a' direita pra dar respiro
        // pro botao ✕. minWidth garante que aba "x" curta nao some.
        padding: "6px 8px 6px 12px",
        minWidth: 96,
        maxWidth: 220,
        fontSize: "0.78rem",
        // Aba ativa "destaca" do bg-panel-2 da TabBar com a cor do conteudo
        // (bg-app), criando a sensacao classica de "esta aba e' o documento
        // visivel atras". Inativas ficam no fundo.
        background: isActive ? "var(--bg-app)" : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
        // Borda direita serve de separador entre abas (fica entre cada par).
        // A ativa tem borda-top accent pra reforcar o estado.
        borderRight: "1px solid var(--border-subtle)",
        borderTop: isActive
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        // Borda inferior some na ativa pra emendar com o editor; outras
        // herdam o border da TabBar via marginBottom -1.
        borderBottom: isActive
          ? "1px solid var(--bg-app)"
          : "1px solid transparent",
        marginBottom: "-1px",
      }}
      title={fullName}
    >
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
