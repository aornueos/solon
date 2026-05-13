import { useEffect, useState } from "react";
import {
  X,
  RotateCcw,
  Save,
  Sparkles,
  SpellCheck,
  Type,
  Loader2,
  Trash2,
  ExternalLink,
  Monitor,
} from "lucide-react";
import {
  EDITOR_FONT_FAMILIES,
  EDITOR_INDENT_SIZES,
  EDITOR_LINE_HEIGHTS,
  EDITOR_MAX_WIDTHS,
  EDITOR_PAPERS,
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
  const editorZoom = useAppStore((s) => s.editorZoom);
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const appZoom = useAppStore((s) => s.appZoom);
  const setAppZoom = useAppStore((s) => s.setAppZoom);
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
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const setEditorFontFamily = useAppStore((s) => s.setEditorFontFamily);
  const editorPaper = useAppStore((s) => s.editorPaper);
  const setEditorPaper = useAppStore((s) => s.setEditorPaper);
  const editorToolbarMode = useAppStore((s) => s.editorToolbarMode);
  const setEditorToolbarMode = useAppStore((s) => s.setEditorToolbarMode);
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

  const openReleaseChannel = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(RELEASES_URL);
    } catch {
      window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
    }
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
        className="w-full max-w-4xl rounded-lg shadow-xl flex flex-col max-h-[85vh]"
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
        <div className="overflow-y-auto px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aparencia */}
          <Section title="Aparência">
            <Row
              label="Tema visual"
              hint={EDITOR_PAPERS.find((option) => option.value === editorPaper)?.hint}
            >
              <SelectControl
                value={editorPaper}
                options={EDITOR_PAPERS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorPaper(v)}
              />
            </Row>

            <Row
              label="Zoom do app"
              hint={`${appZoom}%`}
              icon={<Monitor size={11} />}
            >
              <div className="flex items-center gap-2 w-full">
                <button
                  title="Diminuir interface"
                  onClick={() => setAppZoom(appZoom - 10)}
                  disabled={appZoom <= 80}
                  className="px-2 py-0.5 rounded text-[0.72rem] font-mono transition-opacity disabled:opacity-30"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  -
                </button>
                <input
                  type="range"
                  min={80}
                  max={160}
                  step={10}
                  value={appZoom}
                  onChange={(e) => setAppZoom(parseInt(e.target.value, 10))}
                  className="flex-1"
                  style={{ accentColor: "var(--accent)" }}
                />
                <button
                  title="Aumentar interface"
                  onClick={() => setAppZoom(appZoom + 10)}
                  disabled={appZoom >= 160}
                  className="px-2 py-0.5 rounded text-[0.72rem] font-mono transition-opacity disabled:opacity-30"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  +
                </button>
                <button
                  title="100%"
                  onClick={() => setAppZoom(100)}
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
              <SelectControl
                value={String(editorMaxWidth)}
                options={EDITOR_MAX_WIDTHS.map((w) => ({
                  value: String(w),
                  label: `${w}px`,
                }))}
                onChange={(v) => setEditorMaxWidth(parseInt(v, 10))}
              />
            </Row>

            <Row label="Espaçamento" hint={getLineHeightLabel(editorLineHeight)}>
              <SelectControl
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
              <SelectControl
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
              <SelectControl
                value={editorIndentSize}
                options={EDITOR_INDENT_SIZES.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorIndentSize(v)}
              />
            </Row>

            <Row label="Fonte padrão">
              <SelectControl
                value={editorFontFamily}
                options={EDITOR_FONT_FAMILIES.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(v) => setEditorFontFamily(v)}
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
                label={spellcheckEnabled ? "Ativado" : "Desativado"}
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

          <Section title="Interface">
            <Row label="Ao abrir">
              <SelectControl
                value={startView}
                options={[
                  { value: "home", label: "Início" },
                  { value: "editor", label: "Editor" },
                  { value: "canvas", label: "Canvas" },
                ]}
                onChange={(v) => setStartView(v as "home" | "editor" | "canvas")}
              />
            </Row>

            <Row label="Toolbar do editor">
              <SelectControl
                value={editorToolbarMode}
                options={[
                  { value: "fixed", label: "Fixa" },
                  { value: "hover", label: "Hover" },
                ]}
                onChange={(v) => setEditorToolbarMode(v)}
              />
            </Row>

            <Row label="Abrir último arquivo">
              <Toggle
                checked={openLastFileOnStartup}
                onChange={setOpenLastFileOnStartup}
                label={openLastFileOnStartup ? "Ativado" : "Desativado"}
              />
            </Row>

            <Row label="Estatísticas na barra inferior">
              <Toggle
                checked={showStatusStats}
                onChange={setShowStatusStats}
                label={showStatusStats ? "Ativado" : "Desativado"}
              />
            </Row>

            <Row label="Caminho do arquivo na barra inferior">
              <Toggle
                checked={showStatusPath}
                onChange={setShowStatusPath}
                label={showStatusPath ? "Ativado" : "Desativado"}
              />
            </Row>
          </Section>

          <Section title="Comportamento">
            <Row label="Expandir pasta após mover">
              <Toggle
                checked={autoExpandMovedFolders}
                onChange={setAutoExpandMovedFolders}
                label={autoExpandMovedFolders ? "Ativado" : "Desativado"}
              />
            </Row>

            <Row label="Histórico local">
              <Toggle
                checked={localHistoryEnabled}
                onChange={setLocalHistoryEnabled}
                label={localHistoryEnabled ? "Ativado" : "Desativado"}
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
                onClick={openReleaseChannel}
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--bg-panel-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <h3
        className="text-[0.62rem] uppercase tracking-[0.2em] font-semibold"
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
    <div
      className="rounded-md px-2.5 py-2"
      style={{ background: "color-mix(in srgb, var(--bg-panel) 55%, transparent)" }}
    >
      <div className="flex items-center justify-between gap-3">
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
            className="text-[0.78rem] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
        </div>
        <div className="flex-shrink-0 flex items-center">{children}</div>
      </div>
      {hint && (
        <p
          className="text-[0.68rem] leading-snug mt-1"
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

function SelectControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="min-w-[132px] rounded-md px-2.5 py-1 text-[0.74rem] outline-none"
      style={{
        background: "var(--bg-panel)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
