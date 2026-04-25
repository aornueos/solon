import { create } from "zustand";
import { SceneMeta } from "../types/scene";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  expanded?: boolean;
}

export interface HeadingItem {
  level: number;
  text: string;
  pos: number;
}

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
  /** Timestamp de auto-dismiss (ms epoch). */
  expiresAt: number;
}

/**
 * Dialog modal ativo — usado em vez de `window.prompt/confirm` (que
 * renderizam fora do tema do app e quebram o feeling editorial).
 *
 * A store guarda a função `resolve` da Promise criada por `openPrompt` /
 * `openConfirm`, pra que a UI possa fechar o dialog de forma assíncrona
 * (Enter/click-confirm → resolve com valor; Esc/click-cancel → resolve
 * com null/false).
 */
export interface ActiveDialog {
  id: number;
  kind: "prompt" | "confirm";
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Resolve string (prompt) ou "" (confirm ok) / null (cancel). */
  resolve: (value: string | null) => void;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AppState {
  // Arquivo ativo
  activeFilePath: string | null;
  activeFileName: string | null;
  /** Corpo do arquivo SEM o frontmatter (o que vai pro editor). */
  fileBody: string;
  /** Metadados parseados do frontmatter. Editável via Inspector. */
  sceneMeta: SceneMeta;

  // Pastas abertas
  rootFolder: string | null;
  fileTree: FileNode[];

  // Outline
  headings: HeadingItem[];

  // UI state
  sidebarWidth: number;
  outlineWidth: number;
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isInspectorOpen: boolean;
  focusMode: boolean;
  wordCount: number;
  charCount: number;
  /** Visão principal — home (landing), editor de texto, ou canvas storyboard.
   *  "home" e o estado inicial e o destino do clique no wordmark "Solon"
   *  na titlebar; os outros sao acionados por abrir um arquivo / atalhos. */
  activeView: "home" | "editor" | "canvas";
  /** Tema da interface (light sépia / dark sépia escuro). */
  theme: "light" | "dark";
  /** Notificações transientes mostradas na StatusBar. */
  toasts: Toast[];
  /** Dialog modal ativo (prompt/confirm in-app). */
  activeDialog: ActiveDialog | null;

  // Actions
  setActiveFile: (path: string, name: string, body: string, meta: SceneMeta) => void;
  setFileBody: (body: string) => void;
  setSceneMeta: (meta: SceneMeta) => void;
  patchSceneMeta: (patch: Partial<SceneMeta>) => void;
  setRootFolder: (path: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  setHeadings: (headings: HeadingItem[]) => void;
  toggleFolder: (path: string) => void;
  setSidebarWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  toggleInspector: () => void;
  toggleFocusMode: () => void;
  setActiveView: (v: "home" | "editor" | "canvas") => void;
  toggleActiveView: () => void;
  setWordCount: (w: number, c: number) => void;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  pushToast: (kind: Toast["kind"], message: string, ttlMs?: number) => void;
  dismissToast: (id: number) => void;
  openPrompt: (opts: PromptOptions) => Promise<string | null>;
  openConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  closeDialog: (value: string | null) => void;
}

const THEME_KEY = "solon:theme";
function loadTheme(): "light" | "dark" {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {}
  return "light";
}

export const useAppStore = create<AppState>((set) => ({
  activeFilePath: null,
  activeFileName: null,
  fileBody: "",
  sceneMeta: {},
  rootFolder: null,
  fileTree: [],
  headings: [],
  sidebarWidth: 240,
  outlineWidth: 260,
  isSidebarOpen: true,
  isOutlineOpen: true,
  isInspectorOpen: true,
  focusMode: false,
  wordCount: 0,
  charCount: 0,
  activeView: "home",
  theme: loadTheme(),
  toasts: [],
  activeDialog: null,

  setActiveFile: (path, name, body, meta) =>
    set({
      activeFilePath: path,
      activeFileName: name,
      fileBody: body,
      sceneMeta: meta,
    }),

  setFileBody: (body) => set({ fileBody: body }),

  setSceneMeta: (meta) => set({ sceneMeta: meta }),

  patchSceneMeta: (patch) =>
    set((s) => ({ sceneMeta: { ...s.sceneMeta, ...patch } })),

  setRootFolder: (path) => {
    try {
      localStorage.setItem("solon:rootFolder", path);
    } catch {}
    set({ rootFolder: path });
  },

  setFileTree: (tree) => set({ fileTree: tree }),

  setHeadings: (headings) => set({ headings }),

  toggleFolder: (path) =>
    set((state) => ({
      fileTree: toggleNodeExpanded(state.fileTree, path),
    })),

  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setOutlineWidth: (w) => set({ outlineWidth: w }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  toggleInspector: () => set((s) => ({ isInspectorOpen: !s.isInspectorOpen })),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setActiveView: (v) => set({ activeView: v }),
  toggleActiveView: () =>
    set((s) => ({ activeView: s.activeView === "editor" ? "canvas" : "editor" })),
  setWordCount: (w, c) => set({ wordCount: w, charCount: c }),

  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
    set({ theme: t });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      return { theme: next };
    }),

  pushToast: (kind, message, ttlMs = 4000) =>
    set((s) => {
      // `Date.now()` pode colidir se dois toasts caírem no mesmo ms (raro),
      // então somamos um offset pequeno quando isso acontece.
      let id = Date.now();
      while (s.toasts.some((t) => t.id === id)) id += 1;
      return {
        toasts: [...s.toasts, { id, kind, message, expiresAt: id + ttlMs }],
      };
    }),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Dialogs in-app (substituem window.prompt/confirm nativos, que quebram
  // o feeling do editor). A Promise é resolvida quando o DialogLayer
  // chama `closeDialog(value)` — `null` = cancel, string/"" = confirm.
  openPrompt: (opts) =>
    new Promise<string | null>((resolve) => {
      set({
        activeDialog: {
          id: Date.now(),
          kind: "prompt",
          title: opts.title,
          message: opts.message,
          defaultValue: opts.defaultValue,
          placeholder: opts.placeholder,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          resolve,
        },
      });
    }),

  openConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        activeDialog: {
          id: Date.now(),
          kind: "confirm",
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          danger: opts.danger,
          // Confirm nunca retorna string pro caller — a gente mapeia
          // null → false, qualquer outra coisa → true.
          resolve: (v) => resolve(v !== null),
        },
      });
    }),

  closeDialog: (value) =>
    set((s) => {
      s.activeDialog?.resolve(value);
      return { activeDialog: null };
    }),
}));

function toggleNodeExpanded(nodes: FileNode[], path: string): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) return { ...node, expanded: !node.expanded };
    if (node.children)
      return { ...node, children: toggleNodeExpanded(node.children, path) };
    return node;
  });
}
