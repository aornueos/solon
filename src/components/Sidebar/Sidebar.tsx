import { useEffect, useState } from "react";
import {
  FolderOpen,
  File,
  ChevronRight,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { SCENE_DND_MIME } from "../../types/canvas";
import clsx from "clsx";

const SIDEBAR_DND_MIME = "application/x-solon-sidebar-node";

function normalizeTreePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isSameOrDescendantPath(targetPath: string, sourcePath: string): boolean {
  const target = normalizeTreePath(targetPath);
  const source = normalizeTreePath(sourcePath);
  return target === source || target.startsWith(`${source}/`);
}

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
  const { fileTree, rootFolder, activeFilePath, toggleFolder } = useAppStore();
  const openPrompt = useAppStore((s) => s.openPrompt);
  const openConfirm = useAppStore((s) => s.openConfirm);
  const { openFolder, refresh, createFile, createFolder, renameNode, deleteNode, reorderItem, moveItem } =
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
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

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
          {rootFolder ? rootFolder.split(/[\\/]/).pop() : "Explorador"}
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

      {/* Árvore de arquivos */}
      <div
        className="flex-1 overflow-y-auto py-1"
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
        ) : (
          <FileTree
            nodes={fileTree}
            depth={0}
            activeFilePath={activeFilePath}
            onToggle={toggleFolder}
            onContextMenu={(node, x, y) => setMenu({ x, y, node })}
            dragPath={dragPath}
            dragOverPath={dragOverPath}
            dragOverFolder={dragOverFolder}
            onDragStart={setDragPath}
            onDragOver={setDragOverPath}
            onDragOverFolder={setDragOverFolder}
            onDragEnd={() => {
              setDragPath(null);
              setDragOverPath(null);
              setDragOverFolder(null);
            }}
            onReorder={(draggedPath, targetPath, siblings) => {
              reorderItem(draggedPath, targetPath, siblings);
              setDragPath(null);
              setDragOverPath(null);
              setDragOverFolder(null);
            }}
            onMoveToFolder={(draggedPath, folderPath) => {
              moveItem(draggedPath, folderPath);
              setDragPath(null);
              setDragOverPath(null);
              setDragOverFolder(null);
            }}
          />
        )}
      </div>

      {/* Menu de contexto */}
      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
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
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragPath: string | null;
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

  // Regra de drop por TIPO do alvo:
  //  - Drop em FILE → reorder (so' dentro do mesmo parent)
  //  - Drop em FOLDER → move-into SEMPRE (independente de ser sibling)
  //
  // Antes a gente bloqueava move se folder destino era sibling, o que
  // impedia "arrastar pasta A pra dentro de pasta B" no mesmo nivel.
  // Agora pra reorder voce solta em arquivo; pra mover pra dentro
  // de pasta, solta na pasta. Conflito impossivel — file != folder.
  const isSameParent = !!dragPath && siblingPaths.includes(dragPath);
  const canMoveIntoThisFolder =
    node.type === "folder" &&
    !!dragPath &&
    !isSameOrDescendantPath(node.path, dragPath);

  const showDropIndicator =
    isSameParent &&
    node.type === "file" &&
    dragOverPath === node.path &&
    dragPath !== node.path;
  const showFolderDropHighlight =
    canMoveIntoThisFolder && dragOverFolder === node.path;

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
      draggable
      onDragStart={(e) => {
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
      onDragOver={(e) => {
        const draggedPath = dragPath ?? getSidebarDragPath(e);
        const isSidebarDrag =
          !!dragPath || Array.from(e.dataTransfer.types).includes(SIDEBAR_DND_MIME);
        const canDropOnFolder =
          node.type === "folder" &&
          isSidebarDrag &&
          (!draggedPath || !isSameOrDescendantPath(node.path, draggedPath));

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
        if (
          node.type === "file" &&
          isSameParent &&
          dragPath !== node.path
        ) {
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
        const draggedPath = dragPath ?? getSidebarDragPath(e);
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
          !isSameOrDescendantPath(node.path, draggedPath)
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
          isSameParent &&
          dragPath &&
          dragPath !== node.path
        ) {
          e.preventDefault();
          e.stopPropagation();
          onReorder(node.path);
        }
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={clsx(
        "flex items-center gap-1.5 py-[3px] px-2 cursor-pointer rounded-sm mx-1 group relative",
        "transition-colors text-[0.8125rem]",
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
                ? "var(--accent)"
                : "var(--text-placeholder)",
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
  // ainda nao tinha custom order.
  const siblingNames = nodes.map((n) => n.name);

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
              else openFile(node.path, node.name);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(node, e.clientX, e.clientY);
            }}
            dragPath={dragPath}
            dragOverPath={dragOverPath}
            dragOverFolder={dragOverFolder}
            siblingPaths={nodes.map((n) => n.path)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragOverFolder={onDragOverFolder}
            onDragEnd={onDragEnd}
            onReorder={(targetPath) => {
              if (!dragPath) return;
              onReorder(dragPath, targetPath, siblingNames);
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
  onRename,
  onDelete,
  rootFolder,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
  rootFolder: string | null;
}) {
  const { node } = menu;
  const items: { label: string; icon: React.ReactNode; action: () => void; danger?: boolean }[] = [];

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
