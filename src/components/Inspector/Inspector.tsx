import { useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { SCENE_STATUSES, SceneStatus } from "../../types/scene";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Inspector de cena — edita metadados YAML frontmatter.
 * Qualquer alteração cai no store e é persistida pelo useAutoSave.
 */
export function Inspector() {
  const {
    activeFilePath,
    activeFileName,
    sceneMeta,
    patchSceneMeta,
    wordCount,
    toggleInspector,
  } = useAppStore();

  const shellStyle: React.CSSProperties = {
    background: "var(--bg-panel-2)",
    borderLeft: "1px solid var(--border-subtle)",
  };

  if (!activeFilePath) {
    return (
      <div className="flex flex-col h-full" style={shellStyle}>
        <Header onClose={toggleInspector} />
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p
            className="text-[0.75rem] leading-relaxed"
            style={{ color: "var(--text-placeholder)" }}
          >
            Nenhuma cena aberta.
          </p>
        </div>
      </div>
    );
  }

  const target = sceneMeta.wordTarget ?? 0;
  const progress = target > 0 ? Math.min(100, (wordCount / target) * 100) : 0;
  const onTarget = target > 0 && wordCount >= target;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={shellStyle}
    >
      <Header onClose={toggleInspector} />

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Nome da cena */}
        <div
          className="text-[0.78rem] font-semibold truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {activeFileName?.replace(/\.(md|txt)$/, "")}
        </div>

        {/* Status */}
        <Field label="Status">
          <StatusSelect
            value={sceneMeta.status}
            onChange={(status) => patchSceneMeta({ status })}
          />
        </Field>

        {/* POV */}
        <Field label="Ponto de vista (POV)">
          <TextInput
            value={sceneMeta.pov ?? ""}
            onChange={(v) => patchSceneMeta({ pov: v || undefined })}
            placeholder="Ex: Elara"
          />
        </Field>

        {/* Local */}
        <Field label="Local">
          <TextInput
            value={sceneMeta.location ?? ""}
            onChange={(v) => patchSceneMeta({ location: v || undefined })}
            placeholder="Ex: Aldeia de Arken"
          />
        </Field>

        {/* Tempo */}
        <Field label="Tempo">
          <TextInput
            value={sceneMeta.time ?? ""}
            onChange={(v) => patchSceneMeta({ time: v || undefined })}
            placeholder="Ex: Manhã, dia 3"
          />
        </Field>

        {/* Sinopse */}
        <Field label="Sinopse">
          <textarea
            value={sceneMeta.synopsis ?? ""}
            onChange={(e) =>
              patchSceneMeta({ synopsis: e.target.value || undefined })
            }
            placeholder="Resumo em 1–2 frases do que acontece nesta cena."
            rows={3}
            className="w-full resize-none px-2 py-1.5 text-[0.78rem] rounded outline-none leading-relaxed"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />
        </Field>

        {/* Meta de palavras */}
        <Field label="Meta de palavras">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={100}
              value={sceneMeta.wordTarget ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                patchSceneMeta({
                  wordTarget: Number.isFinite(n) && n > 0 ? n : undefined,
                });
              }}
              placeholder="0"
              className="w-24 px-2 py-1 text-[0.78rem] rounded outline-none"
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            />
            <span
              className="text-[0.72rem]"
              style={{ color: "var(--text-muted)" }}
            >
              palavras
            </span>
          </div>
          {target > 0 && (
            <div className="mt-2 space-y-1">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--bg-hover)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${progress}%`,
                    background: onTarget
                      ? "var(--success)"
                      : "var(--accent-2)",
                  }}
                />
              </div>
              <div
                className="text-[0.68rem]"
                style={{ color: "var(--text-muted)" }}
              >
                {wordCount.toLocaleString("pt-BR")} / {target.toLocaleString("pt-BR")} (
                {Math.round(progress)}%)
                {onTarget && (
                  <span
                    className="ml-1"
                    style={{ color: "var(--success)" }}
                  >
                    ✓ meta
                  </span>
                )}
              </div>
            </div>
          )}
        </Field>

        {/* Tags */}
        <Field label="Tags">
          <TagsEditor
            tags={sceneMeta.tags ?? []}
            onChange={(tags) =>
              patchSceneMeta({ tags: tags.length ? tags : undefined })
            }
          />
        </Field>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center justify-between px-3 py-3"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <span
        className="text-[0.7rem] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        Cena
      </span>
      <button
        onClick={onClose}
        title="Fechar Inspector (Ctrl+Alt+I)"
        aria-label="Fechar Inspector"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="p-1 rounded transition-colors"
        style={{
          background: hovered ? "var(--bg-hover)" : "transparent",
          color: hovered ? "var(--text-secondary)" : "var(--text-muted)",
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div
        className="text-[0.65rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 text-[0.78rem] rounded outline-none"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    />
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: SceneStatus | undefined;
  onChange: (v: SceneStatus | undefined) => void;
}) {
  return (
    <div className="flex gap-1">
      <StatusButton
        selected={!value}
        onClick={() => onChange(undefined)}
        label="—"
      />
      {SCENE_STATUSES.map((s) => (
        <StatusButton
          key={s.value}
          selected={value === s.value}
          onClick={() => onChange(s.value)}
          label={s.label}
          color={s.color}
        />
      ))}
    </div>
  );
}

function StatusButton({
  selected,
  onClick,
  label,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const [hovered, setHovered] = useState(false);
  // Quando selecionado com cor custom, usa a cor do status como bg/border.
  // Sem cor (botão "—"): usa accent.
  const style: React.CSSProperties = selected
    ? color
      ? { background: color, borderColor: color, color: "#fff" }
      : {
          background: "var(--bg-selected)",
          borderColor: "var(--accent)",
          color: "var(--text-primary)",
        }
    : {
        background: "var(--bg-panel)",
        borderColor: hovered ? "var(--accent)" : "var(--border)",
        color: "var(--text-secondary)",
      };
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        "px-2 py-1 text-[0.7rem] rounded border transition-colors",
      )}
      style={style}
    >
      {label}
    </button>
  );
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  // Se tags externas mudarem (troca de arquivo), limpa input
  useEffect(() => {
    setInput("");
  }, [tags.join("|")]);

  const addTag = () => {
    const t = input.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setInput("");
      return;
    }
    onChange([...tags, t]);
    setInput("");
  };

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <TagPill key={t} tag={t} onRemove={() => removeTag(t)} />
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          } else if (e.key === "Backspace" && !input && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder="Adicionar tag + Enter"
        className="w-full px-2 py-1 text-[0.75rem] rounded outline-none"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      />
    </div>
  );
}

function TagPill({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.7rem] rounded"
      style={{
        background: "var(--bg-hover)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {tag}
      <button
        onClick={onRemove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Remover"
        style={{
          color: hovered ? "var(--danger)" : "var(--text-placeholder)",
        }}
      >
        <X size={10} />
      </button>
    </span>
  );
}
