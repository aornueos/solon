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

/**
 * Item de context menu custom. Pode ser uma acao normal, um separador
 * (linha horizontal), ou um item-toggle (checkbox-like).
 *
 * `disabled` desabilita o click e baixa opacity. `danger` deixa em
 * vermelho (pra Excluir, etc). `shortcut` mostra o atalho a' direita.
 */
export type ContextMenuItem =
  | {
      kind?: "action";
      label: string;
      onClick: () => void;
      icon?: React.ReactNode;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean; // se presente, mostra check ao lado quando true
    }
  | { kind: "separator" };

/** Context menu ativo — coordenadas em viewport (clientX/Y).
 *  `id` permite que callers async (ex: spellcheck no worker) atualizem
 *  os items DESTE menu especifico via `updateContextMenuItems(id, ...)`,
 *  sem risco de sobrescrever o menu errado se o user fechou e abriu
 *  outro no meio do round-trip. */
export interface ActiveContextMenu {
  id: string;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Estado do sistema de update.
 *  - `idle`: nada a fazer (boot inicial ou apos check vazio).
 *  - `checking`: requisicao em andamento.
 *  - `available`: tem versao nova; UI mostra banner/indicator.
 *  - `downloading`: baixando bundle (com progress 0..1).
 *  - `ready`: bundle instalado, esperando user clicar "Reiniciar".
 *  - `error`: ultima checagem falhou (silencioso na UI; so log).
 */
export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes: string;
  date?: string;
};

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; progress: number }
  | { kind: "ready"; info: UpdateInfo }
  | { kind: "error"; message: string };

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
  /** Estado do sistema de update (auto-update via @tauri-apps/plugin-updater). */
  updateStatus: UpdateStatus;
  /** Dialog de release notes — quando true, AppLayout monta UpdateNotesDialog. */
  showUpdateDialog: boolean;
  /** Estado do auto-save — usado pela StatusBar pra dar feedback discreto.
   *  `dirty`: ha alteracoes no buffer que ainda nao foram persistidas.
   *  `saving`: write em andamento.
   *  `saved`: ultima escrita teve sucesso (timestamp em `lastSavedAt`).
   *  `idle`: sem arquivo ou nada mudou desde o ultimo load. */
  saveStatus: "idle" | "dirty" | "saving" | "saved";
  /** Timestamp da ultima escrita bem-sucedida (epoch ms), null se nunca salvou. */
  lastSavedAt: number | null;

  /** Estatisticas agregadas do projeto inteiro — calculadas pela HomePage
   *  varrendo todos os .md/.txt da fileTree. `null` enquanto computa ou
   *  quando nao ha pasta. Cache invalida quando o fileTree muda. */
  projectStats: { wordCount: number; fileCount: number } | null;

  // ─── Preferencias do usuario (persistidas em localStorage) ───
  /** Zoom do texto do editor — 75..200, default 100. Multiplicador
   *  aplicado via CSS var `--editor-zoom` no .ProseMirror. */
  editorZoom: number;
  /** Liga/desliga auto-save (so afeta o debounce; Ctrl+S sempre salva). */
  autoSaveEnabled: boolean;
  /** Liga/desliga check de update no boot. Tambem valido pra ja' marcar
   *  "nao quero saber sobre updates" e suprimir o banner. */
  autoCheckUpdates: boolean;
  /** Visibilidade do dialog de preferencias. */
  showSettings: boolean;
  /** Context menu ativo (custom, substitui o nativo do WebView). */
  activeContextMenu: ActiveContextMenu | null;
  /** Liga/desliga spellcheck visual (red underlines) no editor. */
  spellcheckEnabled: boolean;

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
  setUpdateStatus: (s: UpdateStatus) => void;
  setUpdateProgress: (progress: number) => void;
  openUpdateDialog: () => void;
  closeUpdateDialog: () => void;
  setSaveStatus: (s: AppState["saveStatus"]) => void;
  setProjectStats: (s: { wordCount: number; fileCount: number } | null) => void;
  setEditorZoom: (zoom: number) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoCheckUpdates: (v: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  /** Reset de todas as preferencias pro default (zoom 100%, theme light,
   *  auto-save on, etc). Usado pelo botao "Restaurar padroes". */
  resetSettings: () => void;
  /** Abre context menu e retorna id unico — uso em fluxos async (ex:
   *  spellcheck) que precisam atualizar items DESTE menu sem risco de
   *  sobrescrever outro que tenha sido aberto no meio do caminho. */
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => string;
  /** Substitui items do menu identificado por `id`. Se o id nao bate
   *  com o menu ativo (foi fechado/trocado), no-op — protege de races. */
  updateContextMenuItems: (id: string, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
  setSpellcheckEnabled: (v: boolean) => void;
}

const THEME_KEY = "solon:theme";
function loadTheme(): "light" | "dark" {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {}
  return "light";
}

// Defaults explicitos pra preferencias — usados na inicializacao e em
// `resetSettings`. Em um lugar so pra evitar dessincronia.
const DEFAULT_EDITOR_ZOOM = 100;
const DEFAULT_AUTO_SAVE = true;
const DEFAULT_AUTO_CHECK_UPDATES = true;
const DEFAULT_SPELLCHECK = true;
const EDITOR_ZOOM_KEY = "solon:editorZoom";
const AUTO_SAVE_KEY = "solon:autoSave";
const AUTO_CHECK_UPDATES_KEY = "solon:autoCheckUpdates";
const SPELLCHECK_KEY = "solon:spellcheck";

function loadEditorZoom(): number {
  try {
    const v = localStorage.getItem(EDITOR_ZOOM_KEY);
    if (!v) return DEFAULT_EDITOR_ZOOM;
    const n = parseInt(v, 10);
    // Clamp defensivo — entrada invalida (NaN, fora de range) cai no default
    if (Number.isNaN(n) || n < 75 || n > 200) return DEFAULT_EDITOR_ZOOM;
    return n;
  } catch {
    return DEFAULT_EDITOR_ZOOM;
  }
}

function loadBoolPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
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
  updateStatus: { kind: "idle" },
  showUpdateDialog: false,
  saveStatus: "idle",
  lastSavedAt: null,
  projectStats: null,
  editorZoom: loadEditorZoom(),
  autoSaveEnabled: loadBoolPref(AUTO_SAVE_KEY, DEFAULT_AUTO_SAVE),
  autoCheckUpdates: loadBoolPref(AUTO_CHECK_UPDATES_KEY, DEFAULT_AUTO_CHECK_UPDATES),
  showSettings: false,
  activeContextMenu: null,
  spellcheckEnabled: loadBoolPref(SPELLCHECK_KEY, DEFAULT_SPELLCHECK),

  setActiveFile: (path, name, body, meta) => {
    // Persiste o ultimo arquivo aberto pra "Continuar" na HomePage e
    // restore no proximo boot. Mesmo padrao do `solon:rootFolder` mais
    // acima — chave separada porque arquivo pode mudar com mais
    // frequencia que pasta.
    try {
      localStorage.setItem("solon:lastFile", path);
    } catch {
      /* storage cheio ou bloqueado — ignora */
    }
    set({
      activeFilePath: path,
      activeFileName: name,
      fileBody: body,
      sceneMeta: meta,
    });
  },

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

  setUpdateStatus: (s) => set({ updateStatus: s }),

  // Patch parcial — so muda progresso se a gente esta no estado downloading.
  // Outros estados ignoram pra evitar race (ex: status virou `ready` mas
  // um event de progress velho chegou depois).
  setUpdateProgress: (progress) =>
    set((s) => {
      if (s.updateStatus.kind !== "downloading") return {};
      return {
        updateStatus: { ...s.updateStatus, progress },
      };
    }),

  openUpdateDialog: () => set({ showUpdateDialog: true }),
  closeUpdateDialog: () => set({ showUpdateDialog: false }),

  setSaveStatus: (s) =>
    set((curr) => ({
      saveStatus: s,
      // `lastSavedAt` so atualiza no transition pra "saved" — assim a
      // StatusBar pode mostrar "Salvo ha 12s" usando esse timestamp.
      lastSavedAt: s === "saved" ? Date.now() : curr.lastSavedAt,
    })),

  setProjectStats: (s) => set({ projectStats: s }),

  setEditorZoom: (zoom) => {
    const clamped = Math.max(75, Math.min(200, Math.round(zoom)));
    try {
      localStorage.setItem(EDITOR_ZOOM_KEY, String(clamped));
    } catch {
      /* ignora */
    }
    set({ editorZoom: clamped });
  },

  setAutoSaveEnabled: (v) => {
    try {
      localStorage.setItem(AUTO_SAVE_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ autoSaveEnabled: v });
  },

  setAutoCheckUpdates: (v) => {
    try {
      localStorage.setItem(AUTO_CHECK_UPDATES_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ autoCheckUpdates: v });
  },

  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),

  resetSettings: () => {
    // Apaga todas as chaves de pref do localStorage e reseta o state pros
    // defaults. Theme nao entra aqui — e' uma pref "vivendo" no proprio
    // OS (dark mode preference) e o user pode estar em dark deliberadamente.
    try {
      localStorage.removeItem(EDITOR_ZOOM_KEY);
      localStorage.removeItem(AUTO_SAVE_KEY);
      localStorage.removeItem(AUTO_CHECK_UPDATES_KEY);
      localStorage.removeItem(SPELLCHECK_KEY);
    } catch {
      /* ignora */
    }
    set({
      editorZoom: DEFAULT_EDITOR_ZOOM,
      autoSaveEnabled: DEFAULT_AUTO_SAVE,
      autoCheckUpdates: DEFAULT_AUTO_CHECK_UPDATES,
      spellcheckEnabled: DEFAULT_SPELLCHECK,
    });
  },

  openContextMenu: (x, y, items) => {
    // Id legivel + uniqueness o suficiente — Math.random + base36 da uns
    // 11 chars de entropia. Nao precisa ser cripto-seguro; so' precisa
    // distinguir menus consecutivos.
    const id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    set({ activeContextMenu: { id, x, y, items } });
    return id;
  },

  updateContextMenuItems: (id, items) =>
    set((s) => {
      // Race protection: se o menu fechou ou foi substituido por outro
      // entre o openContextMenu e o updateContextMenuItems, nao
      // queremos sobrescrever o menu novo com items velhos.
      if (!s.activeContextMenu || s.activeContextMenu.id !== id) return s;
      return { activeContextMenu: { ...s.activeContextMenu, items } };
    }),

  closeContextMenu: () => set({ activeContextMenu: null }),

  setSpellcheckEnabled: (v) => {
    try {
      localStorage.setItem(SPELLCHECK_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ spellcheckEnabled: v });
  },
}));

function toggleNodeExpanded(nodes: FileNode[], path: string): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) return { ...node, expanded: !node.expanded };
    if (node.children)
      return { ...node, children: toggleNodeExpanded(node.children, path) };
    return node;
  });
}
