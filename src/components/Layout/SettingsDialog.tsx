import { useEffect, useState } from "react";
import {
  ExternalLink,
  Archive,
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
  CANVAS_DBLCLICK_ACTIONS,
  EDITOR_FONT_FAMILIES,
  EDITOR_INDENT_SIZES,
  EDITOR_LINE_HEIGHTS,
  EDITOR_MAX_WIDTHS,
  EDITOR_PAGE_LAYOUTS,
  EDITOR_PAPERS,
  EDITOR_PARAGRAPH_SPACING,
  EDITOR_TEXT_SIZES,
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
import { createProjectBackup, restoreLatestProjectBackup } from "../../lib/projectBackup";
import { useFileSystem } from "../../hooks/useFileSystem";

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
  const editorPageLayout = useAppStore((s) => s.editorPageLayout);
  const setEditorPageLayout = useAppStore((s) => s.setEditorPageLayout);
  const editorTextSize = useAppStore((s) => s.editorTextSize);
  const setEditorTextSize = useAppStore((s) => s.setEditorTextSize);
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
  const outlineSide = useAppStore((s) => s.outlineSide);
  const setOutlineSide = useAppStore((s) => s.setOutlineSide);
  const canvasDblClickCreates = useAppStore((s) => s.canvasDblClickCreates);
  const setCanvasDblClickCreates = useAppStore((s) => s.setCanvasDblClickCreates);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const fileTree = useAppStore((s) => s.fileTree);
  const openWorkspaceHealth = useAppStore((s) => s.openWorkspaceHealth);
  const openConfirm = useAppStore((s) => s.openConfirm);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const pushToast = useAppStore((s) => s.pushToast);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const { refresh } = useFileSystem();

  const [personalDictSize, setPersonalDictSize] = useState(0);
  const [personalDictWords, setPersonalDictWords] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | null>(null);
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

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

  const onCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupMessage(null);
    try {
      const result = await createProjectBackup(rootFolder, fileTree);
      const failed = result.failedCount > 0 ? `, ${result.failedCount} falhou` : "";
      setBackupMessage(`${result.fileCount} notas copiadas${failed}.`);
      pushToast("success", "Backup do projeto criado.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível criar backup.";
      setBackupMessage(message);
      pushToast("error", message);
    } finally {
      setCreatingBackup(false);
    }
  };

  const onRestoreBackup = async () => {
    const ok = await openConfirm({
      title: "Restaurar último backup",
      message:
        "As notas existentes serão sobrescritas pelas cópias do backup mais recente. Arquivos criados depois do backup não serão apagados.",
      confirmLabel: "Restaurar",
      danger: true,
    });
    if (!ok) return;

    setRestoringBackup(true);
    setBackupMessage(null);
    try {
      const result = await restoreLatestProjectBackup(rootFolder);
      const failed = result.failedCount > 0 ? `, ${result.failedCount} falhou` : "";
      setBackupMessage(`${result.fileCount} notas restauradas${failed}.`);
      await refresh();
      pushToast("success", "Backup restaurado.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível restaurar backup.";
      setBackupMessage(message);
      pushToast("error", message);
    } finally {
      setRestoringBackup(false);
    }
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
      className="solon-dialog-overlay fixed inset-0 z-[110] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="solon-dialog w-full max-w-5xl max-h-[86vh] flex flex-col overflow-hidden"
      >
        <div className="solon-dialog-header">
          <div className="min-w-0">
            <h2 id="settings-title" className="solon-dialog-title">
              Ajustes
            </h2>
            <p className="solon-dialog-subtitle">
              Preferências de escrita, interface e projeto.
            </p>
          </div>
          <button
            onClick={close}
            title="Fechar"
            aria-label="Fechar ajustes"
            className="solon-dialog-close"
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
                label="Zoom da página"
                icon={<Type size={12} />}
                value={editorZoom}
                suffix="%"
                min={75}
                max={200}
                step={5}
                onChange={setEditorZoom}
                onReset={() => setEditorZoom(100)}
              />

            </Section>

            <Section title="Escrita" description="Ritmo do texto e tipografia padrão.">
              <Row label="Tamanho do texto" hint={getTextSizeLabel(editorTextSize)}>
                <SelectControl
                  value={editorTextSize}
                  options={EDITOR_TEXT_SIZES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorTextSize}
                />
              </Row>

              <Row
                label="Largura no modo livre"
                hint={
                  editorPageLayout === "a4-continuous"
                    ? "Usada no modo livre"
                    : `${editorMaxWidth}px`
                }
              >
                <SelectControl
                  value={String(editorMaxWidth)}
                  options={EDITOR_MAX_WIDTHS.map((w) => ({
                    value: String(w),
                    label: `${w}px`,
                  }))}
                  onChange={(v) => setEditorMaxWidth(parseInt(v, 10))}
                />
              </Row>

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

            <Section title="Fluxo" description="Página, salvamento e ferramentas.">
              <Row label="Página" hint={pageLayoutHint(editorPageLayout)}>
                <SelectControl
                  value={editorPageLayout}
                  options={EDITOR_PAGE_LAYOUTS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setEditorPageLayout}
                />
              </Row>

              <Row label="Auto-save" hint="Ctrl+S continua disponível a qualquer momento." icon={<Save size={12} />}>
                <Toggle
                  checked={autoSaveEnabled}
                  onChange={setAutoSaveEnabled}
                  label={autoSaveEnabled ? "Ativado" : "Desativado"}
                />
              </Row>

              <Row
                label="Duplo clique no canvas"
                hint={
                  CANVAS_DBLCLICK_ACTIONS.find(
                    (option) => option.value === canvasDblClickCreates,
                  )?.hint
                }
              >
                <SelectControl
                  value={canvasDblClickCreates}
                  options={CANVAS_DBLCLICK_ACTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={setCanvasDblClickCreates}
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

              <Row label="Toolbar da escrita">
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
                    { value: "editor", label: "Livre" },
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

              <Row
                label="Posição do Índice"
                hint={
                  outlineSide === "left"
                    ? "Embaixo da Sidebar"
                    : outlineSide === "floating"
                      ? "Painel flutuante (arrastável)"
                      : "Junto do Inspector"
                }
              >
                <SelectControl
                  value={outlineSide}
                  options={[
                    { value: "right", label: "Direita" },
                    { value: "left", label: "Esquerda" },
                    { value: "floating", label: "Flutuante" },
                  ]}
                  onChange={setOutlineSide}
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
                label="Backup do projeto"
                hint={backupMessage ?? "Copia notas para .solon/backups sem alterar seus arquivos."}
                icon={<Archive size={12} />}
              >
                <ActionButton onClick={onCreateBackup} disabled={!rootFolder || creatingBackup}>
                  {creatingBackup ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar"
                  )}
                </ActionButton>
              </Row>

              <Row
                label="Restaurar último backup"
                hint="Sobrescreve notas existentes com a cópia local mais recente."
              >
                <ActionButton onClick={onRestoreBackup} disabled={!rootFolder || restoringBackup}>
                  {restoringBackup ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Restaurando...
                    </>
                  ) : (
                    "Restaurar"
                  )}
                </ActionButton>
              </Row>

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
          <button onClick={close} className="solon-btn solon-btn--primary">
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
      className="p-3 flex flex-col gap-2"
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius)",
        background: "color-mix(in srgb, var(--bg-panel) 70%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.84rem",
              fontWeight: 600,
            }}
          >
            Dicionário pessoal
          </div>
          <div
            className="italic"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "0.72rem",
            }}
          >
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
  // Section = card minimalista: hairline, cantos suaves, sem sombra
  // (cards estaticos dentro do dialog nao precisam elevacao). Header com
  // label small-caps discreto.
  return (
    <section
      className="p-4 flex flex-col gap-3"
      style={{
        background: "var(--bg-panel-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius)",
      }}
    >
      <div>
        <div className="mb-1">
          <span className="solon-plaque">{title}</span>
        </div>
        {description && (
          <p
            className="text-[0.74rem] mt-1.5 leading-snug"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontStyle: "italic",
            }}
          >
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
      className="px-3 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--bg-panel) 64%, transparent)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <span className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              {icon}
            </span>
          )}
          <span
            className="text-[0.82rem] truncate"
            style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}
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
          className="px-2 py-0.5 tabular-nums"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.66rem",
            background: "transparent",
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
      className="min-w-[152px] px-2.5 py-1.5 outline-none"
      style={{
        background: "var(--bg-panel)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-ui)",
        fontSize: "0.8rem",
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
  // Switch arredondado minimalista: track pill + knob deslizante, accent
  // quando ligado. Limpo e familiar.
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className="relative inline-block transition-colors"
        style={{
          width: 30,
          height: 17,
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--accent)" : "var(--border-strong)",
        }}
        aria-hidden
      >
        <span
          className="absolute transition-transform"
          style={{
            top: 2,
            left: 2,
            width: 13,
            height: 13,
            borderRadius: "var(--radius-pill)",
            background: "var(--bg-panel)",
            transform: checked ? "translateX(13px)" : "translateX(0)",
            boxShadow: "var(--shadow-sm)",
          }}
        />
      </span>
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "0.8rem",
          color: checked ? "var(--text-primary)" : "var(--text-muted)",
        }}
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
      className={
        strong
          ? "solon-btn solon-btn--primary inline-flex items-center gap-1.5 disabled:opacity-60"
          : "solon-btn inline-flex items-center gap-1.5 disabled:opacity-60"
      }
      style={{ padding: "0.35rem 0.7rem", fontSize: "0.74rem" }}
    >
      {children}
    </button>
  );
}

function themeHint(value: string): string | undefined {
  return EDITOR_PAPERS.find((option) => option.value === value)?.hint;
}

function pageLayoutHint(value: string): string | undefined {
  return EDITOR_PAGE_LAYOUTS.find((option) => option.value === value)?.hint;
}

function getTextSizeLabel(value: string): string {
  return EDITOR_TEXT_SIZES.find((option) => option.value === value)?.label ?? "Médio";
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
