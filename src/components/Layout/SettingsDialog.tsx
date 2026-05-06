import { useEffect, useState } from "react";
import {
  X,
  Sun,
  Moon,
  RotateCcw,
  Save,
  Sparkles,
  SpellCheck,
  Type,
  Home,
  FileText,
  LayoutGrid,
  Loader2,
  Trash2,
  ExternalLink,
  Grid3X3,
} from "lucide-react";
import {
  CANVAS_DEFAULT_TOOLS,
  CANVAS_DRAW_WIDTHS,
  CANVAS_GRID_SIZES,
  CANVAS_TEXT_SIZES,
  EDITOR_INDENT_SIZES,
  EDITOR_LINE_HEIGHTS,
  EDITOR_MAX_WIDTHS,
  EDITOR_PARAGRAPH_SPACING,
  useAppStore,
} from "../../store/useAppStore";
import {
  clearPersonalDict,
  getPersonalDictSize,
  getPersonalDictWords,
  removeFromPersonalDict,
} from "../../lib/spellcheck";
import {
  checkForUpdate,
  clearSkippedVersion,
  getLastUpdateCheck,
  getSkippedVersion,
  RELEASES_URL,
} from "../../lib/updater";

/**
 * Dialog de Preferencias.
 *
 * Tipografia: 100% sans-serif (Inter), pra harmonizar com o Inspector
 * e a Sidebar — locais de UI utilitaria do app. Antes era serif/itálico
 * misturado com sans, dando dissonancia visual com o resto. Settings e'
 * configuracao, nao conteudo editorial — comportamento e' "ferramenta",
 * nao "livro".
 *
 * Persistencia: cada setter da store grava no localStorage diretamente.
 * O dialog so' le/escreve via store.
 */
export function SettingsDialog() {
  const show = useAppStore((s) => s.showSettings);
  const close = useAppStore((s) => s.closeSettings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const editorZoom = useAppStore((s) => s.editorZoom);
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const editorMaxWidth = useAppStore((s) => s.editorMaxWidth);
  const setEditorMaxWidth = useAppStore((s) => s.setEditorMaxWidth);
  const editorLineHeight = useAppStore((s) => s.editorLineHeight);
  const setEditorLineHeight = useAppStore((s) => s.setEditorLineHeight);
  const editorParagraphSpacing = useAppStore((s) => s.editorParagraphSpacing);
  const setEditorParagraphSpacing = useAppStore(
    (s) => s.setEditorParagraphSpacing,
  );
  const editorIndentSize = useAppStore((s) => s.editorIndentSize);
  const setEditorIndentSize = useAppStore((s) => s.setEditorIndentSize);
  const startView = useAppStore((s) => s.startView);
  const setStartView = useAppStore((s) => s.setStartView);
  const autoSaveEnabled = useAppStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useAppStore((s) => s.setAutoSaveEnabled);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useAppStore((s) => s.setAutoCheckUpdates);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);
  const setSpellcheckEnabled = useAppStore((s) => s.setSpellcheckEnabled);
  const showStatusStats = useAppStore((s) => s.showStatusStats);
  const setShowStatusStats = useAppStore((s) => s.setShowStatusStats);
  const showStatusPath = useAppStore((s) => s.showStatusPath);
  const setShowStatusPath = useAppStore((s) => s.setShowStatusPath);
  const canvasGridEnabled = useAppStore((s) => s.canvasGridEnabled);
  const setCanvasGridEnabled = useAppStore((s) => s.setCanvasGridEnabled);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const setCanvasSnapToGrid = useAppStore((s) => s.setCanvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const setCanvasGridSize = useAppStore((s) => s.setCanvasGridSize);
  const canvasDefaultTool = useAppStore((s) => s.canvasDefaultTool);
  const setCanvasDefaultTool = useAppStore((s) => s.setCanvasDefaultTool);
  const canvasDefaultTextSize = useAppStore((s) => s.canvasDefaultTextSize);
  const setCanvasDefaultTextSize = useAppStore((s) => s.setCanvasDefaultTextSize);
  const canvasDefaultDrawWidth = useAppStore((s) => s.canvasDefaultDrawWidth);
  const setCanvasDefaultDrawWidth = useAppStore((s) => s.setCanvasDefaultDrawWidth);
  const localHistoryEnabled = useAppStore((s) => s.localHistoryEnabled);
  const setLocalHistoryEnabled = useAppStore((s) => s.setLocalHistoryEnabled);
  const openLastFileOnStartup = useAppStore((s) => s.openLastFileOnStartup);
  const setOpenLastFileOnStartup = useAppStore((s) => s.setOpenLastFileOnStartup);
  const autoExpandMovedFolders = useAppStore((s) => s.autoExpandMovedFolders);
  const setAutoExpandMovedFolders = useAppStore((s) => s.setAutoExpandMovedFolders);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const pushToast = useAppStore((s) => s.pushToast);
  const resetSettings = useAppStore((s) => s.resetSettings);

  // Re-le o tamanho do dicionario pessoal toda vez que o dialog abre.
  // Snapshot na abertura — store nao tracka isso reativamente.
  const [personalDictSize, setPersonalDictSize] = useState(0);
  const [personalDictWords, setPersonalDictWords] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | null>(null);
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!show) return;
    const refresh = () => {
      setPersonalDictSize(getPersonalDictSize());
      setPersonalDictWords(getPersonalDictWords());
      setLastUpdateCheck(getLastUpdateCheck());
      setSkippedVersion(getSkippedVersion());
    };
    refresh();
    window.addEventListener("solon:spellcheck-dict-changed", refresh);
    return () =>
      window.removeEventListener("solon:spellcheck-dict-changed", refresh);
  }, [show]);

  // Estado local pro botao "Verificar atualizacoes" (loading + cooldown).
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Esc fecha o dialog.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, close]);

  if (!show) return null;

  const onCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    setUpdateStatus({ kind: "checking" });
    try {
      const result = await checkForUpdate({ force: true });
      if (result.kind === "available") {
        setUpdateStatus({ kind: "available", info: result.info });
        setUpdateMessage(`Solon ${result.info.version} disponivel para instalar.`);
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast(
          "info",
          `Solon ${result.info.version} disponível — confira no banner.`,
        );
      } else if (result.kind === "skipped") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(`Solon ${result.version} esta ignorado por enquanto.`);
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast(
          "info",
          `Versão ${result.version} foi ignorada anteriormente.`,
        );
      } else if (result.kind === "error") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(result.message);
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast("error", "Erro ao verificar atualizações.");
      } else if (result.kind === "unconfigured") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(result.message);
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast("info", result.message);
      } else if (result.kind === "unsupported") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage("Disponivel apenas no app desktop instalado.");
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast(
          "info",
          "Atualizações estão disponíveis apenas no app desktop.",
        );
      } else {
        // 'none' — esta na ultima versao
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage("Voce esta na versao mais recente.");
        setLastUpdateCheck(getLastUpdateCheck());
        pushToast("success", "Você está na versão mais recente.");
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const onClearPersonalDict = () => {
    clearPersonalDict();
    setPersonalDictSize(getPersonalDictSize());
    setPersonalDictWords(getPersonalDictWords());
    pushToast("success", "Dicionario pessoal limpo.");
  };

  const onRemovePersonalWord = (word: string) => {
    removeFromPersonalDict(word);
    setPersonalDictSize(getPersonalDictSize());
    setPersonalDictWords(getPersonalDictWords());
  };

  const onClearSkippedVersion = () => {
    clearSkippedVersion();
    setSkippedVersion(null);
    pushToast("success", "Versao ignorada liberada.");
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-xl rounded-lg shadow-xl flex flex-col max-h-[85vh]"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header — utilitario, mesma estetica de Inspector/Sidebar.
            Antes era 'PREFERÊNCIAS' grande em serif, destoava do resto. */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2
            id="settings-title"
            className="text-[0.7rem] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Preferências
          </h2>
          <button
            onClick={close}
            title="Fechar (Esc)"
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--bg-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-6">
          {/* Aparencia */}
          <Section title="Aparência">
            <Row label="Tema">
              <SegmentedControl
                value={theme}
                options={[
                  { value: "light", label: "Claro", icon: <Sun size={11} /> },
                  { value: "dark", label: "Escuro", icon: <Moon size={11} /> },
                ]}
                onChange={(v) => setTheme(v as "light" | "dark")}
              />
            </Row>

            <Row
              label="Zoom do texto"
              hint={`${editorZoom}%`}
              icon={<Type size={11} />}
            >
              <div className="flex items-center gap-2 w-full">
                <button
                  title="Diminuir"
                  onClick={() => setEditorZoom(editorZoom - 5)}
                  disabled={editorZoom <= 75}
                  className="px-2 py-0.5 rounded text-[0.72rem] font-mono transition-opacity disabled:opacity-30"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  A−
                </button>
                <input
                  type="range"
                  min={75}
                  max={200}
                  step={5}
                  value={editorZoom}
                  onChange={(e) => setEditorZoom(parseInt(e.target.value, 10))}
                  className="flex-1"
                  style={{ accentColor: "var(--accent)" }}
                />
                <button
                  title="Aumentar"
                  onClick={() => setEditorZoom(editorZoom + 5)}
                  disabled={editorZoom >= 200}
                  className="px-2 py-0.5 rounded text-[0.78rem] font-mono transition-opacity disabled:opacity-30"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  A+
                </button>
                <button
                  title="100%"
                  onClick={() => setEditorZoom(100)}
                  className="px-1.5 py-0.5 rounded text-[0.65rem]"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  100%
                </button>
              </div>
            </Row>

            <Row label="Largura do editor" hint={`${editorMaxWidth}px`}>
              <SegmentedControl
                value={String(editorMaxWidth)}
                options={EDITOR_MAX_WIDTHS.map((w) => ({
                  value: String(w),
                  label: String(w),
                }))}
                onChange={(v) => setEditorMaxWidth(parseInt(v, 10))}
              />
            </Row>

            <Row label="Espaçamento" hint={getLineHeightLabel(editorLineHeight)}>
              <SegmentedControl
                value={editorLineHeight}
                options={EDITOR_LINE_HEIGHTS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorLineHeight(v)}
              />
            </Row>
          </Section>

          <Section title="Escrita">
            <Row
              label="Entre parágrafos"
              hint={getParagraphSpacingLabel(editorParagraphSpacing)}
            >
              <SegmentedControl
                value={editorParagraphSpacing}
                options={EDITOR_PARAGRAPH_SPACING.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorParagraphSpacing(v)}
              />
            </Row>

            <Row
              label="Recuo do Tab"
              hint={getIndentSizeLabel(editorIndentSize)}
            >
              <SegmentedControl
                value={editorIndentSize}
                options={EDITOR_INDENT_SIZES.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorIndentSize(v)}
              />
            </Row>
          </Section>

          <Section title="Canvas">
            <Row label="Grade" icon={<Grid3X3 size={11} />}>
              <Toggle
                checked={canvasGridEnabled}
                onChange={setCanvasGridEnabled}
                label={canvasGridEnabled ? "Visível" : "Oculta"}
              />
            </Row>

            <Row label="Snap na grade">
              <Toggle
                checked={canvasSnapToGrid}
                onChange={setCanvasSnapToGrid}
                label={canvasSnapToGrid ? "Ativo" : "Livre"}
              />
            </Row>

            <Row label="Tamanho da grade" hint={`${canvasGridSize}px`}>
              <SegmentedControl
                value={String(canvasGridSize)}
                options={CANVAS_GRID_SIZES.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                onChange={(v) => setCanvasGridSize(parseInt(v, 10))}
              />
            </Row>

            <Row label="Ferramenta inicial">
              <SegmentedControl
                value={canvasDefaultTool}
                options={CANVAS_DEFAULT_TOOLS.map((tool) => ({
                  value: tool,
                  label: getCanvasToolLabel(tool),
                }))}
                onChange={(v) => setCanvasDefaultTool(v)}
              />
            </Row>

            <Row label="Texto novo" hint={`${canvasDefaultTextSize}px`}>
              <SegmentedControl
                value={String(canvasDefaultTextSize)}
                options={CANVAS_TEXT_SIZES.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                onChange={(v) => setCanvasDefaultTextSize(parseInt(v, 10))}
              />
            </Row>

            <Row label="Traço novo" hint={`${canvasDefaultDrawWidth}px`}>
              <SegmentedControl
                value={String(canvasDefaultDrawWidth)}
                options={CANVAS_DRAW_WIDTHS.map((width) => ({
                  value: String(width),
                  label: String(width),
                }))}
                onChange={(v) => setCanvasDefaultDrawWidth(Number(v))}
              />
            </Row>
          </Section>

          {/* Editor */}
          <Section title="Editor">
            <Row
              label="Auto-save"
              hint="Ctrl+S sempre salva."
              icon={<Save size={11} />}
            >
              <Toggle
                checked={autoSaveEnabled}
                onChange={setAutoSaveEnabled}
                label={autoSaveEnabled ? "Ativado" : "Desativado"}
              />
            </Row>

            <Row
              label="Ortografia (pt-BR)"
              hint={
                personalDictSize > 0
                  ? `${personalDictSize} ${personalDictSize === 1 ? "palavra" : "palavras"} no dicionário.`
                  : undefined
              }
              icon={<SpellCheck size={11} />}
            >
              <Toggle
                checked={spellcheckEnabled}
                onChange={setSpellcheckEnabled}
                label={spellcheckEnabled ? "Ativada" : "Desativada"}
              />
            </Row>
            {personalDictSize > 0 && (
              <div
                className="rounded-md p-2 flex flex-col gap-2"
                style={{
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-panel-2)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div
                      className="text-[0.78rem] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Dicionario pessoal
                    </div>
                    <div
                      className="text-[0.68rem]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {personalDictSize} {personalDictSize === 1 ? "palavra" : "palavras"} adicionadas.
                    </div>
                  </div>
                  <button
                    onClick={onClearPersonalDict}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.72rem] transition-colors"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      background: "var(--bg-panel)",
                    }}
                  >
                    <Trash2 size={11} />
                    Limpar
                  </button>
                </div>
                <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
                  {personalDictWords.map((word) => (
                    <button
                      key={word}
                      title="Remover palavra"
                      onClick={() => onRemovePersonalWord(word)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.68rem]"
                      style={{
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {word}
                      <X size={10} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Inicialização */}
          <Section title="Inicialização">
            <Row label="Ao abrir">
              <SegmentedControl
                value={startView}
                options={[
                  { value: "home", label: "Início", icon: <Home size={11} /> },
                  { value: "editor", label: "Editor", icon: <FileText size={11} /> },
                  { value: "canvas", label: "Canvas", icon: <LayoutGrid size={11} /> },
                ]}
                onChange={(v) => setStartView(v as "home" | "editor" | "canvas")}
              />
            </Row>
          </Section>

          <Section title="Interface">
            <Row label="Estatísticas na barra inferior">
              <Toggle
                checked={showStatusStats}
                onChange={setShowStatusStats}
                label={showStatusStats ? "Visíveis" : "Ocultas"}
              />
            </Row>

            <Row label="Caminho do arquivo na barra inferior">
              <Toggle
                checked={showStatusPath}
                onChange={setShowStatusPath}
                label={showStatusPath ? "Visível" : "Oculto"}
              />
            </Row>
          </Section>

          <Section title="Comportamento">
            <Row label="Abrir último arquivo">
              <Toggle
                checked={openLastFileOnStartup}
                onChange={setOpenLastFileOnStartup}
                label={openLastFileOnStartup ? "Ativo" : "Desativado"}
              />
            </Row>

            <Row label="Expandir pasta após mover">
              <Toggle
                checked={autoExpandMovedFolders}
                onChange={setAutoExpandMovedFolders}
                label={autoExpandMovedFolders ? "Ativo" : "Manual"}
              />
            </Row>

            <Row label="Histórico local">
              <Toggle
                checked={localHistoryEnabled}
                onChange={setLocalHistoryEnabled}
                label={localHistoryEnabled ? "Ativo" : "Desativado"}
              />
            </Row>
          </Section>

          {/* Atualizações */}
          <Section title="Atualizações">
            <Row
              label="Versão atual"
              hint={
                lastUpdateCheck
                  ? `Checado ${formatDateTime(lastUpdateCheck)}`
                  : undefined
              }
            >
              <span
                className="text-[0.72rem] tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                v{APP_VERSION}
              </span>
            </Row>
            <Row
              label="Verificar no boot"
              icon={<Sparkles size={11} />}
            >
              <Toggle
                checked={autoCheckUpdates}
                onChange={setAutoCheckUpdates}
                label={autoCheckUpdates ? "Ativado" : "Desativado"}
              />
            </Row>
            <Row
              label="Verificar agora"
              hint={updateMessage ?? undefined}
            >
              <button
                onClick={onCheckUpdates}
                disabled={checkingUpdate}
                className="inline-flex items-center gap-2 px-3 py-1 rounded text-[0.78rem] font-medium transition-colors disabled:opacity-60"
                style={{
                  background: "var(--bg-inverse)",
                  color: "var(--text-inverse, #fff)",
                }}
              >
                {checkingUpdate ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Verificando…
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Verificar
                  </>
                )}
              </button>
            </Row>
            {skippedVersion && (
              <Row
                label="Versão ignorada"
                hint={`Solon ${skippedVersion}`}
              >
                <button
                  onClick={onClearSkippedVersion}
                  className="px-2.5 py-1 rounded text-[0.72rem]"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Liberar
                </button>
              </Row>
            )}
            <Row label="Canal de release">
              <button
                onClick={() => window.open(RELEASES_URL, "_blank", "noopener,noreferrer")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.72rem]"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                <ExternalLink size={11} />
                GitHub
              </button>
            </Row>
          </Section>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={resetSettings}
            className="inline-flex items-center gap-1.5 text-[0.72rem] transition-opacity hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <RotateCcw size={11} />
            Restaurar padrões
          </button>
          <div
            className="text-[0.65rem] tabular-nums"
            style={{ color: "var(--text-placeholder)" }}
          >
            v{APP_VERSION}
          </div>
          <button
            onClick={close}
            className="px-3 py-1 rounded text-[0.78rem] font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse, #fff)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.filter =
                "brightness(0.92)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.filter = "")
            }
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Versao do app, injetada em build-time via `vite.config.ts`.
 */
const APP_VERSION = __APP_VERSION__;

function formatDateTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "data indisponivel";
  }
}

function getLineHeightLabel(value: string): string {
  if (value === "compact") return "Mais denso";
  if (value === "relaxed") return "Mais aberto";
  return "Equilibrado";
}

function getParagraphSpacingLabel(value: string): string {
  if (value === "tight") return "Blocos mais próximos";
  if (value === "airy") return "Mais respiro";
  return "Equilibrado";
}

function getIndentSizeLabel(value: string): string {
  if (value === "small") return "Recuo curto";
  if (value === "large") return "Recuo amplo";
  return "Recuo clássico";
}

function getCanvasToolLabel(value: string): string {
  if (value === "arrow") return "Seta";
  if (value === "draw") return "Desenho";
  if (value === "text") return "Texto";
  if (value === "eraser") return "Borracha";
  return "Selecionar";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h3
        className="text-[0.6rem] uppercase tracking-[0.22em] font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <span
              style={{ color: "var(--text-muted)" }}
              className="flex-shrink-0"
            >
              {icon}
            </span>
          )}
          <span
            className="text-[0.82rem] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
        </div>
        <div className="flex-shrink-0 flex items-center">{children}</div>
      </div>
      {hint && (
        <p
          className="text-[0.7rem] leading-snug"
          style={{
            color: "var(--text-muted)",
            paddingLeft: icon ? "1.25rem" : 0,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex p-0.5 rounded-md"
      style={{ background: "var(--bg-hover)" }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-label={opt.label}
            aria-pressed={active}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.72rem] transition-colors"
            style={{
              background: active ? "var(--bg-panel)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: active ? "var(--shadow-sm)" : undefined,
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 transition-opacity"
    >
      <span
        className="relative inline-block w-8 h-[18px] rounded-full transition-colors"
        style={{
          background: checked ? "var(--accent)" : "var(--border)",
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full transition-transform"
          style={{
            background: "var(--bg-panel)",
            transform: checked ? "translateX(14px)" : "translateX(0)",
            boxShadow: "var(--shadow-sm)",
          }}
        />
      </span>
      {label && (
        <span
          className="text-[0.72rem]"
          style={{
            color: checked ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
