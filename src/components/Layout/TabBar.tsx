import { forwardRef, useEffect, useRef, useState } from "react";
import { Columns2, ExternalLink, GripVertical, PanelRight, X } from "lucide-react";
import { useAppStore, type OpenTab } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { flushEditor } from "../../lib/editorRef";
import { startDrag } from "../../lib/drag";
import { resolveTabDrop, TAB_SPLIT_HINT_EVENT, type TabDropTarget } from "../../lib/tabDrop";
import { openTabInNewWindow } from "../../lib/windows";
import clsx from "clsx";

/**
 * Barra de abas dos arquivos abertos. Aparece entre Titlebar e o conteudo
 * (editor/canvas) sempre que ha 1+ aba aberta — até com 1 so aba já
 * mostra (consistencia + feedback visual de qual arquivo esta ativo).
 *
 * Comportamento:
 *  - Click esquerdo: ativa a aba (chama openFile do path).
 *  - Middle-click (button=1) na aba: fecha. Convencao de browser.
 *  - Click no ✕: fecha. Se era a ativa, ativa a vizinha automaticamente.
 *  - Indicador `●` antes do ✕ quando ha edits não salvos no arquivo
 *    ATIVO (saveStatus dirty/saving). Abas inativas não tem buffer em
 *    memória, então são sempre "limpas" do ponto de vista da UI.
 *  - Scroll horizontal automático quando ha mais abas que largura. Ao
 *    ativar uma aba off-screen, scrolla pra ela ficar visível.
 *
 * O auto-save flusha o buffer da aba anterior em troca de arquivo (via
 * subscribe em useAutoSave + flushEditor() em openFile), então trocar de
 * aba é seguro mesmo com edits pendentes.
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

  // Scroll automático pra aba ativa quando ela esta off-screen — comum em
  // Ctrl+Tab que cicla pra abas fora da viewport horizontal.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  useEffect(() => {
    const el = activeTabRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath]);

  // Wheel vertical (sem shift) é convertido em horizontal scroll —
  // convencao de browsers/IDEs com tabbar. Sem isso, user precisa
  // segurar Shift ou clicar e arrastar a scrollbar minuscula pra
  // chegar em abas off-screen. `passive: false` pra poder preventDefault
  // o scroll vertical default; sem isso o webview rola a página toda.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // So' age se a tabbar de fato overflow-a horizontalmente (scrollLeft
      // funcional) e o user não esta usando shift (que já significa horiz).
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
    void openFile(path, name, { tab: "preserve" });
    // Se o user clicou numa aba enquanto estava no canvas/home, a
    // expectativa é "abrir o arquivo" — e arquivo eh editor.
    const view = useAppStore.getState().activeView;
    if (view === "home") setActiveView("editor");
  };

  const onClose = (path: string) => {
    const next = closeTab(path);
    if (path === activePath) {
      if (next) {
        const tab = useAppStore.getState().openTabs.find((t) => t.path === next);
        if (tab) void openFile(tab.path, tab.name, { tab: "preserve" });
      } else {
        // Sem aba pra ativar — flush antes de zerar pra preservar a
        // última janela de digitacao via useAutoSave subscribe.
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

  // Arraste por mouse da aba inteira (mousedown → mousemove → mouseup),
  // como no explorador. O drag-and-drop nativo do HTML5 falha no webview do
  // Tauri no Windows, e a aba só se movia pela alça. Na barra, reordena ao
  // vivo; na metade direita da área principal, abre como painel de
  // referência; solta fora da janela, vira uma janela própria.
  const startTabDrag = (e: React.MouseEvent<HTMLElement>, tab: OpenTab) => {
    if (e.button !== 0) return;

    const originX = e.clientX;
    const originY = e.clientY;
    let dragging = false;
    let ghost: HTMLDivElement | null = null;

    const probeAt = (x: number, y: number): TabDropTarget => {
      const elements = document.elementsFromPoint(x, y);
      const tabEl = elements
        .map((el) => (el as HTMLElement).closest?.<HTMLElement>("[data-tab-path]"))
        .find((el): el is HTMLElement => !!el);
      const zoneEl = elements
        .map((el) => (el as HTMLElement).closest?.<HTMLElement>("[data-tab-split-zone]"))
        .find((el): el is HTMLElement => !!el);
      const tabRect = tabEl?.getBoundingClientRect();
      const zoneRect = zoneEl?.getBoundingClientRect();
      return resolveTabDrop({
        x,
        y,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        sourcePath: tab.path,
        tab:
          tabEl && tabRect
            ? { path: tabEl.dataset.tabPath ?? "", left: tabRect.left, width: tabRect.width }
            : null,
        overTabBar: elements.some((el) => containerRef.current?.contains(el)),
        splitZone: zoneRect ? { left: zoneRect.left, width: zoneRect.width } : null,
      });
    };

    const showSplitHint = (active: boolean) => {
      window.dispatchEvent(new CustomEvent(TAB_SPLIT_HINT_EVENT, { detail: { active } }));
    };

    const finish = () => {
      document.documentElement.classList.remove("solon-dragging");
      ghost?.remove();
      ghost = null;
      showSplitHint(false);
      setDraggingPath(null);
      setDropTargetPath(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    startDrag({
      onMove: (ev) => {
        if (!dragging && Math.hypot(ev.clientX - originX, ev.clientY - originY) < 5) return;
        if (!dragging) {
          dragging = true;
          suppressClickRef.current = true;
          setDraggingPath(tab.path);
          document.documentElement.classList.add("solon-dragging");
        }
        ev.preventDefault();

        const container = containerRef.current;
        const barRect = container?.getBoundingClientRect();
        const inBar =
          !!barRect &&
          ev.clientY >= barRect.top &&
          ev.clientY <= barRect.bottom &&
          ev.clientX >= barRect.left &&
          ev.clientX <= barRect.right;
        if (container && barRect && inBar) {
          if (ev.clientX < barRect.left + 28) container.scrollLeft -= 14;
          if (ev.clientX > barRect.right - 28) container.scrollLeft += 14;
        }

        // Na barra a própria aba anda sob o cursor; fora dela, uma
        // etiqueta com o nome acompanha o arraste.
        if (!inBar && !ghost) {
          ghost = document.createElement("div");
          ghost.className = "solon-drag-ghost";
          ghost.textContent = stripExtension(tab.name);
          document.body.appendChild(ghost);
        } else if (inBar && ghost) {
          ghost.remove();
          ghost = null;
        }
        if (ghost) {
          ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
        }

        const target = probeAt(ev.clientX, ev.clientY);
        showSplitHint(target?.kind === "split");
        if (target?.kind === "reorder") {
          setDropTargetPath(target.path);
          reorderTab(tab.path, target.path, target.placement);
        } else {
          setDropTargetPath(null);
        }
      },
      onEnd: (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const target = probeAt(ev.clientX, ev.clientY);
        finish();
        if (target?.kind === "split") {
          setSplitPane({ kind: "reference", path: tab.path, name: tab.name });
        } else if (target?.kind === "detach") {
          void detachToNewWindow(tab.path, tab.name);
        }
      },
      onCancel: () => {
        if (dragging) finish();
      },
    });
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
        // morre (fixa = 34px = padding 6px × 2 + content ~22px).
        minHeight: 34,
        scrollbarWidth: "thin",
        padding: "4px 8px 0",
        gap: 2,
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
            onActivate={() => {
              // O mouseup de um arraste que termina na própria aba vira
              // clique; não é para ativar.
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onActivate(tab.path, tab.name);
            }}
            onClose={() => onClose(tab.path)}
            onContextMenu={(e) => onTabContextMenu(e, tab.path, tab.name)}
            dragging={draggingPath === tab.path}
            dropTarget={dropTargetPath === tab.path && draggingPath !== tab.path}
            onDragStart={(e) => startTabDrag(e, tab)}
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
  onContextMenu: (e: React.MouseEvent) => void;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (e: React.MouseEvent<HTMLElement>) => void;
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
  onContextMenu,
  dragging,
  dropTarget,
  onDragStart,
},
  ref,
) {
  return (
    <div
      ref={ref}
      data-tab-path={path}
      role="tab"
      aria-selected={isActive}
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
          return;
        }
        onDragStart(e);
      }}
      onClick={(e) => {
        // Botao ✕ tem stopPropagation próprio, então chegar aqui é click
        // no rótulo da aba.
        if (e.button !== 0) return;
        onActivate();
      }}
      className={clsx(
        "solon-tab group relative flex items-center gap-1.5 cursor-pointer flex-shrink-0",
        "select-none transition-[background-color,color,opacity]",
        isActive && "solon-tab--active",
        dragging && "opacity-55",
      )}
      style={{
        // Padding lateral assimetrico — mais a' direita pra dar respiro
        // pro botao ✕. minWidth garante que aba "x" curta não some.
        padding: "5px 9px",
        minWidth: 110,
        maxWidth: 240,
        fontSize: "0.82rem",
        fontFamily: "var(--font-ui)",
        // Aba ativa "lifta" com o fundo da página (bg-app) e cantos
        // arredondados no topo — sem molduras. Inativas: transparentes,
        // texto muted. drop-target só tonifica suavemente.
        background: isActive
          ? "var(--bg-app)"
          : dropTarget
          ? "var(--accent-soft)"
          : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
        // Marcador accent fino só na ativa (2px arredondado embaixo, como
        // um sublinhado de seleção calmo). marginBottom -1 cola na folha.
        boxShadow: isActive ? "inset 0 -2px 0 0 var(--accent)" : undefined,
        marginBottom: "-1px",
        borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
      }}
      title={fullName}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 rounded-sm opacity-50 transition-opacity group-hover:opacity-85"
        style={{
          width: 14,
          height: 18,
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          cursor: "grab",
        }}
        aria-label={`Mover aba ${fullName}`}
        title="Arrastar para reorganizar"
      >
        <GripVertical size={12} aria-hidden style={{ pointerEvents: "none" }} />
      </button>
      <span
        className="truncate flex-1"
        style={{
          // Sem bold: ativa e inativa em weight normal. A distincao vem
          // do estilo (ativa reta, inativa italica) + cor/fundo/underline
          // accent — não mais do peso da fonte.
          fontWeight: 400,
          fontStyle: isActive ? "normal" : "italic",
          letterSpacing: isActive ? "0.01em" : 0,
        }}
      >
        {displayName}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          // stopPropagation aqui evita que o mouseDown do tab pai dispare
          // (que poderia interpretar middle-click como close, mas também
          // dispara onActivate via click subsequente — ai entrava em race
          // com o close). Encerramos aqui mesmo.
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={clsx(
          "solon-tab__close flex-shrink-0 rounded transition-[opacity,background-color,color] flex items-center justify-center",
          // Visivel na ativa, oculto nas outras ate o hover. Dirty deixa
          // o ● sempre visível pra feedback de pendencia.
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
 * limpo. Nome real (com extensao) continua no `title` pra usuário que
 * precisa identificar o arquivo de fato.
 */
function stripExtension(name: string): string {
  return name.replace(/\.(md|txt)$/i, "");
}
