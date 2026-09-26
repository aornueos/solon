import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  File,
  ChevronRight,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Clipboard,
  Tag as TagIcon,
  X as XIcon,
  Search,
} from "lucide-react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { startDrag } from "../../lib/drag";
import {
  normalizeTreePath,
  resolveSidebarDrop,
  type SidebarDropTarget,
} from "../../lib/sidebarDrop";
import {
  SIDEBAR_SCENE_DROP_EVENT,
  type SidebarSceneDropDetail,
} from "../../types/canvas";
import { TagFilterPopover } from "./TagFilterPopover";
import clsx from "clsx";

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null; // null → raiz
}

export function Sidebar() {
  // Seletores granulares: assinar `useAppStore()` cru fazia o Sidebar
  // re-renderizar TODA arvore de arquivos a cada keystroke (porque o store
  // tem fileBody/headings/saveStatus/wordCount mudando constantemente).
  // Em projetos com muitas pastas/arquivos isso é o ofensor #1 de lag.
  const fileTree = useAppStore((s) => s.fileTree);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const openPrompt = useAppStore((s) => s.openPrompt);
  const openConfirm = useAppStore((s) => s.openConfirm);
  const activeTagFilter = useAppStore((s) => s.activeTagFilter);
  const setActiveTagFilter = useAppStore((s) => s.setActiveTagFilter);
  const tagIndex = useAppStore((s) => s.tagIndex);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement | null>(null);
  const { openFolder, openFileFromDisk, openFile, refresh, createFile, createFolder, renameNode, deleteNode, reorderItem, moveItem, duplicateFile } =
    useFileSystem();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  /**
   * Estado do drag-and-drop. Dois modos:
   *  - REORDER: dragOverPath aponta pro sibling sob o cursor (linha
   *    azul no topo do alvo). Mesmo parent que o dragged.
   *  - MOVE: dragOverFolder aponta pra pasta de destino (highlight da
   *    pasta inteira, ou da árvore toda quando o destino é a raiz).
   *    Solta = fs.rename pra dentro dela.
   */
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const rootIsDropTarget =
    !!rootFolder &&
    dragOverFolder !== null &&
    normalizeTreePath(dragOverFolder) === normalizeTreePath(rootFolder);

  const beginSidebarDrag = (path: string) => {
    setDragPath(path);
  };

  const clearSidebarDrag = () => {
    setDragPath(null);
    setDragOverPath(null);
    setDragOverFolder(null);
  };

  // Fecha menu ao clicar fora ou pressionar Esc
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const handleNewFile = async (parentDir: string) => {
    // NAO pre-fill com "Nova nota" porque isso gera arquivos chamados
    // "Nova nota" "Nova nota 2" etc se o user só clicar Enter por habito.
    // Placeholder vazio + dica visual é mais limpo.
    const name = await openPrompt({
      title: "Nova nota",
      message: "Informe o nome da nova nota.",
      placeholder: "Ex: capitulo-01",
      confirmLabel: "Criar",
    });
    if (name?.trim()) await createFile(parentDir, name.trim());
  };

  const handleNewFolder = async (parentDir: string) => {
    const name = await openPrompt({
      title: "Nova pasta",
      message: "Informe o nome da nova pasta.",
      defaultValue: "Nova pasta",
      placeholder: "Nome da pasta",
      confirmLabel: "Criar",
    });
    if (name?.trim()) await createFolder(parentDir, name.trim());
  };

  const handleRename = async (node: FileNode) => {
    const isFile = node.type === "file";

    // Pra arquivos, separa basename da extensao (.md/.txt). O input
    // mostra só o basename — assim o user não consegue apagar a
    // extensao por engano (e quebrar o arquivo). Se ele digitar uma
    // extensao no novo nome, a gente strippa silenciosamente e
    // re-anexa a original.
    let baseName = node.name;
    let ext = "";
    if (isFile) {
      const m = node.name.match(/^(.+?)(\.(?:md|txt))$/i);
      if (m) {
        baseName = m[1];
        ext = m[2];
      }
    }

    const newName = await openPrompt({
      title: isFile ? "Renomear nota" : "Renomear pasta",
      message: isFile
        ? "A extensão do arquivo é preservada automaticamente."
        : undefined,
      defaultValue: baseName,
      confirmLabel: "Renomear",
    });
    if (!newName) return;

    const trimmed = newName.trim();
    if (!trimmed) return;
    // Se for arquivo, strip qualquer .md/.txt que o user tenha digitado
    // por habito e re-anexa a extensao original — extensao é imutavel.
    const cleanedBase = isFile
      ? trimmed.replace(/\.(?:md|txt)$/i, "")
      : trimmed;
    const finalName = cleanedBase + ext;
    if (finalName !== node.name) {
      await renameNode(node.path, finalName);
    }
  };

  const handleDelete = async (node: FileNode) => {
    const isFolder = node.type === "folder";
    const ok = await openConfirm({
      title: isFolder ? "Excluir pasta" : "Excluir arquivo",
      message: isFolder
        ? `A pasta "${node.name}" e todo o seu conteúdo serão removidos permanentemente.`
        : `O arquivo "${node.name}" será removido permanentemente.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (ok) await deleteNode(node.path, isFolder);
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-panel-2)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header — label "Arquivos" em small-caps discreto (.solon-plaque)
          com hairline sutil embaixo (.solon-plaque-bar). */}
      <div
        className="flex items-center justify-between px-3.5 py-3 solon-plaque-bar"
      >
        <span className="solon-plaque truncate">Arquivos</span>
        <div className="flex items-center gap-0.5">
          {rootFolder && (
            <>
              <HeaderBtn
                onClick={openCommandPalette}
                title="Buscar notas e pastas (Ctrl+K)"
              >
                <Search size={11} />
              </HeaderBtn>
              <HeaderBtn
                onClick={() => handleNewFile(rootFolder)}
                title="Novo arquivo"
              >
                <FilePlus size={11} />
              </HeaderBtn>
              <HeaderBtn
                onClick={() => handleNewFolder(rootFolder)}
                title="Nova pasta"
              >
                <FolderPlus size={11} />
              </HeaderBtn>
              <button
                ref={tagBtnRef}
                onClick={() => setTagPopoverOpen((v) => !v)}
                title="Filtrar por tag"
                className="transition-colors flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  color: activeTagFilter
                    ? "var(--accent)"
                    : "var(--text-muted)",
                  background: tagPopoverOpen ? "var(--bg-hover)" : "transparent",
                  borderRadius: "var(--radius-sm)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = tagPopoverOpen
                    ? "var(--bg-hover)"
                    : "transparent";
                }}
              >
                <TagIcon size={11} />
              </button>
              <HeaderBtn onClick={() => refresh()} title="Atualizar">
                <RefreshCw size={11} />
              </HeaderBtn>
            </>
          )}
          <HeaderBtn onClick={openFolder} title="Abrir pasta">
            <FolderOpen size={11} />
          </HeaderBtn>
        </div>
      </div>

      {/* Chip de filtro ativo — sticky no topo da lista quando ha tag. */}
      {activeTagFilter && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5"
          style={{
            background: "var(--bg-hover)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-[0.72rem] truncate"
            style={{ color: "var(--accent)" }}
          >
            <TagIcon size={11} />
            <span className="truncate">{activeTagFilter}</span>
          </span>
          <button
            onClick={() => setActiveTagFilter(null)}
            title="Limpar filtro"
            className="p-0.5 rounded"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.color =
                "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "var(--text-muted)")
            }
          >
            <XIcon size={11} />
          </button>
        </div>
      )}

      {/* Árvore de arquivos (ou lista filtrada por tag) */}
      <div
        // Fundo da árvore = raiz do projeto como destino de arraste.
        data-sidebar-root-drop={fileTree.length > 0 && !activeTagFilter ? "" : undefined}
        className="flex-1 overflow-y-auto py-1 transition-colors"
        style={{
          background: rootIsDropTarget
            ? "color-mix(in srgb, var(--accent) 7%, transparent)"
            : undefined,
          boxShadow: rootIsDropTarget ? "inset 0 0 0 1px var(--accent)" : undefined,
        }}
        role={fileTree.length > 0 ? "tree" : undefined}
        aria-label={fileTree.length > 0 ? "Explorador de arquivos" : undefined}
        onContextMenu={(e) => {
          // Right-click no espaço vazio → menu da raiz
          if (e.target === e.currentTarget && rootFolder) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, node: null });
          }
        }}
      >
        {fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-4 text-center">
            <span style={{ color: "var(--border-strong)", fontSize: 28 }} aria-hidden>
              ❦
            </span>
            <p
              className="italic leading-relaxed"
              style={{
                color: "var(--text-placeholder)",
                fontFamily: "var(--font-ui)",
                fontSize: "0.82rem",
              }}
            >
              Abra uma pasta para começar seu projeto
            </p>
            <button onClick={openFolder} className="solon-btn solon-btn--primary">
              Abrir pasta
            </button>
            <button onClick={() => openFileFromDisk()} className="solon-text-action">
              ou um arquivo avulso
            </button>
          </div>
        ) : activeTagFilter ? (
          <FilteredFileList
            tag={activeTagFilter}
            tagIndex={tagIndex}
            tree={fileTree}
            activeFilePath={activeFilePath}
          />
        ) : (
          <FileTree
            nodes={fileTree}
            depth={0}
            activeFilePath={activeFilePath}
            rootFolder={rootFolder}
            onToggle={toggleFolder}
            onContextMenu={(node, x, y) => setMenu({ x, y, node })}
            dragPath={dragPath}
            dragOverPath={dragOverPath}
            dragOverFolder={dragOverFolder}
            onDragStart={beginSidebarDrag}
            onDragOver={setDragOverPath}
            onDragOverFolder={setDragOverFolder}
            onDragEnd={clearSidebarDrag}
            onReorder={(draggedPath, targetPath, siblings) => {
              reorderItem(draggedPath, targetPath, siblings);
              clearSidebarDrag();
            }}
            onMoveToFolder={(draggedPath, folderPath) => {
              moveItem(draggedPath, folderPath);
              clearSidebarDrag();
            }}
          />
        )}
      </div>

      {/* Popover de filtro por tag */}
      {tagPopoverOpen && (
        <TagFilterPopover
          anchor={tagBtnRef.current}
          onClose={() => setTagPopoverOpen(false)}
        />
      )}

      {/* Menu de contexto */}
      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onOpen={(node) => {
            if (node.type === "folder") {
              toggleFolder(node.path);
            } else {
              void openFile(node.path, node.name, { tab: "replace" });
            }
          }}
          onOpenInNewTab={(node) => {
            if (node.type === "file") {
              void openFile(node.path, node.name, { tab: "new" });
            }
          }}
          onRename={handleRename}
          onDelete={handleDelete}
          onDuplicate={(node) => {
            setMenu(null);
            void duplicateFile(node.path);
          }}
          rootFolder={rootFolder}
        />
      )}
    </div>
  );
}

function HeaderBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  // 18x18 pra caber o label "Arquivos" + ações na largura padrão do
  // sidebar (200px) sem truncar. Hover preenche com bg-hover sem borda
  // pra ficar mais discreto (chrome interno deve respirar).
  return (
    <button
      onClick={onClick}
      aria-label={title}
      className="transition-colors flex items-center justify-center"
      title={title}
      style={{
        width: 18,
        height: 18,
        color: "var(--text-muted)",
        background: "transparent",
        borderRadius: "var(--radius-sm)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
      }}
    >
      {children}
    </button>
  );
}

/**
 * Uma linha da árvore. Extraída por duas razões:
 * - mover hover/selected state pra CSS vars (sem `hover:bg-[#...]`
 *   que não re-avalia no theme-switch);
 * - deixar o render do FileTree mais legível.
 */
function FileTreeRow({
  node,
  depth,
  isActive,
  rootFolder,
  onOpen,
  onOpenInBackground,
  onContextMenu,
  dragPath,
  dragOverPath,
  dragOverFolder,
  siblingPaths,
  onDragStart,
  onDragOver,
  onDragOverFolder,
  onDragEnd,
  onReorder,
  onMoveToFolder,
}: {
  node: FileNode;
  depth: number;
  isActive: boolean;
  rootFolder: string | null;
  onOpen: () => void;
  onOpenInBackground: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragPath: string | null;
  dragOverPath: string | null;
  dragOverFolder: string | null;
  siblingPaths: string[];
  onDragStart: (path: string) => void;
  onDragOver: (path: string | null) => void;
  onDragOverFolder: (path: string | null) => void;
  onDragEnd: () => void;
  onReorder: (draggedPath: string, targetPath: string) => void;
  onMoveToFolder: (draggedPath: string, folderPath: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const suppressClickRef = useRef(false);

  const showDropIndicator =
    node.type === "file" && dragOverPath === node.path && dragPath !== node.path;
  const showFolderDropHighlight =
    node.type === "folder" &&
    dragOverFolder !== null &&
    normalizeTreePath(dragOverFolder) === normalizeTreePath(node.path);

  /** Lê do DOM o que está sob o cursor e decide o destino. */
  const findDropTarget = (clientX: number, clientY: number): SidebarDropTarget | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const row = el.closest<HTMLElement>("[data-sidebar-node-path]");
    const rowType = row?.dataset.sidebarNodeType;
    return resolveSidebarDrop(
      { path: node.path, type: node.type },
      {
        row:
          row && (rowType === "file" || rowType === "folder")
            ? { path: row.dataset.sidebarNodePath ?? "", type: rowType }
            : null,
        overTreeBackground: el.hasAttribute("data-sidebar-root-drop"),
        overCanvas: !!el.closest("[data-canvas-drop-zone]"),
      },
      rootFolder,
      siblingPaths,
    );
  };

  // Arraste por mouse (mousedown → mousemove → mouseup), igual para nota e
  // pasta. Antes as notas usavam o drag-and-drop nativo do HTML5, que no
  // webview do Tauri no Windows compete com o tratamento de arquivos
  // soltos na janela e falha de forma intermitente — a pasta, que já ia
  // por mouse, movia; a nota ficava parada. Um caminho só, que não
  // depende do webview, para os dois tipos e também para soltar no canvas.
  const startPointerDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if ((e.target as HTMLElement).closest("[data-sidebar-action]")) return;

    const originX = e.clientX;
    const originY = e.clientY;
    let dragging = false;
    let target: SidebarDropTarget | null = null;
    let ghost: HTMLDivElement | null = null;
    let lastX = originX;
    let lastY = originY;
    let autoScrollFrame = 0;
    const scroller = e.currentTarget.closest<HTMLElement>("[data-sidebar-root-drop]");

    // Rola a árvore quando o cursor encosta na borda de cima ou de baixo —
    // o drag nativo fazia isso de graça; sem ele, uma pasta fora da tela
    // ficava inalcançável. Mais perto da borda, mais rápido.
    const autoScroll = () => {
      autoScrollFrame = 0;
      if (!dragging || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      if (lastX < rect.left || lastX > rect.right) return;
      const zone = 32;
      let dy = 0;
      if (lastY < rect.top + zone) dy = -Math.min(12, Math.ceil((rect.top + zone - lastY) / 3));
      else if (lastY > rect.bottom - zone) dy = Math.min(12, Math.ceil((lastY - rect.bottom + zone) / 3));
      if (dy === 0) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += dy;
      if (scroller.scrollTop === before) return;
      target = findDropTarget(lastX, lastY);
      showTarget(target);
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    const finishDrag = () => {
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
      document.documentElement.classList.remove("solon-tree-dragging");
      ghost?.remove();
      ghost = null;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const showTarget = (next: SidebarDropTarget | null) => {
      onDragOver(next?.kind === "reorder" ? next.path : null);
      onDragOverFolder(next?.kind === "folder" ? next.path : null);
      document.documentElement.classList.toggle(
        "solon-tree-drop-canvas",
        next?.kind === "canvas",
      );
    };

    startDrag({
      onMove: (ev) => {
        const distance = Math.hypot(ev.clientX - originX, ev.clientY - originY);
        if (!dragging && distance < 5) return;

        if (!dragging) {
          dragging = true;
          suppressClickRef.current = true;
          onDragStart(node.path);
          // Cursor "grabbing" GLOBAL via classe no <html> + CSS
          // !important: as linhas têm `cursor` próprio, que venceria um
          // `body.style.cursor` ao passar por cima do alvo.
          document.documentElement.classList.add("solon-tree-dragging");
          ghost = document.createElement("div");
          ghost.className = "solon-drag-ghost";
          ghost.textContent = displayName(node);
          document.body.appendChild(ghost);
        }

        ev.preventDefault();
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (ghost) {
          ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
        }
        target = findDropTarget(ev.clientX, ev.clientY);
        showTarget(target);
        if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll);
      },
      onEnd: (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const drop = findDropTarget(ev.clientX, ev.clientY) ?? target;
        showTarget(null);
        finishDrag();
        if (drop?.kind === "folder") {
          onMoveToFolder(node.path, drop.path);
        } else if (drop?.kind === "reorder") {
          onReorder(node.path, drop.path);
        } else {
          if (drop?.kind === "canvas") {
            window.dispatchEvent(
              new CustomEvent<SidebarSceneDropDetail>(SIDEBAR_SCENE_DROP_EVENT, {
                detail: {
                  path: node.path,
                  name: node.name,
                  clientX: ev.clientX,
                  clientY: ev.clientY,
                },
              }),
            );
          }
          onDragEnd();
        }
      },
      onCancel: () => {
        showTarget(null);
        finishDrag();
        onDragEnd();
      },
    });
  };

  const bg = showFolderDropHighlight
    ? "var(--accent-soft, var(--bg-hover))"
    : isActive
    ? "var(--bg-selected)"
    : hovered
    ? "var(--bg-hover)"
    : "transparent";
  const fg =
    node.type === "folder" ? "var(--text-primary)" : "var(--text-secondary)";

  return (
    <div
      data-sidebar-node-path={node.path}
      data-sidebar-node-type={node.type}
      onMouseDown={startPointerDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClickRef.current = false;
          return;
        }
        if (node.type === "file" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.stopPropagation();
          onOpenInBackground();
          return;
        }
        onOpen();
      }}
      onAuxClick={(e) => {
        // Middle-click em arquivo abre nova aba SEM tirar o foco do
        // arquivo atual. Convencao herdada de browsers (Ctrl+click ou
        // mouse-do-meio = "abrir em nova aba em background").
        if (e.button !== 1) return;
        if (node.type !== "file") return;
        e.preventDefault();
        e.stopPropagation();
        onOpenInBackground();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onOpen();
      }}
      onContextMenu={onContextMenu}
      role="treeitem"
      tabIndex={0}
      aria-selected={node.type === "file" ? isActive : undefined}
      aria-expanded={node.type === "folder" ? node.expanded : undefined}
      className={clsx(
        // A classe fica na LINHA, não no wrapper: o wrapper de uma pasta
        // contém a subárvore inteira e um palpite de altura de uma linha
        // faria a barra de rolagem saltar. A linha sempre tem uma linha.
        "solon-long-row flex items-center gap-1.5 py-[3px] pr-2 mx-1.5 group relative",
        "transition-colors text-[0.8125rem]",
        node.type === "folder" ? "cursor-default" : "cursor-pointer",
      )}
      style={{
        paddingLeft: `${6 + depth * 14}px`,
        background: bg,
        color: fg,
        // Highlight em pill inset (cantos suaves). Arquivo ativo ganha um
        // marcador accent fino na borda esquerda via inset box-shadow
        // (definido junto do drop-indicator abaixo) — calmo, combina com
        // o arredondamento (sem faixa grossa).
        borderRadius: "var(--radius-sm)",
        // Toda a lateral em Inter upright (pastas E arquivos), sem italico.
        // A distincao pasta/arquivo vem do icone (folder colorido vs file
        // muted) e da cor do texto (text-primary vs text-secondary), não do
        // estilo da fonte.
        fontFamily: "var(--font-ui)",
        fontWeight: 400,
        // Item sendo arrastado fica meio-transparente como feedback.
        opacity: dragPath === node.path ? 0.4 : 1,
        // boxShadow combina: marcador accent esquerdo (arquivo ativo) +
        // indicador de drop (linha fina no topo do alvo). Drop tem
        // prioridade quando ativo pra dar feedback claro.
        boxShadow: showDropIndicator
          ? "inset 0 2px 0 0 var(--accent)"
          : node.type === "file" && isActive
          ? "inset 2px 0 0 0 var(--accent)"
          : undefined,
      }}
    >
      {node.type === "folder" ? (
        <>
          <ChevronRight
            size={12}
            className={clsx(
              "transition-transform flex-shrink-0",
              node.expanded && "rotate-90",
            )}
            style={{ color: "var(--text-placeholder)" }}
          />
          <FolderOpen
            size={13}
            className="flex-shrink-0"
            style={{
              color: node.expanded
                ? "var(--folder-color-open, var(--accent))"
                : "var(--folder-color, var(--text-placeholder))",
            }}
          />
        </>
      ) : (
        <>
          <span className="w-3 flex-shrink-0" />
          <File
            size={13}
            className="flex-shrink-0"
            style={{ color: "var(--text-placeholder)" }}
          />
        </>
      )}
      <span className="truncate">{displayName(node)}</span>
    </div>
  );
}

function displayName(node: FileNode): string {
  return node.name.replace(/\.md$/, "").replace(/\.txt$/, "");
}

interface FileTreeProps {
  nodes: FileNode[];
  depth: number;
  activeFilePath: string | null;
  rootFolder: string | null;
  onToggle: (path: string) => void;
  onContextMenu: (node: FileNode, x: number, y: number) => void;
  // ─── drag-and-drop ───
  dragPath: string | null;
  dragOverPath: string | null;
  /** Pasta atualmente highlighted como destino de move (drop dentro). */
  dragOverFolder: string | null;
  onDragStart: (path: string) => void;
  onDragOver: (path: string | null) => void;
  onDragOverFolder: (path: string | null) => void;
  onDragEnd: () => void;
  /** Reorder dentro da MESMA pasta (drop sobre sibling). */
  onReorder: (
    draggedPath: string,
    targetPath: string | null,
    siblings: string[],
  ) => void;
  /** Move pra OUTRA pasta: soltar na pasta, numa nota dela ou no fundo
   *  da árvore (raiz). */
  onMoveToFolder: (draggedPath: string, folderPath: string) => void;
}

function FileTree({
  nodes,
  depth,
  activeFilePath,
  rootFolder,
  onToggle,
  onContextMenu,
  dragPath,
  dragOverPath,
  dragOverFolder,
  onDragStart,
  onDragOver,
  onDragOverFolder,
  onDragEnd,
  onReorder,
  onMoveToFolder,
}: FileTreeProps) {
  const { openFile } = useFileSystem();

  // `siblingNames` é o snapshot da ordem atual desta pasta — passado
  // pro reorder pra que o JSON saiba como inicializar essa pasta caso
  // ainda não tinha custom order. `siblingPaths` (paths absolutos) é
  // computado UMA vez por render do FileTree, não por iteracao do
  // .map. Construir a lista dentro de cada linha criaria um array novo
  // por item, O(N) por nível da árvore.
  const siblingNames = nodes.map((n) => n.name);
  const siblingPaths = nodes.map((n) => n.path);

  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <FileTreeRow
            node={node}
            depth={depth}
            isActive={node.type === "file" && activeFilePath === node.path}
            rootFolder={rootFolder}
            onOpen={() => {
              if (node.type === "folder") onToggle(node.path);
              else openFile(node.path, node.name, { tab: "replace" });
            }}
            onOpenInBackground={() => {
              // Middle-click em arquivo abre nova aba SEM tirar o foco
              // do arquivo atual. Convencao de browser. Pasta não tem
              // analogo (sem dois "expandidos" simultaneos).
              if (node.type !== "file") return;
              useAppStore.getState().addTab(node.path, node.name);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(node, e.clientX, e.clientY);
            }}
            dragPath={dragPath}
            dragOverPath={dragOverPath}
            dragOverFolder={dragOverFolder}
            siblingPaths={siblingPaths}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragOverFolder={onDragOverFolder}
            onDragEnd={onDragEnd}
            onReorder={(draggedPath, targetPath) =>
              onReorder(draggedPath, targetPath, siblingNames)
            }
            onMoveToFolder={onMoveToFolder}
          />

          {node.type === "folder" && node.expanded && node.children && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              rootFolder={rootFolder}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              dragPath={dragPath}
              dragOverPath={dragOverPath}
              dragOverFolder={dragOverFolder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragOverFolder={onDragOverFolder}
              onDragEnd={onDragEnd}
              onReorder={onReorder}
              onMoveToFolder={onMoveToFolder}
            />
          )}
        </div>
      ))}
    </>
  );
}

function ContextMenu({
  menu,
  onClose,
  onNewFile,
  onNewFolder,
  onOpen,
  onOpenInNewTab,
  onRename,
  onDelete,
  onDuplicate,
  rootFolder,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onOpen: (node: FileNode) => void;
  onOpenInNewTab: (node: FileNode) => void;
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
  onDuplicate?: (node: FileNode) => void;
  rootFolder: string | null;
}) {
  const { node } = menu;
  const items: { label: string; icon: React.ReactNode; action: () => void; danger?: boolean }[] = [];
  const copyPath = (path: string) => {
    void navigator.clipboard?.writeText(path);
  };
  const revealPath = (path: string) => {
    void import("@tauri-apps/plugin-opener")
      .then(({ revealItemInDir }) => revealItemInDir(path))
      .catch(() => {});
  };

  // Espaço vazio → ações na raiz
  if (!node) {
    if (rootFolder) {
      items.push({
        label: "Novo arquivo",
        icon: <FilePlus size={12} />,
        action: () => onNewFile(rootFolder),
      });
      items.push({
        label: "Nova pasta",
        icon: <FolderPlus size={12} />,
        action: () => onNewFolder(rootFolder),
      });
    }
  } else if (node.type === "folder") {
    items.push({
      label: "Abrir",
      icon: <FolderOpen size={12} />,
      action: () => onOpen(node),
    });
    items.push({
      label: "Novo arquivo",
      icon: <FilePlus size={12} />,
      action: () => onNewFile(node.path),
    });
    items.push({
      label: "Nova subpasta",
      icon: <FolderPlus size={12} />,
      action: () => onNewFolder(node.path),
    });
    items.push({
      label: "Copiar caminho",
      icon: <Clipboard size={12} />,
      action: () => copyPath(node.path),
    });
    items.push({
      label: "Mostrar no Explorer",
      icon: <ExternalLink size={12} />,
      action: () => revealPath(node.path),
    });
    items.push({
      label: "Renomear",
      icon: <Pencil size={12} />,
      action: () => onRename(node),
    });
    items.push({
      label: "Excluir",
      icon: <Trash2 size={12} />,
      action: () => onDelete(node),
      danger: true,
    });
  } else {
    items.push({
      label: "Abrir aqui",
      icon: <File size={12} />,
      action: () => onOpen(node),
    });
    items.push({
      label: "Abrir em nova aba",
      icon: <FilePlus size={12} />,
      action: () => onOpenInNewTab(node),
    });
    items.push({
      label: "Duplicar",
      icon: <Copy size={12} />,
      action: () => onDuplicate?.(node),
    });
    items.push({
      label: "Copiar caminho",
      icon: <Clipboard size={12} />,
      action: () => copyPath(node.path),
    });
    items.push({
      label: "Mostrar no Explorer",
      icon: <ExternalLink size={12} />,
      action: () => revealPath(node.path),
    });
    items.push({
      label: "Renomear",
      icon: <Pencil size={12} />,
      action: () => onRename(node),
    });
    items.push({
      label: "Excluir",
      icon: <Trash2 size={12} />,
      action: () => onDelete(node),
      danger: true,
    });
  }

  return (
    <div
      className="fixed z-50 min-w-[170px] py-1"
      style={{
        left: menu.x,
        top: menu.y,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-md)",
        fontSize: "0.82rem",
        padding: "4px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <ContextMenuItem
          key={item.label}
          label={item.label}
          icon={item.icon}
          danger={item.danger}
          onClick={() => {
            item.action();
            onClose();
          }}
        />
      ))}
    </div>
  );
}

function ContextMenuItem({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Para itens danger, o hover destaca usando o danger color com
  // transparência — no dark tema a cor base já é mais clara, então o
  // resultado lê bem sem hardcode.
  const bg = hovered
    ? danger
      ? "var(--accent-soft)"
      : "var(--bg-hover)"
    : "transparent";
  const fg = danger ? "var(--danger)" : "var(--text-primary)";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
      style={{ background: bg, color: fg, borderRadius: "var(--radius-sm)" }}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      {label}
    </button>
  );
}

/**
 * Lista flat de arquivos que tem a tag ativa. Substitui a arvore de
 * pastas quando ha filtro — abandonar a estrutura hierarquica simplifica
 * implementação e o resultado UX faz sentido: "estou navegando por tag,
 * não por organizacao fisica do disco".
 *
 * tagIndex pode ser null se o user nunca abriu o popover (ex: aplicou
 * filtro via CommandPalette futuro). Nesse caso mostra uma mensagem
 * sugerindo abrir o popover (que indexa).
 */
function FilteredFileList({
  tag,
  tagIndex,
  tree,
  activeFilePath,
}: {
  tag: string;
  tagIndex: Map<string, string[]> | null;
  tree: FileNode[];
  activeFilePath: string | null;
}) {
  const { openFile } = useFileSystem();
  if (!tagIndex) {
    return (
      <div className="px-3 py-4 text-center text-[0.75rem] italic" style={{ color: "var(--text-muted)" }}>
        Abra o filtro de tags pra indexar.
      </div>
    );
  }
  const lower = tag.toLowerCase();
  const matchPaths = new Set<string>();
  for (const [path, tags] of tagIndex) {
    if (tags.some((t) => t.toLowerCase() === lower)) matchPaths.add(path);
  }
  // Mantemos a ordem da arvore (alfabetica + folders first), só filtramos.
  const allFiles = flattenForList(tree).filter((f) => matchPaths.has(f.path));
  if (allFiles.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[0.75rem] italic" style={{ color: "var(--text-muted)" }}>
        Nenhum arquivo com esta tag.
      </div>
    );
  }
  return (
    <ul className="py-0.5">
      {allFiles.map((f) => {
        const isActive = activeFilePath === f.path;
        const display = f.name.replace(/\.(md|txt)$/i, "");
        return (
          <li key={f.path}>
            <button
              onClick={() => openFile(f.path, f.name, { tab: "replace" })}
              className="w-full flex items-center gap-1.5 px-3 py-1 text-left text-[0.8125rem] transition-colors truncate"
              style={{
                background: isActive ? "var(--bg-hover)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-primary)",
                fontFamily: "var(--font-ui)",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              title={f.path}
            >
              <File size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span className="truncate">{display}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function flattenForList(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) out.push(...flattenForList(n.children));
  }
  return out;
}
