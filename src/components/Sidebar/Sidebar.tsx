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

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null; // null → raiz
}

export function Sidebar() {
  const { fileTree, rootFolder, activeFilePath, toggleFolder } = useAppStore();
  const openPrompt = useAppStore((s) => s.openPrompt);
  const openConfirm = useAppStore((s) => s.openConfirm);
  const { openFolder, refresh, createFile, createFolder, renameNode, deleteNode } =
    useFileSystem();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

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
}: {
  node: FileNode;
  depth: number;
  isActive: boolean;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = isActive
    ? "var(--bg-selected)"
    : hovered
    ? "var(--bg-hover)"
    : "transparent";
  const fg =
    node.type === "folder" ? "var(--text-primary)" : "var(--text-secondary)";

  return (
    <div
      draggable={node.type === "file"}
      onDragStart={(e) => {
        if (node.type !== "file") return;
        const payload = JSON.stringify({ path: node.path, name: node.name });
        e.dataTransfer.setData(SCENE_DND_MIME, payload);
        e.dataTransfer.setData("text/plain", node.name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={clsx(
        "flex items-center gap-1.5 py-[3px] px-2 cursor-pointer rounded-sm mx-1 group",
        "transition-colors text-[0.8125rem]",
        isActive && "font-medium",
      )}
      style={{
        paddingLeft: `${8 + depth * 14}px`,
        background: bg,
        color: fg,
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

function FileTree({
  nodes,
  depth,
  activeFilePath,
  onToggle,
  onContextMenu,
}: {
  nodes: FileNode[];
  depth: number;
  activeFilePath: string | null;
  onToggle: (path: string) => void;
  onContextMenu: (node: FileNode, x: number, y: number) => void;
}) {
  const { openFile } = useFileSystem();

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
          />

          {node.type === "folder" && node.expanded && node.children && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
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
