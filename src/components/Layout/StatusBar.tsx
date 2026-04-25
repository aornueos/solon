import { useAppStore } from "../../store/useAppStore";
import clsx from "clsx";

export function StatusBar() {
  const wordCount = useAppStore((s) => s.wordCount);
  const charCount = useAppStore((s) => s.charCount);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const sceneMeta = useAppStore((s) => s.sceneMeta);
  const target = sceneMeta.wordTarget ?? 0;
  const progress = target > 0 ? Math.min(100, (wordCount / target) * 100) : 0;
  const onTarget = target > 0 && wordCount >= target;

  return (
    <div
      className="flex items-center justify-between h-6 px-4 text-[0.68rem]"
      style={{
        background: "var(--bg-panel-2)",
        borderTop: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
      }}
    >
      <div className="truncate max-w-[40%]">
        {activeFilePath ? (
          <span className="truncate font-mono opacity-60">{activeFilePath}</span>
        ) : (
          <span>Nenhum arquivo</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {target > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className={clsx("tabular-nums", onTarget && "font-medium")}
              style={onTarget ? { color: "var(--success)" } : undefined}
            >
              {wordCount.toLocaleString("pt-BR")} / {target.toLocaleString("pt-BR")} palavras
            </span>
            <div
              className="w-20 h-1 rounded-full overflow-hidden"
              style={{ background: "var(--bg-hover)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: onTarget ? "var(--success)" : "var(--accent-2)",
                }}
              />
            </div>
          </div>
        ) : (
          <span className="tabular-nums">
            {wordCount.toLocaleString("pt-BR")} palavras
          </span>
        )}
        <span className="tabular-nums">
          {charCount.toLocaleString("pt-BR")} caracteres
        </span>
        <span style={{ color: "var(--accent)" }}>Markdown</span>
      </div>
    </div>
  );
}
