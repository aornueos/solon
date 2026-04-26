import { useEffect, useState } from "react";
import { X, Sun, Moon, RotateCcw, Save, Sparkles, SpellCheck } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { getPersonalDictSize } from "../../lib/spellcheck";

/**
 * Dialog de Preferencias.
 *
 * Editorial — sem dezenas de toggles. So o que o usuario realmente
 * configuraria num app de escrita: aparencia (tema, zoom do texto),
 * comportamento de save, updates. Botao "Restaurar padroes" no rodape
 * pra desfazer experimentacao.
 *
 * Persistencia: cada setter da store grava no localStorage diretamente
 * (mesmo padrao do `setTheme`/`setRootFolder`). O dialog so le/escreve
 * via store — nao toca em localStorage diretamente.
 */
export function SettingsDialog() {
  const show = useAppStore((s) => s.showSettings);
  const close = useAppStore((s) => s.closeSettings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const editorZoom = useAppStore((s) => s.editorZoom);
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const autoSaveEnabled = useAppStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useAppStore((s) => s.setAutoSaveEnabled);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useAppStore((s) => s.setAutoCheckUpdates);
  const spellcheckEnabled = useAppStore((s) => s.spellcheckEnabled);
  const setSpellcheckEnabled = useAppStore((s) => s.setSpellcheckEnabled);
  const resetSettings = useAppStore((s) => s.resetSettings);

  // Re-le o tamanho do dicionario pessoal toda vez que o dialog abre.
  // Sem reactividade real — a store nao tracka isso (ficaria barulhento
  // pra um numero que muda raro). Snapshot na abertura e' suficiente.
  const [personalDictSize, setPersonalDictSize] = useState(0);
  useEffect(() => {
    if (show) setPersonalDictSize(getPersonalDictSize());
  }, [show]);

  // Esc fecha o dialog. Listener no nivel da janela (e' dialog modal,
  // entao um Esc deveria fecha-lo independente de foco).
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
        className="w-full max-w-lg rounded-lg shadow-xl flex flex-col max-h-[85vh]"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-5 pb-4 flex items-start justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <div
              className="text-[0.62rem] uppercase tracking-[0.25em] mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Solon
            </div>
            <h2
              id="settings-title"
              className="font-serif text-2xl tracking-tight"
            >
              Preferências
            </h2>
          </div>
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
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-7">
          {/* Aparencia */}
          <Section title="Aparência">
            <Row
              label="Tema"
              hint="O dark sépia preserva a paleta editorial."
            >
              <SegmentedControl
                value={theme}
                options={[
                  { value: "light", label: "Claro", icon: <Sun size={12} /> },
                  { value: "dark", label: "Escuro", icon: <Moon size={12} /> },
                ]}
                onChange={(v) => setTheme(v as "light" | "dark")}
              />
            </Row>

            <Row
              label="Zoom do texto"
              hint={`${editorZoom}% — afeta só o editor; UI fica fixa.`}
            >
              <div className="flex items-center gap-3 w-full">
                <button
                  title="Diminuir"
                  onClick={() => setEditorZoom(editorZoom - 5)}
                  disabled={editorZoom <= 75}
                  className="px-2 py-1 rounded text-[0.78rem] font-mono transition-opacity disabled:opacity-30"
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
                  className="flex-1 accent-current"
                  style={{ color: "var(--accent)" }}
                />
                <button
                  title="Aumentar"
                  onClick={() => setEditorZoom(editorZoom + 5)}
                  disabled={editorZoom >= 200}
                  className="px-2 py-1 rounded text-[0.85rem] font-mono transition-opacity disabled:opacity-30"
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
                  className="px-2 py-1 rounded text-[0.7rem] transition-opacity"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  100%
                </button>
              </div>
            </Row>
          </Section>

          {/* Editor */}
          <Section title="Editor">
            <Row
              label="Auto-save"
              hint="Grava a cada 1.2s após você parar de digitar. Ctrl+S sempre salva."
              icon={<Save size={13} />}
            >
              <Toggle
                checked={autoSaveEnabled}
                onChange={setAutoSaveEnabled}
                label={autoSaveEnabled ? "Ativado" : "Desativado"}
              />
            </Row>

            <Row
              label="Verificação ortográfica (pt-BR)"
              hint={
                personalDictSize > 0
                  ? `Sublinhado vermelho + sugestões no clique direito. ${personalDictSize} ${personalDictSize === 1 ? "palavra" : "palavras"} no dicionário pessoal.`
                  : "Sublinhado vermelho em palavras erradas + sugestões clicáveis no clique direito. Carregado sob demanda."
              }
              icon={<SpellCheck size={13} />}
            >
              <Toggle
                checked={spellcheckEnabled}
                onChange={setSpellcheckEnabled}
                label={spellcheckEnabled ? "Ativada" : "Desativada"}
              />
            </Row>
          </Section>

          {/* Atualizacoes */}
          <Section title="Atualizações">
            <Row
              label="Verificar atualizações no boot"
              hint="Só roda no Tauri (no dev em browser fica inativo). Falhas de rede são silenciosas."
              icon={<Sparkles size={13} />}
            >
              <Toggle
                checked={autoCheckUpdates}
                onChange={setAutoCheckUpdates}
                label={autoCheckUpdates ? "Ativado" : "Desativado"}
              />
            </Row>
          </Section>

          {/* Sobre */}
          <Section title="Sobre">
            <div
              className="text-[0.82rem] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              <p className="font-serif italic mb-2">
                Solon — um editor para quem escreve devagar.
              </p>
              <div
                className="text-[0.75rem]"
                style={{ color: "var(--text-muted)" }}
              >
                Versão {APP_VERSION} · MIT
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={resetSettings}
            className="inline-flex items-center gap-1.5 text-[0.78rem] transition-opacity hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            <RotateCcw size={12} />
            Restaurar padrões
          </button>
          <button
            onClick={close}
            className="px-4 py-1.5 rounded text-[0.82rem] font-medium transition-colors"
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
 * Versao do app, injetada em build-time via `vite.config.ts` (campo
 * `define.__APP_VERSION__`). Single source of truth = `package.json`.
 * Bumpa la' e ja' propaga pra Sobre no proximo build.
 */
const APP_VERSION = __APP_VERSION__;

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
        className="text-[0.65rem] uppercase tracking-[0.2em] font-medium"
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <span style={{ color: "var(--text-muted)" }} className="flex-shrink-0">
              {icon}
            </span>
          )}
          <span
            className="font-serif text-[0.95rem]"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
        </div>
        <div className="flex-shrink-0 flex items-center">{children}</div>
      </div>
      {hint && (
        <p
          className="text-[0.75rem] italic leading-snug"
          style={{ color: "var(--text-muted)", paddingLeft: icon ? "1.25rem" : 0 }}
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.78rem] transition-colors"
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
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 transition-opacity"
    >
      <span
        className="relative inline-block w-9 h-5 rounded-full transition-colors"
        style={{
          background: checked ? "var(--accent)" : "var(--border)",
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            background: "var(--bg-panel)",
            transform: checked ? "translateX(16px)" : "translateX(0)",
            boxShadow: "var(--shadow-sm)",
          }}
        />
      </span>
      {label && (
        <span
          className="text-[0.78rem]"
          style={{ color: checked ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

