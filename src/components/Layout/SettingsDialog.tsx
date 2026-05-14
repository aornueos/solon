import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Monitor,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  SpellCheck,
  Trash2,
  Type,
  X,
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

const APP_VERSION = __APP_VERSION__;

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
  const setEditorParagraphSpacing = useAppStore((s) => s.setEditorParagraphSpacing);
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
  const showTitlebarActions = useAppStore((s) => s.showTitlebarActions);
  const setShowTitlebarActions = useAppStore((s) => s.setShowTitlebarActions);
  const localHistoryEnabled = useAppStore((s) => s.localHistoryEnabled);
  const setLocalHistoryEnabled = useAppStore((s) => s.setLocalHistoryEnabled);
  const openLastFileOnStartup = useAppStore((s) => s.openLastFileOnStartup);
  const setOpenLastFileOnStartup = useAppStore((s) => s.setOpenLastFileOnStartup);
  const autoExpandMovedFolders = useAppStore((s) => s.autoExpandMovedFolders);
  const setAutoExpandMovedFolders = useAppStore((s) => s.setAutoExpandMovedFolders);
  const restoreWorkspaceLayout = useAppStore((s) => s.restoreWorkspaceLayout);
  const setRestoreWorkspaceLayout = useAppStore((s) => s.setRestoreWorkspaceLayout);
  const openWorkspaceHealth = useAppStore((s) => s.openWorkspaceHealth);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const pushToast = useAppStore((s) => s.pushToast);
  const resetSettings = useAppStore((s) => s.resetSettings);

  const [personalDictSize, setPersonalDictSize] = useState(0);
  const [personalDictWords, setPersonalDictWords] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | null>(null);
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

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
    return () => window.removeEventListener("solon:spellcheck-dict-changed", refresh);
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
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
      setLastUpdateCheck(getLastUpdateCheck());
      if (result.kind === "available") {
        setUpdateStatus({ kind: "available", info: result.info });
        setUpdateMessage(`Solon ${result.info.version} disponível para instalar.`);
        pushToast("info", `Solon ${result.info.version} disponível no banner.`);
      } else if (result.kind === "skipped") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(`Solon ${result.version} está ignorado por enquanto.`);
        pushToast("info", `Versão ${result.version} foi ignorada anteriormente.`);
      } else if (result.kind === "error") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(result.message);
        pushToast("error", "Erro ao verificar atualizações.");
      } else if (result.kind === "unconfigured") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage(result.message);
        pushToast("info", result.message);
      } else if (result.kind === "unsupported") {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage("Disponível apenas no app desktop instalado.");
        pushToast("info", "Atualizações estão disponíveis apenas no app desktop.");
      } else {
        setUpdateStatus({ kind: "idle" });
        setUpdateMessage("Você está na versão mais recente.");
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
    pushToast("success", "Dicionário pessoal limpo.");
  };

  const onRemovePersonalWord = (word: string) => {
    removeFromPersonalDict(word);
    setPersonalDictSize(getPersonalDictSize());
    setPersonalDictWords(getPersonalDictWords());
  };

  const onClearSkippedVersion = () => {
    clearSkippedVersion();
    setSkippedVersion(null);
    pushToast("success", "Versão ignorada liberada.");
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
        className="w-full max-w-5xl max-h-[86vh] rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <h2 id="settings-title" className="text-[0.95rem] font-semibold">
              Ajustes
            </h2>
            <p className="text-[0.7rem] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Preferências de escrita, interface e projeto.
            </p>
          </div>
          <button
            onClick={close}
            title="Fechar"
            aria-label="Fechar ajustes"
            className="h-8 w-8 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section title="Aparência" description="Tema, escala e medida visual.">
              <Row label="Tema visual" hint={themeHint(editorPaper)}>
                <SelectControl
                  value={editorPaper}
                  options={EDITOR_PAPERS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorPaper}
                />
              </Row>

              <RangeRow
                label="Zoom do app"
                icon={<Monitor size={12} />}
                value={appZoom}
                suffix="%"
                min={80}
                max={160}
                step={10}
                onChange={setAppZoom}
                onReset={() => setAppZoom(100)}
              />

              <RangeRow
                label="Zoom do texto"
                icon={<Type size={12} />}
                value={editorZoom}
                suffix="%"
                min={75}
                max={200}
                step={5}
                onChange={setEditorZoom}
                onReset={() => setEditorZoom(100)}
              />

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
            </Section>

            <Section title="Escrita" description="Ritmo do texto e tipografia padrão.">
              <Row label="Fonte padrão">
                <SelectControl
                  value={editorFontFamily}
                  options={EDITOR_FONT_FAMILIES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorFontFamily}
                />
              </Row>

              <Row label="Espaçamento de linha" hint={getLineHeightLabel(editorLineHeight)}>
                <SelectControl
                  value={editorLineHeight}
                  options={EDITOR_LINE_HEIGHTS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorLineHeight}
                />
              </Row>

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
                  onChange={setEditorParagraphSpacing}
                />
              </Row>

              <Row label="Recuo do Tab" hint={getIndentSizeLabel(editorIndentSize)}>
                <SelectControl
                  value={editorIndentSize}
                  options={EDITOR_INDENT_SIZES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorIndentSize}
                />
              </Row>
            </Section>

            <Section title="Editor" description="Salvamento, ortografia e ferramentas.">
              <Row label="Auto-save" hint="Ctrl+S continua disponível a qualquer momento." icon={<Save size={12} />}>
                <Toggle
                  checked={autoSaveEnabled}
                  onChange={setAutoSaveEnabled}
                  label={autoSaveEnabled ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row
                label="Ortografia pt-BR"
                hint={
                  personalDictSize > 0
                    ? `${personalDictSize} ${personalDictSize === 1 ? "palavra" : "palavras"} no dicionário.`
                    : "Sublinhado e sugestões do revisor interno."
                }
                icon={<SpellCheck size={12} />}
              >
                <Toggle
                  checked={spellcheckEnabled}
                  onChange={setSpellcheckEnabled}
                  label={spellcheckEnabled ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row label="Toolbar do editor">
                <SelectControl
                  value={editorToolbarMode}
                  options={[
                    { value: "fixed", label: "Fixa" },
                    { value: "hover", label: "Ao passar o mouse" },
                  ]}
                  onChange={setEditorToolbarMode}
                />
              </Row>

              {personalDictSize > 0 && (
                <DictionaryPanel
                  words={personalDictWords}
                  size={personalDictSize}
                  onClear={onClearPersonalDict}
                  onRemove={onRemovePersonalWord}
                />
              )}
            </Section>

            <Section title="Interface" description="O que aparece quando o Solon abre.">
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

              <Row label="Abrir último arquivo">
                <Toggle
                  checked={openLastFileOnStartup}
                  onChange={setOpenLastFileOnStartup}
                  label={openLastFileOnStartup ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row
                label="Restaurar sessão"
                hint="Reabre layout, split pane, última visão e abas fechadas recentes."
              >
                <Toggle
                  checked={restoreWorkspaceLayout}
                  onChange={setRestoreWorkspaceLayout}
                  label={restoreWorkspaceLayout ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row label="Ações extras na barra superior">
                <Toggle
                  checked={showTitlebarActions}
                  onChange={setShowTitlebarActions}
                  label={showTitlebarActions ? "Ativado" : "Desativado"}
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

            <Section title="Projeto" description="Organização, histórico e verificações.">
              <Row
                label="Saúde do projeto"
                hint="Verifica links internos, imagens inline e notas vazias."
                icon={<ShieldCheck size={12} />}
              >
                <ActionButton
                  onClick={() => {
                    close();
                    openWorkspaceHealth();
                  }}
                >
                  Verificar
                </ActionButton>
              </Row>

              <Row label="Expandir pasta após mover">
                <Toggle
                  checked={autoExpandMovedFolders}
                  onChange={setAutoExpandMovedFolders}
                  label={autoExpandMovedFolders ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row label="Histórico local" hint="Mantém snapshots antes de sobrescrever notas.">
                <Toggle
                  checked={localHistoryEnabled}
                  onChange={setLocalHistoryEnabled}
                  label={localHistoryEnabled ? "Ativado" : "Desativado"}
                />
              </Row>
            </Section>

            <Section title="Atualizações" description="Versão instalada e canal de release.">
              <Row
                label="Versão atual"
                hint={lastUpdateCheck ? `Checado ${formatDateTime(lastUpdateCheck)}` : undefined}
              >
                <span className="text-[0.72rem] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  v{APP_VERSION}
                </span>
              </Row>

              <Row label="Verificar ao abrir" icon={<Sparkles size={12} />}>
                <Toggle
                  checked={autoCheckUpdates}
                  onChange={setAutoCheckUpdates}
                  label={autoCheckUpdates ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row label="Verificar agora" hint={updateMessage ?? undefined}>
                <ActionButton onClick={onCheckUpdates} disabled={checkingUpdate} strong>
                  {checkingUpdate ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} />
                      Verificar
                    </>
                  )}
                </ActionButton>
              </Row>

              {skippedVersion && (
                <Row label="Versão ignorada" hint={`Solon ${skippedVersion}`}>
                  <ActionButton onClick={onClearSkippedVersion}>Liberar</ActionButton>
                </Row>
              )}

              <Row label="Canal de release">
                <ActionButton onClick={openReleaseChannel}>
                  <ExternalLink size={11} />
                  GitHub
                </ActionButton>
              </Row>
            </Section>
          </div>
        </div>

        <div
          className="px-5 py-3 flex items-center justify-between gap-3"
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
          <div className="text-[0.65rem] tabular-nums" style={{ color: "var(--text-placeholder)" }}>
            v{APP_VERSION}
          </div>
          <button
            onClick={close}
            className="px-3 py-1.5 rounded-md text-[0.76rem] font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse, #fff)",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function DictionaryPanel({
  words,
  size,
  onClear,
  onRemove,
}: {
  words: string[];
  size: number;
  onClear: () => void;
  onRemove: (word: string) => void;
}) {
  return (
    <div
      className="rounded-md p-3 flex flex-col gap-2"
      style={{
        border: "1px solid var(--border-subtle)",
        background: "color-mix(in srgb, var(--bg-panel) 70%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.78rem] font-medium">Dicionário pessoal</div>
          <div className="text-[0.68rem]" style={{ color: "var(--text-muted)" }}>
            {size} {size === 1 ? "palavra adicionada" : "palavras adicionadas"}
          </div>
        </div>
        <ActionButton onClick={onClear}>
          <Trash2 size={11} />
          Limpar
        </ActionButton>
      </div>
      <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
        {words.map((word) => (
          <button
            key={word}
            title="Remover palavra"
            onClick={() => onRemove(word)}
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
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: "var(--bg-panel-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div>
        <h3
          className="text-[0.66rem] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </h3>
        {description && (
          <p className="text-[0.68rem] mt-1 leading-snug" style={{ color: "var(--text-placeholder)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
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
      className="rounded-md px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--bg-panel) 64%, transparent)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <span className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              {icon}
            </span>
          )}
          <span className="text-[0.78rem] font-medium truncate">{label}</span>
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

function RangeRow({
  label,
  icon,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
  onReset,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  return (
    <Row label={label} hint={`${value}${suffix}`} icon={icon}>
      <div className="flex items-center gap-2 w-56 max-w-[42vw]">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1"
          style={{ accentColor: "var(--accent)" }}
        />
        <button
          title="Restaurar 100%"
          onClick={onReset}
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
      className="min-w-[152px] rounded-md px-2.5 py-1.5 text-[0.74rem] outline-none"
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
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className="relative inline-block w-8 h-[18px] rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
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
      <span
        className="text-[0.72rem]"
        style={{ color: checked ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {label}
      </span>
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  strong,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[0.72rem] font-medium transition-opacity disabled:opacity-60"
      style={{
        background: strong ? "var(--bg-inverse)" : "var(--bg-panel)",
        color: strong ? "var(--text-inverse, #fff)" : "var(--text-secondary)",
        border: strong ? "1px solid var(--bg-inverse)" : "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}

function themeHint(value: string): string | undefined {
  return EDITOR_PAPERS.find((option) => option.value === value)?.hint;
}

function formatDateTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "data indisponível";
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
