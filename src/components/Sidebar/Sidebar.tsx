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
} from "lucide-react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { startDrag } from "../../lib/drag";
import { canMoveIntoFolder } from "../../lib/sidebarDrop";
import { SCENE_DND_MIME } from "../../types/canvas";
import { TagFilterPopover } from "./TagFilterPopover";
import clsx from "clsx";

const SIDEBAR_DND_MIME = "application/x-solon-sidebar-node";

function getSidebarDragPath(e: React.DragEvent): string | null {
  try {
    const raw = e.dataTransfer.getData(SIDEBAR_DND_MIME);
    if (raw) {
      const parsed = JSON.parse(raw) as { path?: string };
      if (typeof parsed.path === "string") return parsed.path;
    }
  } catch {
    /* dataTransfer pode estar indisponivel durante dragover */
  }
  try {
    const text = e.dataTransfer.getData("text/plain");
    return text || null;
  } catch {
    return null;
  }
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null; // null → raiz
}

export function Sidebar() {
  // Seletores granulares: assinar `useAppStore()` cru fazia o Sidebar
  // re-renderizar TODA arvore de arquivos a cada keystroke (porque o store
  // tem fileBody/headings/saveStatus/wordCount mudando constantemente).
  // Em projetos com muitas pastas/arquivos isso e' o ofensor #1 de lag.
  const fileTree = useAppStore((s) => s.fileTree);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const openPrompt = useAppStore((s) => s.openPrompt);
  const openConfirm = useAppStore((s) => s.openConfirm);
  const activeTagFilter = useAppStore((s) => s.activeTagFilter);
  const setActiveTagFilter = useAppStore((s) => s.setActiveTagFilter);
  const tagIndex = useAppStore((s) => s.tagIndex);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement | null>(null);
  const { openFolder, openFile, refresh, createFile, createFolder, renameNode, deleteNode, reorderItem, moveItem, duplicateFile } =
    useFileSystem();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  /**
   * Estado do drag-and-drop. Dois modos:
   *  - REORDER: dragOverPath aponta pro sibling sob o cursor (linha
   *    azul no topo do alvo). Mesmo parent que o dragged.
   *  - MOVE: dragOverFolder aponta pra uma pasta DIFERENTE do parent
   *    atual (highlight da pasta inteira). Solta = fs.rename pra
   *    dentro dela.
   */
  const [dragPath, setDragPath] = useState<string | null>(null);
  const dragPathRef = useRef<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const beginSidebarDrag = (path: string) => {
    dragPathRef.current = path;
    setDragPath(path);
  };

  const clearSidebarDrag = () => {
    dragPathRef.current = null;
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
    // "Nova nota" "Nova nota 2" etc se o user so' clicar Enter por habito.
    // Placeholder vazio + dica visual e' mais limpo.
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
    // mostra so' o basename — assim o user nao consegue apagar a
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
    // por habito e re-anexa a extensao original — extensao e' imutavel.
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
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[0.7rem] font-semibold uppercase tracking-widest truncate"
          style={{ color: "var(--text-muted)" }}
        >
          Arquivos
        </span>
        <div className="flex items-center gap-0.5">
          {rootFolder && (
            <>
              <HeaderBtn
                onClick={() => handleNewFile(rootFolder)}
                title="Novo arquivo"
              >
                <FilePlus size={13} />
              </HeaderBtn>
              <HeaderBtn
                onClick={() => handleNewFolder(rootFolder)}
                title="Nova pasta"
              >
                <FolderPlus size={13} />
              </HeaderBtn>
              <button
                ref={tagBtnRef}
                onClick={() => setTagPopoverOpen((v) => !v)}
                title="Filtrar por tag"
                className="p-1 rounded transition-colors"
                style={{
                  color: activeTagFilter
                    ? "var(--accent)"
                    : "var(--text-muted)",
                  background: tagPopoverOpen ? "var(--bg-hover)" : "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = tagPopoverOpen
                    ? "var(--bg-hover)"
                    : "transparent")
                }
              >
                <TagIcon size={13} />
              </button>
              <HeaderBtn onClick={() => refresh()} title="Atualizar">
                <RefreshCw size={13} />
              </HeaderBtn>
            </>
          )}
          <HeaderBtn onClick={openFolder} title="Abrir pasta">
            <FolderOpen size={13} />
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
        className="flex-1 overflow-y-auto py-1"
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
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <FolderOpen size={32} style={{ color: "var(--border)" }} />
            <p
              className="text-[0.75rem] leading-relaxed"
              style={{ color: "var(--text-placeholder)" }}
            >
              Abra uma pasta para começar seu projeto
            </p>
            <button
              onClick={openFolder}
              className="text-[0.75rem] px-3 py-1.5 rounded-md transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "brightness(0.92)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "";
              }}
            >
              Abrir pasta
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
            onToggle={toggleFolder}
            onContextMenu={(node, x, y) => setMenu({ x, y, node })}
            dragPath={dragPath}
            dragPathRef={dragPathRef}
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
  return (
    <button
      onClick={onClick}
      aria-label={title}
      className="p-1 rounded transition-colors"
      title={title}
      style={{ color: "var(--text-muted)", background: "transparent" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
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
  onOpen,
  onOpenInBackground,
  onContextMenu,
  dragPath,
  dragPathRef,
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
  onOpen: () => void;
  onOpenInBackground: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragPath: string | null;
  dragPathRef: React.MutableRefObject<string | null>;
  dragOverPath: string | null;
  dragOverFolder: string | null;
  siblingPaths: string[];
  onDragStart: (path: string) => void;
  onDragOver: (path: string | null) => void;
  onDragOverFolder: (path: string | null) => void;
  onDragEnd: () => void;
  onReorder: (targetPath: string) => void;
  onMoveToFolder: (draggedPath: string, folderPath: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const suppressClickRef = useRef(false);
  const activeDragPath = dragPathRef.current ?? dragPath;

  // Regra de drop por TIPO do alvo:
  //  - Drop em FILE → reorder (so' dentro do mesmo parent)
  //  - Drop em FOLDER → move-into SEMPRE (independente de ser sibling)
  //
  // Antes a gente bloqueava move se folder destino era sibling, o que
  // impedia "arrastar pasta A pra dentro de pasta B" no mesmo nivel.
  // Agora pra reorder voce solta em arquivo; pra mover pra dentro
  // de pasta, solta na pasta. Conflito impossivel — file != folder.
  const isSameParent = !!activeDragPath && siblingPaths.includes(activeDragPath);
  const canMoveIntoThisFolder =
    node.type === "folder" && canMoveIntoFolder(activeDragPath, node.path);

  const showDropIndicator =
    isSameParent &&
    node.type === "file" &&
    dragOverPath === node.path &&
    activeDragPath !== node.path;
  const showFolderDropHighlight =
    canMoveIntoThisFolder && dragOverFolder === node.path;

  const findFolderDropTarget = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const target = el?.closest<HTMLElement>(
      '[data-sidebar-node-type="folder"][data-sidebar-node-path]',
    );
    const targetPath = target?.dataset.sidebarNodePath ?? null;
    if (!targetPath) return null;
    return canMoveIntoFolder(node.path, targetPath) ? targetPath : null;
  };

  const startFolderPointerDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (node.type !== "folder" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-sidebar-action]")) return;

    const originX = e.clientX;
    const originY = e.clientY;
    let dragging = false;
    let currentTargetPath: string | null = null;
    const originalCursor = document.body.style.cursor;

    const finishDrag = () => {
      document.body.style.cursor = originalCursor;
    };

    startDrag({
      onMove: (ev) => {
        const distance = Math.hypot(ev.clientX - originX, ev.clientY - originY);
        if (!dragging && distance < 5) return;

        if (!dragging) {
          dragging = true;
          suppressClickRef.current = true;
          onDragStart(node.path);
          document.body.style.cursor = "default";
        }

        ev.preventDefault();
        const targetPath = findFolderDropTarget(ev.clientX, ev.clientY);
        currentTargetPath = targetPath;
        if (dragOverPath !== null) onDragOver(null);
        if (dragOverFolder !== targetPath) onDragOverFolder(targetPath);
      },
      onEnd: (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const targetPath =
          currentTargetPath ?? findFolderDropTarget(ev.clientX, ev.clientY);
        if (targetPath) onMoveToFolder(node.path, targetPath);
        else onDragEnd();
        finishDrag();
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      },
      onCancel: () => {
        onDragOver(null);
        onDragOverFolder(null);
        onDragEnd();
        finishDrag();
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
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
      draggable={node.type === "file"}
      data-sidebar-node-path={node.path}
      data-sidebar-node-type={node.type}
      onDragStart={(e) => {
        if (node.type !== "file") {
          e.preventDefault();
          return;
        }
        // 2 funcoes:
        // 1. Drag pro Canvas (scene cards) — usa MIME `SCENE_DND_MIME`
        //    (so' arquivos, nao pastas)
        // 2. Drag pra reorder no sidebar — usa estado interno (dragPath)
        if (node.type === "file") {
          const payload = JSON.stringify({
            path: node.path,
            name: node.name,
          });
          e.dataTransfer.setData(SCENE_DND_MIME, payload);
        }
        e.dataTransfer.setData(
          SIDEBAR_DND_MIME,
          JSON.stringify({ path: node.path, name: node.name, type: node.type }),
        );
        e.dataTransfer.setData("text/plain", node.path);
        e.dataTransfer.effectAllowed = "copyMove";
        onDragStart(node.path);
      }}
      onDragEnter={(e) => {
        const draggedPath = dragPathRef.current ?? dragPath ?? getSidebarDragPath(e);
        const isSidebarDrag =
          !!draggedPath || Array.from(e.dataTransfer.types).includes(SIDEBAR_DND_MIME);
        const canDropOnFolder =
          node.type === "folder" &&
          isSidebarDrag &&
          (!draggedPath || canMoveIntoFolder(draggedPath, node.path));

        if (canDropOnFolder) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverFolder !== node.path) onDragOverFolder(node.path);
          if (dragOverPath !== null) onDragOver(null);
        }
      }}
      onDragOver={(e) => {
        const draggedPath = dragPathRef.current ?? dragPath ?? getSidebarDragPath(e);
        const isSidebarDrag =
          !!draggedPath || Array.from(e.dataTransfer.types).includes(SIDEBAR_DND_MIME);
        const canDropOnFolder =
          node.type === "folder" &&
          isSidebarDrag &&
          (!draggedPath || canMoveIntoFolder(draggedPath, node.path));
        const canReorderHere =
          node.type === "file" &&
          !!draggedPath &&
          siblingPaths.includes(draggedPath) &&
          draggedPath !== node.path;

        // FOLDER alvo: sempre tenta move-into (regra simples,
        // independente de sibling). Tem prioridade absoluta sobre
        // reorder porque um folder nunca e' alvo valido de reorder.
        if (canDropOnFolder) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverFolder !== node.path) onDragOverFolder(node.path);
          if (dragOverPath !== null) onDragOver(null);
          return;
        }
        // FILE alvo: so' aceita reorder se mesmo parent.
        if (canReorderHere) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverPath !== node.path) onDragOver(node.path);
        }
      }}
      onDragLeave={(e) => {
        // Race classica: dragleave dispara TODA vez que o cursor sai
        // de QUALQUER elemento dentro do row (icone, chevron, span do
        // nome) — mesmo so' transitando entre filhos. Fica piscando.
        // Solucao: so' limpa o highlight se o cursor REALMENTE saiu
        // da bbox do row. relatedTarget e' onde o cursor entrou; se
        // for descendente do row, ainda estamos "dentro" — ignora.
        const next = e.relatedTarget as Node | null;
        const row = e.currentTarget;
        if (next && row.contains(next)) return;
        if (dragOverPath === node.path) onDragOver(null);
        if (dragOverFolder === node.path) onDragOverFolder(null);
      }}
      onDrop={(e) => {
        const draggedPath = dragPathRef.current ?? dragPath ?? getSidebarDragPath(e);
        // FOLDER → move-into. NAO checa `dragOverFolder === node.path`
        // porque ha race condition classica do HTML5 D&D: dragleave
        // pode disparar transitoriamente quando o cursor passa sobre
        // filhos do row (icone, chevron) ANTES do drop, limpando o
        // state. Como o drop so' chega aqui se passou pelo dragover
        // (que ja' validou via preventDefault), e canMoveIntoThisFolder
        // e' sync (depende so' do dragPath/node), basta confiar nele.
        if (
          node.type === "folder" &&
          draggedPath &&
          canMoveIntoFolder(draggedPath, node.path)
        ) {
          e.preventDefault();
          e.stopPropagation();
          onMoveToFolder(draggedPath, node.path);
          return;
        }
        // FILE → reorder. Mesmo principio: nao depende de dragOverPath
        // hover state, que poderia ter sido limpado pelo dragleave race.
        if (
          node.type === "file" &&
          draggedPath &&
          siblingPaths.includes(draggedPath) &&
          draggedPath !== node.path
        ) {
          e.preventDefault();
          e.stopPropagation();
          onReorder(node.path);
        }
      }}
      onDragEnd={onDragEnd}
      onMouseDown={startFolderPointerDrag}
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
        "flex items-center gap-1.5 py-[3px] px-2 rounded-sm mx-1 group relative",
        "transition-colors text-[0.8125rem]",
        node.type === "folder" ? "cursor-default" : "cursor-pointer",
        isActive && "font-medium",
      )}
      style={{
        paddingLeft: `${8 + depth * 14}px`,
        background: bg,
        color: fg,
        // Item sendo arrastado fica meio-transparente como feedback.
        opacity: dragPath === node.path ? 0.4 : 1,
        // Indicador visual de drop: linha fina no topo do alvo,
        // sinaliza "vai entrar antes deste item".
        boxShadow: showDropIndicator
          ? "inset 0 2px 0 0 var(--accent)"
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
      <span className="truncate">
        {node.name.replace(/\.md$/, "").replace(/\.txt$/, "")}
      </span>
    </div>
  );
}

interface FileTreeProps {
  nodes: FileNode[];
  depth: number;
  activeFilePath: string | null;
  onToggle: (path: string) => void;
  onContextMenu: (node: FileNode, x: number, y: number) => void;
  // ─── drag-and-drop ───
  dragPath: string | null;
  dragPathRef: React.MutableRefObject<string | null>;
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
  /** Move pra OUTRA pasta (drop dentro de folder diferente do parent). */
  onMoveToFolder: (draggedPath: string, folderPath: string) => void;
}

function FileTree({
  nodes,
  depth,
  activeFilePath,
  onToggle,
  onContextMenu,
  dragPath,
  dragPathRef,
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

  // `siblingNames` e' o snapshot da ordem atual desta pasta — passado
  // pro reorder pra que o JSON saiba como inicializar essa pasta caso
  // ainda nao tinha custom order. `siblingPaths` (paths absolutos) e'
  // computado UMA vez por render do FileTree, nao por iteracao do
  // .map — antes era `nodes.map((n) => n.path)` dentro de cada linha,
  // criando arrays redundantes O(N) por nivel.
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
            onOpen={() => {
              if (node.type === "folder") onToggle(node.path);
              else openFile(node.path, node.name, { tab: "replace" });
            }}
            onOpenInBackground={() => {
              // Middle-click em arquivo abre nova aba SEM tirar o foco
              // do arquivo atual. Convencao de browser. Pasta nao tem
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
            dragPathRef={dragPathRef}
            dragOverPath={dragOverPath}
            dragOverFolder={dragOverFolder}
            siblingPaths={siblingPaths}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragOverFolder={onDragOverFolder}
            onDragEnd={onDragEnd}
            onReorder={(targetPath) => {
              const draggedPath = dragPathRef.current ?? dragPath;
              if (!draggedPath) return;
              onReorder(draggedPath, targetPath, siblingNames);
            }}
            onMoveToFolder={onMoveToFolder}
          />

          {node.type === "folder" && node.expanded && node.children && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              dragPath={dragPath}
              dragPathRef={dragPathRef}
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
      className="fixed z-50 min-w-[160px] rounded-md py-1 text-[0.78rem]"
      style={{
        left: menu.x,
        top: menu.y,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-md)",
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
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
      style={{ background: bg, color: fg }}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      {label}
    </button>
  );
}

/**
 * Lista flat de arquivos que tem a tag ativa. Substitui a arvore de
 * pastas quando ha filtro — abandonar a estrutura hierarquica simplifica
 * implementacao e o resultado UX faz sentido: "estou navegando por tag,
 * nao por organizacao fisica do disco".
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
  // Mantemos a ordem da arvore (alfabetica + folders first), so' filtramos.
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
