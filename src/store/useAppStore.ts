import { create } from "zustand";
import { SceneMeta } from "../types/scene";
import type { CanvasTool } from "../types/canvas";
import type { SidebarOrder } from "../lib/sidebarOrder";

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
  /** Posicao do heading no doc (1-indexed, igual `state.doc`). */
  pos: number;
  /** Posicao do *proximo* heading (ou doc.content.size se for o ultimo).
   *  Usado pra delimitar a secao em reorder/word-count. */
  endPos: number;
  /** Contagem de palavras DA SECAO (heading inclusivo até o proximo
   *  heading exclusivo). Calculado em extractHeadings. */
  wordCount: number;
}

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
  /** Timestamp de auto-dismiss (ms epoch). */
  expiresAt: number;
}

export type EditorFontFamily = "serif" | "sans" | "mono";

/** Variantes de "papel" do editor — vide doc no AppState.editorPaper. */
export type EditorPaper = "default" | "creme" | "sepia" | "gray" | "midnight";

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

/** Aba aberta — pointer pro arquivo. O buffer (`fileBody`/`sceneMeta`)
 *  vive na store no nivel raiz pro arquivo ATIVO; trocar de aba flusha
 *  o save da ativa anterior e re-le' o conteudo da nova. Manter buffers
 *  em memoria pra todas as abas seria caro pra arquivos grandes, e o
 *  feature flag aqui e' "minimalista". */
export interface OpenTab {
  path: string;
  name: string;
}

/** Draft de crash recovery (vindo do lib/crashRecovery). Espelhado aqui
 *  pra evitar import circular na store. */
export interface RecoveryDraftEntry {
  path: string;
  content: string;
  savedAt: number;
}

/** Entrada do histórico de arquivos recém abertos (LRU bound, exibido
 *  na HomePage). Persistido em localStorage. */
export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

interface AppState {
  // Arquivo ativo
  activeFilePath: string | null;
  activeFileName: string | null;
  /** Corpo do arquivo SEM o frontmatter (o que vai pro editor). */
  fileBody: string;
  /** Metadados parseados do frontmatter. Editável via Inspector. */
  sceneMeta: SceneMeta;
  /** Abas abertas. A aba ativa e' aquela cujo `path === activeFilePath`. */
  openTabs: OpenTab[];
  /** Drafts de crash recovery pendentes — settados no boot quando
   *  `scanRecoveryDrafts` encontra divergencias. Dispara o
   *  `RecoveryDialog` no AppLayout enquanto for nao-vazio. */
  pendingRecoveryDrafts: RecoveryDraftEntry[];
  /** Lista LRU de arquivos recém-abertos. Persiste em localStorage,
   *  cap em RECENT_FILES_MAX. Exibido na HomePage abaixo do CTA. */
  recentFiles: RecentFile[];

  // Pastas abertas
  rootFolder: string | null;
  fileTree: FileNode[];
  /** Ordem manual de items no Sidebar (drag-and-drop). Persistida em
   *  `<rootFolder>/.solon/order.json`. Items nao listados ficam ao
   *  fim em ordem alfabetica. */
  sidebarOrder: SidebarOrder;

  // Outline
  headings: HeadingItem[];

  // UI state
  sidebarWidth: number;
  outlineWidth: number;
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isInspectorOpen: boolean;
  focusMode: boolean;
  /** Reading mode — modo "livro": esconde TODO chrome (titlebar,
   *  sidebar, outline, inspector, statusbar, tabbar, editor toolbar).
   *  Sobra so' a coluna do texto. Mais agressivo que focusMode (que
   *  preserva toolbar/statusbar). Pra leitura, revisao, ou imersao
   *  maxima. Esc sai. */
  readingMode: boolean;
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
  /** Dialog de busca global no projeto. */
  showGlobalSearch: boolean;
  /** Dialog de historico local do arquivo ativo. */
  showLocalHistory: boolean;
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
  /** Paleta de comandos rapida (Ctrl+K). */
  showCommandPalette: boolean;
  /** Cheatsheet de atalhos (Ctrl+/). */
  showShortcuts: boolean;
  /** Dialog de export (PDF). */
  showExport: boolean;
  /** Tag ativa de filtro na Sidebar. Quando settada, a Sidebar exibe
   *  apenas arquivos cujo frontmatter inclui essa tag (lista flat,
   *  fora da arvore de pastas). null = sem filtro. */
  activeTagFilter: string | null;
  /** Cache do index de tags (path -> tags[]). Populado pelo
   *  TagFilterPopover quando o user abre o popover, consumido pela
   *  Sidebar pra montar a view filtrada sem re-indexar. null =
   *  ainda nao indexado nesta sessao. */
  tagIndex: Map<string, string[]> | null;
  /** Context menu ativo (custom, substitui o nativo do WebView). */
  activeContextMenu: ActiveContextMenu | null;
  /** Liga/desliga spellcheck visual (red underlines) no editor. */
  spellcheckEnabled: boolean;
  /** Largura maxima da coluna de texto do editor (px). Afeta a "medida"
   *  da linha — escritor pode preferir mais estreito (560-680, classico
   *  livro) ou mais ar (820-1000). Default 680 e' o sweet spot pt-BR. */
  editorMaxWidth: number;
  /** Espacamento vertical do texto do editor. Mantem o layout editorial,
   *  mas deixa o escritor escolher entre denso e confortavel. */
  editorLineHeight: "compact" | "normal" | "relaxed";
  /** Espaco entre paragrafos do texto. Separado de line-height para
   *  permitir texto denso sem perder respiro entre blocos. */
  editorParagraphSpacing: "tight" | "normal" | "airy";
  /** Tamanho do recuo aplicado por Tab em paragrafos. */
  editorIndentSize: "small" | "normal" | "large";
  /** Familia tipografica padrao do editor. */
  editorFontFamily: EditorFontFamily;
  /** "Papel" do editor — substitui SO' o fundo da coluna do texto +
   *  cor do texto, sem mexer no chrome (sidebar/panels). Cria a
   *  sensacao de "livro num plano de fundo de mesa" e deixa o escritor
   *  escolher o tom que combina com a sessao do dia. "default" = usa
   *  o `--bg-app`/`--text-primary` do theme atual. */
  editorPaper: EditorPaper;
  /** Typewriter scrolling — quando ligado, o caret fica no meio
   *  vertical do scroller; o texto eh que escorre por baixo. Padrao
   *  de Ulysses/iA Writer pra concentracao. Padding virtual no topo
   *  e fundo permite centralizar mesmo em docs curtos. */
  typewriterMode: boolean;
  /** Mostra contadores e formato na StatusBar. */
  showStatusStats: boolean;
  /** Mostra caminho completo do arquivo na StatusBar. */
  showStatusPath: boolean;
  /** Preferencias do canvas. */
  canvasGridEnabled: boolean;
  canvasSnapToGrid: boolean;
  canvasGridSize: number;
  canvasDefaultTool: CanvasTool;
  canvasDefaultTextSize: number;
  canvasDefaultDrawWidth: number;
  canvasDefaultColor: string;
  /** Snapshots locais antes de sobrescrever notas. */
  localHistoryEnabled: boolean;
  /** Comportamentos de conveniencia. */
  openLastFileOnStartup: boolean;
  autoExpandMovedFolders: boolean;
  /** View pra qual o app abre no boot. Default 'home' (landing). User
   *  que abre o app varias vezes ao dia pode preferir 'editor' direto. */
  startView: "home" | "editor" | "canvas";

  // Actions
  setActiveFile: (path: string, name: string, body: string, meta: SceneMeta) => void;
  /** Adiciona aba se ainda nao existe. Idempotente — chamado por `openFile`
   *  toda vez. Persiste a lista em localStorage. */
  addTab: (path: string, name: string) => void;
  /** Fecha aba pelo path. Se era a ativa, retorna o path da proxima/anterior
   *  pra que o caller chame `openFile` (precisa de I/O — store nao faz). */
  closeTab: (path: string) => string | null;
  /** Atualiza path/name de uma aba apos rename ou move. */
  renameTab: (oldPath: string, newPath: string, newName: string) => void;
  /** Renomeia em massa quando uma pasta foi movida/renomeada — todos os
   *  paths que comecam com `oldPrefix` sao reescritos. */
  rebaseTabs: (oldPrefix: string, newPrefix: string) => void;
  /** Settar drafts pendentes — usado pelo `restoreLastFolder` apos
   *  varredura de recovery. UI consome via RecoveryDialog. */
  setPendingRecoveryDrafts: (drafts: RecoveryDraftEntry[]) => void;
  /** Limpa a lista (apos user decidir — aceitar ou descartar). */
  clearPendingRecoveryDrafts: () => void;
  /** Registra um arquivo no LRU de recents. Idempotente: se o path ja
   *  esta na lista, sobe pro topo. Cap em RECENT_FILES_MAX. */
  pushRecentFile: (path: string, name: string) => void;
  /** Remove um arquivo do LRU — usado em delete/rename pra nao deixar
   *  entry orfa. */
  removeRecentFile: (path: string) => void;
  setFileBody: (body: string) => void;
  setSceneMeta: (meta: SceneMeta) => void;
  patchSceneMeta: (patch: Partial<SceneMeta>) => void;
  setRootFolder: (path: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  setSidebarOrder: (order: SidebarOrder) => void;
  setHeadings: (headings: HeadingItem[]) => void;
  toggleFolder: (path: string) => void;
  setSidebarWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  toggleInspector: () => void;
  toggleFocusMode: () => void;
  toggleReadingMode: () => void;
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
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
  openLocalHistory: () => void;
  closeLocalHistory: () => void;
  setSaveStatus: (s: AppState["saveStatus"]) => void;
  setProjectStats: (s: { wordCount: number; fileCount: number } | null) => void;
  setEditorZoom: (zoom: number) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoCheckUpdates: (v: boolean) => void;
  setEditorMaxWidth: (w: number) => void;
  setEditorLineHeight: (v: "compact" | "normal" | "relaxed") => void;
  setEditorParagraphSpacing: (v: "tight" | "normal" | "airy") => void;
  setEditorIndentSize: (v: "small" | "normal" | "large") => void;
  setEditorFontFamily: (v: EditorFontFamily) => void;
  setEditorPaper: (v: EditorPaper) => void;
  setTypewriterMode: (v: boolean) => void;
  setShowStatusStats: (v: boolean) => void;
  setShowStatusPath: (v: boolean) => void;
  setCanvasGridEnabled: (v: boolean) => void;
  setCanvasSnapToGrid: (v: boolean) => void;
  setCanvasGridSize: (v: number) => void;
  setCanvasDefaultTool: (v: CanvasTool) => void;
  setCanvasDefaultTextSize: (v: number) => void;
  setCanvasDefaultDrawWidth: (v: number) => void;
  setCanvasDefaultColor: (v: string) => void;
  setLocalHistoryEnabled: (v: boolean) => void;
  setOpenLastFileOnStartup: (v: boolean) => void;
  setAutoExpandMovedFolders: (v: boolean) => void;
  setStartView: (v: "home" | "editor" | "canvas") => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  setActiveTagFilter: (tag: string | null) => void;
  setTagIndex: (index: Map<string, string[]> | null) => void;
  openExport: () => void;
  closeExport: () => void;
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
const OPEN_TABS_KEY = "solon:openTabs";
const RECENT_FILES_KEY = "solon:recentFiles";
const RECENT_FILES_MAX = 8;

function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentFile =>
          r &&
          typeof r.path === "string" &&
          typeof r.name === "string" &&
          typeof r.openedAt === "number",
      )
      .slice(0, RECENT_FILES_MAX);
  } catch {
    return [];
  }
}

function saveRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch {
    /* storage cheio — ignora */
  }
}

function loadOpenTabs(): OpenTab[] {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is OpenTab =>
          t && typeof t.path === "string" && typeof t.name === "string",
      )
      // Defensivo: localStorage pode acumular duplicatas se houve crash
      // entre dois saves sem dedup. Sanitiza no load.
      .filter((t, i, arr) => arr.findIndex((x) => x.path === t.path) === i);
  } catch {
    return [];
  }
}

function saveOpenTabs(tabs: OpenTab[]): void {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
  } catch {
    /* storage cheio — ignora */
  }
}
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
const DEFAULT_EDITOR_MAX_WIDTH = 680;
const DEFAULT_EDITOR_LINE_HEIGHT: "compact" | "normal" | "relaxed" = "normal";
const DEFAULT_EDITOR_PARAGRAPH_SPACING: "tight" | "normal" | "airy" = "normal";
const DEFAULT_EDITOR_INDENT_SIZE: "small" | "normal" | "large" = "normal";
const DEFAULT_EDITOR_FONT_FAMILY: EditorFontFamily = "serif";
const DEFAULT_EDITOR_PAPER: EditorPaper = "default";
const DEFAULT_TYPEWRITER_MODE = false;
const DEFAULT_SHOW_STATUS_STATS = true;
const DEFAULT_SHOW_STATUS_PATH = true;
const DEFAULT_CANVAS_GRID_ENABLED = true;
const DEFAULT_CANVAS_SNAP_TO_GRID = false;
const DEFAULT_CANVAS_GRID_SIZE = 24;
const DEFAULT_CANVAS_TOOL: CanvasTool = "select";
const DEFAULT_CANVAS_TEXT_SIZE = 24;
const DEFAULT_CANVAS_DRAW_WIDTH = 2;
const DEFAULT_CANVAS_COLOR = "";
const DEFAULT_LOCAL_HISTORY_ENABLED = true;
const DEFAULT_OPEN_LAST_FILE_ON_STARTUP = true;
const DEFAULT_AUTO_EXPAND_MOVED_FOLDERS = true;
const DEFAULT_START_VIEW: "home" | "editor" | "canvas" = "home";
const EDITOR_ZOOM_KEY = "solon:editorZoom";
const AUTO_SAVE_KEY = "solon:autoSave";
const AUTO_CHECK_UPDATES_KEY = "solon:autoCheckUpdates";
const SPELLCHECK_KEY = "solon:spellcheck";
const EDITOR_MAX_WIDTH_KEY = "solon:editorMaxWidth";
const EDITOR_LINE_HEIGHT_KEY = "solon:editorLineHeight";
const EDITOR_PARAGRAPH_SPACING_KEY = "solon:editorParagraphSpacing";
const EDITOR_INDENT_SIZE_KEY = "solon:editorIndentSize";
const EDITOR_FONT_FAMILY_KEY = "solon:editorFontFamily";
const EDITOR_PAPER_KEY = "solon:editorPaper";
const TYPEWRITER_MODE_KEY = "solon:typewriterMode";
const SHOW_STATUS_STATS_KEY = "solon:showStatusStats";
const SHOW_STATUS_PATH_KEY = "solon:showStatusPath";
const CANVAS_GRID_ENABLED_KEY = "solon:canvasGridEnabled";
const CANVAS_SNAP_TO_GRID_KEY = "solon:canvasSnapToGrid";
const CANVAS_GRID_SIZE_KEY = "solon:canvasGridSize";
const CANVAS_DEFAULT_TOOL_KEY = "solon:canvasDefaultTool";
const CANVAS_DEFAULT_TEXT_SIZE_KEY = "solon:canvasDefaultTextSize";
const CANVAS_DEFAULT_DRAW_WIDTH_KEY = "solon:canvasDefaultDrawWidth";
const CANVAS_DEFAULT_COLOR_KEY = "solon:canvasDefaultColor";
const LOCAL_HISTORY_ENABLED_KEY = "solon:localHistoryEnabled";
const OPEN_LAST_FILE_ON_STARTUP_KEY = "solon:openLastFileOnStartup";
const AUTO_EXPAND_MOVED_FOLDERS_KEY = "solon:autoExpandMovedFolders";
const START_VIEW_KEY = "solon:startView";

/** Larguras suportadas pra coluna do editor (em px). */
export const EDITOR_MAX_WIDTHS = [560, 680, 820, 1000] as const;
export const EDITOR_LINE_HEIGHTS = [
  { value: "compact", label: "Compacto", css: 1.38 },
  { value: "normal", label: "Normal", css: 1.5 },
  { value: "relaxed", label: "Conforto", css: 1.65 },
] as const;

export type EditorLineHeight = (typeof EDITOR_LINE_HEIGHTS)[number]["value"];

export const EDITOR_PARAGRAPH_SPACING = [
  { value: "tight", label: "Justo", css: "0.22em" },
  { value: "normal", label: "Normal", css: "0.4em" },
  { value: "airy", label: "Aberto", css: "0.72em" },
] as const;

export type EditorParagraphSpacing =
  (typeof EDITOR_PARAGRAPH_SPACING)[number]["value"];

export const EDITOR_INDENT_SIZES = [
  { value: "small", label: "Discreto", css: "1.25em" },
  { value: "normal", label: "Padrão", css: "2em" },
  { value: "large", label: "Amplo", css: "2.75em" },
] as const;

export type EditorIndentSize = (typeof EDITOR_INDENT_SIZES)[number]["value"];

export const EDITOR_FONT_FAMILIES = [
  {
    value: "serif",
    label: "Serifada",
    css: '"Lora", "EB Garamond", Georgia, serif',
  },
  {
    value: "sans",
    label: "Sem serifa",
    css: '"Inter", system-ui, sans-serif',
  },
  {
    value: "mono",
    label: "Courier",
    css: '"Courier New", "JetBrains Mono", monospace',
  },
] as const;

/** Lista canonica de variantes de papel + meta visual.
 *  Hex coordenado com legibilidade: contraste minimo AA pra texto
 *  normal mantido em todos os pares bg/text. */
export const EDITOR_PAPERS = [
  { value: "default" as const, label: "Padrão", hint: "Segue o tema" },
  { value: "creme" as const, label: "Creme", hint: "Papel quente claro" },
  { value: "sepia" as const, label: "Sépia", hint: "Pergaminho" },
  { value: "gray" as const, label: "Cinza", hint: "Neutro frio" },
  { value: "midnight" as const, label: "Noite", hint: "Azul-tinta escuro" },
];

export const CANVAS_GRID_SIZES = [16, 24, 32, 48] as const;
export const CANVAS_TEXT_SIZES = [18, 24, 32, 48] as const;
export const CANVAS_DRAW_WIDTHS = [1.5, 2, 3, 6] as const;
export const CANVAS_DEFAULT_TOOLS: CanvasTool[] = [
  "select",
  "arrow",
  "draw",
  "text",
  "eraser",
];

function loadEditorLineHeight(): EditorLineHeight {
  try {
    const v = localStorage.getItem(EDITOR_LINE_HEIGHT_KEY);
    if (v === "compact" || v === "normal" || v === "relaxed") return v;
  } catch {}
  return DEFAULT_EDITOR_LINE_HEIGHT;
}

function loadEditorParagraphSpacing(): EditorParagraphSpacing {
  try {
    const v = localStorage.getItem(EDITOR_PARAGRAPH_SPACING_KEY);
    if (v === "tight" || v === "normal" || v === "airy") return v;
  } catch {}
  return DEFAULT_EDITOR_PARAGRAPH_SPACING;
}

function loadEditorIndentSize(): EditorIndentSize {
  try {
    const v = localStorage.getItem(EDITOR_INDENT_SIZE_KEY);
    if (v === "small" || v === "normal" || v === "large") return v;
  } catch {}
  return DEFAULT_EDITOR_INDENT_SIZE;
}

function loadEditorFontFamily(): EditorFontFamily {
  try {
    const v = localStorage.getItem(EDITOR_FONT_FAMILY_KEY);
    if (v === "serif" || v === "sans" || v === "mono") return v;
  } catch {}
  return DEFAULT_EDITOR_FONT_FAMILY;
}

function loadEditorPaper(): EditorPaper {
  try {
    const v = localStorage.getItem(EDITOR_PAPER_KEY);
    if (
      v === "default" || v === "creme" || v === "sepia" ||
      v === "gray" || v === "midnight"
    ) return v;
  } catch {}
  return DEFAULT_EDITOR_PAPER;
}

function loadNumberOption<T extends readonly number[]>(
  key: string,
  values: T,
  fallback: T[number],
): T[number] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    return (values as readonly number[]).includes(n) ? (n as T[number]) : fallback;
  } catch {
    return fallback;
  }
}

function loadCanvasTool(): CanvasTool {
  try {
    const v = localStorage.getItem(CANVAS_DEFAULT_TOOL_KEY) as CanvasTool | null;
    if (v && CANVAS_DEFAULT_TOOLS.includes(v)) return v;
  } catch {}
  return DEFAULT_CANVAS_TOOL;
}

function loadStringPref(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function loadEditorMaxWidth(): number {
  try {
    const v = localStorage.getItem(EDITOR_MAX_WIDTH_KEY);
    if (!v) return DEFAULT_EDITOR_MAX_WIDTH;
    const n = parseInt(v, 10);
    if (
      Number.isNaN(n) ||
      !(EDITOR_MAX_WIDTHS as readonly number[]).includes(n)
    ) {
      return DEFAULT_EDITOR_MAX_WIDTH;
    }
    return n;
  } catch {
    return DEFAULT_EDITOR_MAX_WIDTH;
  }
}

function loadStartView(): "home" | "editor" | "canvas" {
  try {
    const v = localStorage.getItem(START_VIEW_KEY);
    if (v === "home" || v === "editor" || v === "canvas") return v;
  } catch {}
  return DEFAULT_START_VIEW;
}

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
  openTabs: loadOpenTabs(),
  pendingRecoveryDrafts: [],
  recentFiles: loadRecentFiles(),
  rootFolder: null,
  fileTree: [],
  sidebarOrder: { version: 1, folders: {} },
  headings: [],
  sidebarWidth: 240,
  outlineWidth: 260,
  isSidebarOpen: true,
  isOutlineOpen: true,
  isInspectorOpen: true,
  focusMode: false,
  readingMode: false,
  wordCount: 0,
  charCount: 0,
  // ActiveView inicial respeita a pref `startView` (default "home").
  // Se o user escolheu abrir direto no editor/canvas, comeca por la'.
  activeView: loadStartView(),
  theme: loadTheme(),
  toasts: [],
  activeDialog: null,
  updateStatus: { kind: "idle" },
  showUpdateDialog: false,
  showGlobalSearch: false,
  showLocalHistory: false,
  saveStatus: "idle",
  lastSavedAt: null,
  projectStats: null,
  editorZoom: loadEditorZoom(),
  autoSaveEnabled: loadBoolPref(AUTO_SAVE_KEY, DEFAULT_AUTO_SAVE),
  autoCheckUpdates: loadBoolPref(AUTO_CHECK_UPDATES_KEY, DEFAULT_AUTO_CHECK_UPDATES),
  showSettings: false,
  showCommandPalette: false,
  showShortcuts: false,
  showExport: false,
  activeTagFilter: null,
  tagIndex: null,
  activeContextMenu: null,
  spellcheckEnabled: loadBoolPref(SPELLCHECK_KEY, DEFAULT_SPELLCHECK),
  editorMaxWidth: loadEditorMaxWidth(),
  editorLineHeight: loadEditorLineHeight(),
  editorParagraphSpacing: loadEditorParagraphSpacing(),
  editorIndentSize: loadEditorIndentSize(),
  editorFontFamily: loadEditorFontFamily(),
  editorPaper: loadEditorPaper(),
  typewriterMode: loadBoolPref(TYPEWRITER_MODE_KEY, DEFAULT_TYPEWRITER_MODE),
  showStatusStats: loadBoolPref(SHOW_STATUS_STATS_KEY, DEFAULT_SHOW_STATUS_STATS),
  showStatusPath: loadBoolPref(SHOW_STATUS_PATH_KEY, DEFAULT_SHOW_STATUS_PATH),
  canvasGridEnabled: loadBoolPref(CANVAS_GRID_ENABLED_KEY, DEFAULT_CANVAS_GRID_ENABLED),
  canvasSnapToGrid: loadBoolPref(CANVAS_SNAP_TO_GRID_KEY, DEFAULT_CANVAS_SNAP_TO_GRID),
  canvasGridSize: loadNumberOption(
    CANVAS_GRID_SIZE_KEY,
    CANVAS_GRID_SIZES,
    DEFAULT_CANVAS_GRID_SIZE,
  ),
  canvasDefaultTool: loadCanvasTool(),
  canvasDefaultTextSize: loadNumberOption(
    CANVAS_DEFAULT_TEXT_SIZE_KEY,
    CANVAS_TEXT_SIZES,
    DEFAULT_CANVAS_TEXT_SIZE,
  ),
  canvasDefaultDrawWidth: loadNumberOption(
    CANVAS_DEFAULT_DRAW_WIDTH_KEY,
    CANVAS_DRAW_WIDTHS,
    DEFAULT_CANVAS_DRAW_WIDTH,
  ),
  canvasDefaultColor: loadStringPref(CANVAS_DEFAULT_COLOR_KEY, DEFAULT_CANVAS_COLOR),
  localHistoryEnabled: loadBoolPref(
    LOCAL_HISTORY_ENABLED_KEY,
    DEFAULT_LOCAL_HISTORY_ENABLED,
  ),
  openLastFileOnStartup: loadBoolPref(
    OPEN_LAST_FILE_ON_STARTUP_KEY,
    DEFAULT_OPEN_LAST_FILE_ON_STARTUP,
  ),
  autoExpandMovedFolders: loadBoolPref(
    AUTO_EXPAND_MOVED_FOLDERS_KEY,
    DEFAULT_AUTO_EXPAND_MOVED_FOLDERS,
  ),
  startView: loadStartView(),

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

  addTab: (path, name) =>
    set((s) => {
      if (s.openTabs.some((t) => t.path === path)) return s;
      const next = [...s.openTabs, { path, name }];
      saveOpenTabs(next);
      return { openTabs: next };
    }),

  closeTab: (path) => {
    let nextActive: string | null = null;
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.path === path);
      if (idx === -1) return s;
      const next = s.openTabs.filter((_, i) => i !== idx);
      saveOpenTabs(next);
      // Se a aba fechada era a ativa, descobre quem assume o foco —
      // proxima a' direita; se nao houver, a' esquerda; se nada, null.
      // Caller faz o openFile com `nextActive`.
      if (s.activeFilePath === path) {
        nextActive =
          next[idx]?.path ?? next[idx - 1]?.path ?? next[next.length - 1]?.path ?? null;
      } else {
        nextActive = s.activeFilePath;
      }
      return { openTabs: next };
    });
    return nextActive;
  },

  renameTab: (oldPath, newPath, newName) =>
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.path === oldPath);
      if (idx === -1) return s;
      const next = s.openTabs.slice();
      next[idx] = { path: newPath, name: newName };
      saveOpenTabs(next);
      return { openTabs: next };
    }),

  rebaseTabs: (oldPrefix, newPrefix) =>
    set((s) => {
      const oldNorm = oldPrefix.replace(/\\/g, "/").replace(/\/+$/, "");
      let changed = false;
      const next = s.openTabs.map((t) => {
        const p = t.path.replace(/\\/g, "/");
        if (p !== oldNorm && !p.startsWith(`${oldNorm}/`)) return t;
        const sep =
          newPrefix.includes("\\") && !newPrefix.includes("/") ? "\\" : "/";
        const rel = p === oldNorm ? "" : p.slice(oldNorm.length + 1);
        const nextPath = rel
          ? `${newPrefix}${sep}${rel.replace(/[\\/]/g, sep)}`
          : newPrefix;
        changed = true;
        return { path: nextPath, name: t.name };
      });
      if (!changed) return s;
      saveOpenTabs(next);
      return { openTabs: next };
    }),

  setPendingRecoveryDrafts: (drafts) => set({ pendingRecoveryDrafts: drafts }),
  clearPendingRecoveryDrafts: () => set({ pendingRecoveryDrafts: [] }),

  pushRecentFile: (path, name) =>
    set((s) => {
      const entry: RecentFile = { path, name, openedAt: Date.now() };
      const next = [
        entry,
        ...s.recentFiles.filter((r) => r.path !== path),
      ].slice(0, RECENT_FILES_MAX);
      saveRecentFiles(next);
      return { recentFiles: next };
    }),

  removeRecentFile: (path) =>
    set((s) => {
      const idx = s.recentFiles.findIndex((r) => r.path === path);
      if (idx === -1) return s;
      const next = s.recentFiles.filter((r) => r.path !== path);
      saveRecentFiles(next);
      return { recentFiles: next };
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
  setSidebarOrder: (order) => set({ sidebarOrder: order }),

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
  toggleReadingMode: () => set((s) => ({ readingMode: !s.readingMode })),
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
  openGlobalSearch: () => set({ showGlobalSearch: true }),
  closeGlobalSearch: () => set({ showGlobalSearch: false }),
  openLocalHistory: () => set({ showLocalHistory: true }),
  closeLocalHistory: () => set({ showLocalHistory: false }),

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
  openCommandPalette: () => set({ showCommandPalette: true }),
  closeCommandPalette: () => set({ showCommandPalette: false }),
  openShortcuts: () => set({ showShortcuts: true }),
  closeShortcuts: () => set({ showShortcuts: false }),
  setActiveTagFilter: (tag) => set({ activeTagFilter: tag }),
  setTagIndex: (idx) => set({ tagIndex: idx }),
  openExport: () => set({ showExport: true }),
  closeExport: () => set({ showExport: false }),
  resetSettings: () => {
    // Apaga todas as chaves de pref do localStorage e reseta o state pros
    // defaults. Theme nao entra aqui — e' uma pref "vivendo" no proprio
    // OS (dark mode preference) e o user pode estar em dark deliberadamente.
    try {
      localStorage.removeItem(EDITOR_ZOOM_KEY);
      localStorage.removeItem(AUTO_SAVE_KEY);
      localStorage.removeItem(AUTO_CHECK_UPDATES_KEY);
      localStorage.removeItem(SPELLCHECK_KEY);
      localStorage.removeItem(EDITOR_MAX_WIDTH_KEY);
      localStorage.removeItem(EDITOR_LINE_HEIGHT_KEY);
      localStorage.removeItem(EDITOR_PARAGRAPH_SPACING_KEY);
      localStorage.removeItem(EDITOR_INDENT_SIZE_KEY);
      localStorage.removeItem(EDITOR_FONT_FAMILY_KEY);
      localStorage.removeItem(EDITOR_PAPER_KEY);
      localStorage.removeItem(TYPEWRITER_MODE_KEY);
      localStorage.removeItem(SHOW_STATUS_STATS_KEY);
      localStorage.removeItem(SHOW_STATUS_PATH_KEY);
      localStorage.removeItem(CANVAS_GRID_ENABLED_KEY);
      localStorage.removeItem(CANVAS_SNAP_TO_GRID_KEY);
      localStorage.removeItem(CANVAS_GRID_SIZE_KEY);
      localStorage.removeItem(CANVAS_DEFAULT_TOOL_KEY);
      localStorage.removeItem(CANVAS_DEFAULT_TEXT_SIZE_KEY);
      localStorage.removeItem(CANVAS_DEFAULT_DRAW_WIDTH_KEY);
      localStorage.removeItem(CANVAS_DEFAULT_COLOR_KEY);
      localStorage.removeItem(LOCAL_HISTORY_ENABLED_KEY);
      localStorage.removeItem(OPEN_LAST_FILE_ON_STARTUP_KEY);
      localStorage.removeItem(AUTO_EXPAND_MOVED_FOLDERS_KEY);
      localStorage.removeItem(START_VIEW_KEY);
    } catch {
      /* ignora */
    }
    set({
      editorZoom: DEFAULT_EDITOR_ZOOM,
      autoSaveEnabled: DEFAULT_AUTO_SAVE,
      autoCheckUpdates: DEFAULT_AUTO_CHECK_UPDATES,
      spellcheckEnabled: DEFAULT_SPELLCHECK,
      editorMaxWidth: DEFAULT_EDITOR_MAX_WIDTH,
      editorLineHeight: DEFAULT_EDITOR_LINE_HEIGHT,
      editorParagraphSpacing: DEFAULT_EDITOR_PARAGRAPH_SPACING,
      editorIndentSize: DEFAULT_EDITOR_INDENT_SIZE,
      editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      editorPaper: DEFAULT_EDITOR_PAPER,
      typewriterMode: DEFAULT_TYPEWRITER_MODE,
      showStatusStats: DEFAULT_SHOW_STATUS_STATS,
      showStatusPath: DEFAULT_SHOW_STATUS_PATH,
      canvasGridEnabled: DEFAULT_CANVAS_GRID_ENABLED,
      canvasSnapToGrid: DEFAULT_CANVAS_SNAP_TO_GRID,
      canvasGridSize: DEFAULT_CANVAS_GRID_SIZE,
      canvasDefaultTool: DEFAULT_CANVAS_TOOL,
      canvasDefaultTextSize: DEFAULT_CANVAS_TEXT_SIZE,
      canvasDefaultDrawWidth: DEFAULT_CANVAS_DRAW_WIDTH,
      canvasDefaultColor: DEFAULT_CANVAS_COLOR,
      localHistoryEnabled: DEFAULT_LOCAL_HISTORY_ENABLED,
      openLastFileOnStartup: DEFAULT_OPEN_LAST_FILE_ON_STARTUP,
      autoExpandMovedFolders: DEFAULT_AUTO_EXPAND_MOVED_FOLDERS,
      startView: DEFAULT_START_VIEW,
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

  setEditorMaxWidth: (w) => {
    // So' aceita valores da lista oficial; previne corruption por
    // localStorage manipulado ou legado de versao anterior.
    if (!(EDITOR_MAX_WIDTHS as readonly number[]).includes(w)) return;
    try {
      localStorage.setItem(EDITOR_MAX_WIDTH_KEY, String(w));
    } catch {
      /* ignora */
    }
    set({ editorMaxWidth: w });
  },

  setEditorLineHeight: (v) => {
    if (!EDITOR_LINE_HEIGHTS.some((option) => option.value === v)) return;
    try {
      localStorage.setItem(EDITOR_LINE_HEIGHT_KEY, v);
    } catch {
      /* ignora */
    }
    set({ editorLineHeight: v });
  },

  setEditorParagraphSpacing: (v) => {
    if (!EDITOR_PARAGRAPH_SPACING.some((option) => option.value === v)) return;
    try {
      localStorage.setItem(EDITOR_PARAGRAPH_SPACING_KEY, v);
    } catch {
      /* ignora */
    }
    set({ editorParagraphSpacing: v });
  },

  setEditorIndentSize: (v) => {
    if (!EDITOR_INDENT_SIZES.some((option) => option.value === v)) return;
    try {
      localStorage.setItem(EDITOR_INDENT_SIZE_KEY, v);
    } catch {
      /* ignora */
    }
    set({ editorIndentSize: v });
  },

  setEditorFontFamily: (v) => {
    if (!EDITOR_FONT_FAMILIES.some((option) => option.value === v)) return;
    try {
      localStorage.setItem(EDITOR_FONT_FAMILY_KEY, v);
    } catch {
      /* ignora */
    }
    set({ editorFontFamily: v });
  },

  setEditorPaper: (v) => {
    if (!EDITOR_PAPERS.some((option) => option.value === v)) return;
    try {
      localStorage.setItem(EDITOR_PAPER_KEY, v);
    } catch {
      /* ignora */
    }
    set({ editorPaper: v });
  },

  setTypewriterMode: (v) => {
    try {
      localStorage.setItem(TYPEWRITER_MODE_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ typewriterMode: v });
  },

  setShowStatusStats: (v) => {
    try {
      localStorage.setItem(SHOW_STATUS_STATS_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ showStatusStats: v });
  },

  setShowStatusPath: (v) => {
    try {
      localStorage.setItem(SHOW_STATUS_PATH_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ showStatusPath: v });
  },

  setCanvasGridEnabled: (v) => {
    try {
      localStorage.setItem(CANVAS_GRID_ENABLED_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ canvasGridEnabled: v });
  },

  setCanvasSnapToGrid: (v) => {
    try {
      localStorage.setItem(CANVAS_SNAP_TO_GRID_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ canvasSnapToGrid: v });
  },

  setCanvasGridSize: (v) => {
    if (!(CANVAS_GRID_SIZES as readonly number[]).includes(v)) return;
    try {
      localStorage.setItem(CANVAS_GRID_SIZE_KEY, String(v));
    } catch {
      /* ignora */
    }
    set({ canvasGridSize: v });
  },

  setCanvasDefaultTool: (v) => {
    if (!CANVAS_DEFAULT_TOOLS.includes(v)) return;
    try {
      localStorage.setItem(CANVAS_DEFAULT_TOOL_KEY, v);
    } catch {
      /* ignora */
    }
    set({ canvasDefaultTool: v });
  },

  setCanvasDefaultTextSize: (v) => {
    if (!(CANVAS_TEXT_SIZES as readonly number[]).includes(v)) return;
    try {
      localStorage.setItem(CANVAS_DEFAULT_TEXT_SIZE_KEY, String(v));
    } catch {
      /* ignora */
    }
    set({ canvasDefaultTextSize: v });
  },

  setCanvasDefaultDrawWidth: (v) => {
    if (!(CANVAS_DRAW_WIDTHS as readonly number[]).includes(v)) return;
    try {
      localStorage.setItem(CANVAS_DEFAULT_DRAW_WIDTH_KEY, String(v));
    } catch {
      /* ignora */
    }
    set({ canvasDefaultDrawWidth: v });
  },

  setCanvasDefaultColor: (v) => {
    try {
      localStorage.setItem(CANVAS_DEFAULT_COLOR_KEY, v);
    } catch {
      /* ignora */
    }
    set({ canvasDefaultColor: v });
  },

  setLocalHistoryEnabled: (v) => {
    try {
      localStorage.setItem(LOCAL_HISTORY_ENABLED_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ localHistoryEnabled: v });
  },

  setOpenLastFileOnStartup: (v) => {
    try {
      localStorage.setItem(OPEN_LAST_FILE_ON_STARTUP_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ openLastFileOnStartup: v });
  },

  setAutoExpandMovedFolders: (v) => {
    try {
      localStorage.setItem(AUTO_EXPAND_MOVED_FOLDERS_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
    set({ autoExpandMovedFolders: v });
  },

  setStartView: (v) => {
    try {
      localStorage.setItem(START_VIEW_KEY, v);
    } catch {
      /* ignora */
    }
    set({ startView: v });
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
