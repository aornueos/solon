import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderOpen,
  Home,
  LayoutGrid,
  MousePointer2,
  Pencil,
  Search,
  Settings,
  Type,
  MoveUpRight,
  Eraser,
  Focus,
  PanelLeft,
  ListTree,
  Info,
  Plus,
  FileDown,
  Palette,
  Maximize2,
  ShieldCheck,
} from "lucide-react";
import { EDITOR_PAPERS, useAppStore, FileNode } from "../../store/useAppStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { toggleAppFullscreen } from "../../lib/windows";
import { CanvasTool } from "../../types/canvas";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: React.ReactNode;
  run: () => void | Promise<void>;
};

const TOOL_COMMANDS: { tool: CanvasTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Canvas: selecionar", icon: <MousePointer2 size={15} /> },
  { tool: "arrow", label: "Canvas: seta", icon: <MoveUpRight size={15} /> },
  { tool: "draw", label: "Canvas: desenhar", icon: <Pencil size={15} /> },
  { tool: "text", label: "Canvas: texto", icon: <Type size={15} /> },
  { tool: "eraser", label: "Canvas: borracha", icon: <Eraser size={15} /> },
];

function cycleVisualTheme() {
  const state = useAppStore.getState();
  const currentIndex = EDITOR_PAPERS.findIndex(
    (option) => option.value === state.editorPaper,
  );
  const next =
    EDITOR_PAPERS[(currentIndex + 1) % EDITOR_PAPERS.length] ?? EDITOR_PAPERS[0];
  state.setEditorPaper(next.value);
  state.pushToast("info", `Tema visual: ${next.label}`, 1600);
}

export function CommandPalette() {
  const open = useAppStore((s) => s.showCommandPalette);
  const close = useAppStore((s) => s.closeCommandPalette);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleReadingMode = useAppStore((s) => s.toggleReadingMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleOutline = useAppStore((s) => s.toggleOutline);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const openSettings = useAppStore((s) => s.openSettings);
  const openGlobalSearch = useAppStore((s) => s.openGlobalSearch);
  const openLocalHistory = useAppStore((s) => s.openLocalHistory);
  const openWorkspaceHealth = useAppStore((s) => s.openWorkspaceHealth);
  const openExport = useAppStore((s) => s.openExport);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const openScratchpad = useAppStore((s) => s.openScratchpad);
  const setFileTree = useAppStore((s) => s.setFileTree);
  const setTool = useCanvasStore((s) => s.setTool);
  const addCard = useCanvasStore((s) => s.addCard);
  const { openFile, openFolder, createUntitled } = useFileSystem();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const fileCommands = useMemo(
    () => {
      const files = flattenFiles(fileTree).map<CommandItem>((file) => ({
        id: `file:${file.path}`,
        label: file.name.replace(/\.(md|txt)$/i, ""),
        hint: compactPath(file.path),
        keywords: `${file.name} ${file.path}`,
        icon: <FileText size={15} />,
        run: async () => {
          await openFile(file.path, file.name, { tab: "replace" });
          setActiveView("editor");
        },
      }));
      const folders = flattenFolders(fileTree).map<CommandItem>((folder) => ({
        id: `folder:${folder.path}`,
        label: folder.name,
        hint: `Pasta · ${compactPath(folder.path)}`,
        keywords: `${folder.name} ${folder.path} pasta folder`,
        icon: <FolderOpen size={15} />,
        run: () => {
          setFileTree(expandFolderPath(useAppStore.getState().fileTree, folder.path));
          useAppStore.setState({ isSidebarOpen: true });
        },
      }));
      return [...files, ...folders];
    },
    [fileTree, openFile, setActiveView, setFileTree],
  );

  const baseCommands = useMemo<CommandItem[]>(
    () => [
      {
        id: "new-note",
        label: "Nova nota vazia",
        hint: "Ctrl+T",
        icon: <Plus size={15} />,
        run: createUntitled,
      },
      {
        id: "scratchpad",
        label: "Abrir scratchpad",
        hint: "Ctrl+Shift+N",
        icon: <Pencil size={15} />,
        run: openScratchpad,
      },
      {
        id: "reopen-tab",
        label: "Reabrir última aba fechada",
        hint: "Ctrl+Shift+T",
        icon: <FileText size={15} />,
        run: async () => {
          const tab = useAppStore.getState().reopenClosedTab();
          if (tab) await openFile(tab.path, tab.name, { tab: "preserve" });
        },
      },
      {
        id: "open-folder",
        label: "Abrir pasta",
        hint: "Trocar projeto",
        icon: <FolderOpen size={15} />,
        run: openFolder,
      },
      {
        id: "home",
        label: "Ir para inicio",
        hint: "Ctrl+3",
        icon: <Home size={15} />,
        run: () => setActiveView("home"),
      },
      {
        id: "editor",
        label: "Ir para editor",
        hint: "Ctrl+1",
        icon: <FileText size={15} />,
        run: () => setActiveView("editor"),
      },
      {
        id: "canvas",
        label: "Ir para canvas",
        hint: "Ctrl+2",
        icon: <LayoutGrid size={15} />,
        run: () => setActiveView("canvas"),
      },
      {
        id: "focus",
        label: "Alternar modo foco",
        hint: "esconde painéis laterais",
        icon: <Focus size={15} />,
        run: toggleFocusMode,
      },
      {
        id: "reading",
        label: "Alternar modo leitura",
        hint: "Ctrl+Shift+R",
        icon: <Focus size={15} />,
        run: toggleReadingMode,
      },
      {
        id: "fullscreen",
        label: "Tela cheia",
        hint: "F11",
        icon: <Maximize2 size={15} />,
        run: () => void toggleAppFullscreen(),
      },
      {
        id: "cycle-theme",
        label: "Alternar tema visual",
        hint: "Ctrl+Shift+L",
        icon: <Palette size={15} />,
        run: cycleVisualTheme,
      },
      {
        id: "typewriter",
        label: "Alternar máquina de escrever",
        hint: "Cursor centralizado",
        icon: <Type size={15} />,
        run: () => {
          const s = useAppStore.getState();
          s.setTypewriterMode(!s.typewriterMode);
        },
      },
      {
        id: "sidebar",
        label: "Alternar explorador",
        hint: "Ctrl+\\",
        icon: <PanelLeft size={15} />,
        run: toggleSidebar,
      },
      {
        id: "outline",
        label: "Alternar índice",
        hint: "Ctrl+J",
        icon: <ListTree size={15} />,
        run: toggleOutline,
      },
      {
        id: "inspector",
        label: "Alternar inspector",
        hint: "Ctrl+Alt+I",
        icon: <Info size={15} />,
        run: toggleInspector,
      },
      {
        id: "settings",
        label: "Preferências",
        hint: "Ctrl+,",
        icon: <Settings size={15} />,
        run: openSettings,
      },
      {
        id: "global-search",
        label: "Buscar no projeto",
        hint: "Ctrl+Shift+F",
        icon: <Search size={15} />,
        run: openGlobalSearch,
      },
      {
        id: "local-history",
        label: "Histórico local",
        hint: "Ctrl+Alt+H",
        icon: <FileText size={15} />,
        run: openLocalHistory,
      },
      {
        id: "workspace-health",
        label: "Saúde do projeto",
        hint: "links, imagens e notas vazias",
        icon: <ShieldCheck size={15} />,
        run: openWorkspaceHealth,
      },
      {
        id: "export-pdf",
        label: "Exportar para PDF",
        hint: "Ctrl+Shift+E",
        icon: <FileDown size={15} />,
        run: openExport,
      },
      {
        id: "shortcuts",
        label: "Atalhos de teclado",
        hint: "Ctrl+/",
        icon: <Info size={15} />,
        run: openShortcuts,
      },
      {
        id: "canvas-card",
        label: "Canvas: novo card",
        hint: "N",
        icon: <Plus size={15} />,
        run: () => {
          setActiveView("canvas");
          addCard();
        },
      },
      ...TOOL_COMMANDS.map<CommandItem>((cmd, index) => ({
        id: `tool:${cmd.tool}`,
        label: cmd.label,
        hint: activeView === "canvas" ? String(index + 1) : "abre o canvas",
        icon: cmd.icon,
        run: () => {
          setActiveView("canvas");
          setTool(cmd.tool);
        },
      })),
    ],
    [
      activeView,
      addCard,
      createUntitled,
      openFolder,
      openGlobalSearch,
      openLocalHistory,
      openWorkspaceHealth,
      openExport,
      openShortcuts,
      openScratchpad,
      openSettings,
      openFile,
      setActiveView,
      setTool,
      toggleFocusMode,
      toggleReadingMode,
      toggleInspector,
      toggleOutline,
      toggleSidebar,
    ],
  );

  const commands = useMemo(
    () => [...baseCommands, ...fileCommands],
    [baseCommands, fileCommands],
  );
  const normalized = normalize(query);
  const filtered = useMemo(() => {
    if (!normalized) return commands.slice(0, 12);
    return commands
      .filter((item) =>
        normalize(`${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`).includes(
          normalized,
        ),
      )
      .slice(0, 12);
  }, [commands, normalized]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const run = async (item: CommandItem | undefined) => {
    if (!item) return;
    close();
    await item.run();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center px-4 pt-[14vh]"
      style={{ background: "rgba(0,0,0,0.38)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-xl rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) =>
                  filtered.length === 0 ? 0 : Math.min(filtered.length - 1, i + 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void run(filtered[activeIndex]);
              }
            }}
            placeholder="Buscar comando, nota ou pasta..."
            className="flex-1 bg-transparent outline-none text-[0.92rem]"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd
            className="text-[0.65rem] px-1.5 py-0.5 rounded"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              background: "var(--bg-panel-2)",
            }}
          >
            Esc
          </kbd>
        </div>
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {filtered.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-[0.8rem]"
              style={{ color: "var(--text-muted)" }}
            >
              Nenhum comando encontrado.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto py-1">
              {filtered.map((item, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void run(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{
                      background: active ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.82rem] truncate">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span
                          className="block text-[0.68rem] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {item.hint}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") out.push(node);
    if (node.children) out.push(...flattenFiles(node.children));
  }
  return out;
}

function flattenFolders(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "folder") out.push(node);
    if (node.children) out.push(...flattenFolders(node.children));
  }
  return out;
}

function expandFolderPath(nodes: FileNode[], path: string): FileNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.path === path && node.type === "folder") {
      changed = true;
      return { ...node, expanded: true };
    }
    if (!node.children) return node;
    const children = expandFolderPath(node.children, path);
    if (children !== node.children) {
      changed = true;
      return { ...node, expanded: true, children };
    }
    return node;
  });
  return changed ? next : nodes;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}
