import { useState } from "react";
import { useAppStore, HeadingItem } from "../../store/useAppStore";
import clsx from "clsx";

export function Outline() {
  const headings = useAppStore((s) => s.headings);
  const activeFileName = useAppStore((s) => s.activeFileName);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-panel-2)",
        borderLeft: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[0.7rem] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Índice
        </span>
      </div>

      {/* Lista de headings */}
      <div className="flex-1 overflow-y-auto py-2">
        {headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p
              className="text-[0.75rem] leading-relaxed"
              style={{ color: "var(--text-placeholder)" }}
            >
              {activeFileName
                ? "Adicione títulos (#, ##, ###) para ver o índice"
                : "Nenhum arquivo aberto"}
            </p>
          </div>
        ) : (
          <nav>
            {headings.map((heading) => (
              // `pos` (offset no doc) é estável e único por heading dentro
              // de um doc, mesmo quando o usuário reordena seções — index
              // como key quebrava highlight/scroll state em reorder.
              <HeadingRow
                key={`${heading.pos}-${heading.level}`}
                heading={heading}
              />
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function HeadingRow({ heading }: { heading: HeadingItem }) {
  const [hovered, setHovered] = useState(false);
  const indentMap: Record<number, string> = {
    1: "px-3",
    2: "px-5",
    3: "px-7",
    4: "px-9",
    5: "px-11",
    6: "px-11",
  };

  // Hierarquia de níveis: o H1 puxa o text-primary pleno e desce em
  // saturação/tamanho até H6 (muted). No dark tema isso continua
  // legível porque `--text-primary` e `--text-muted` já foram ajustados
  // pro tom grafite.
  const sizeMap: Record<number, string> = {
    1: "text-[0.8125rem] font-semibold",
    2: "text-[0.78rem] font-medium",
    3: "text-[0.75rem]",
    4: "text-[0.72rem]",
    5: "text-[0.72rem]",
    6: "text-[0.72rem]",
  };
  const colorMap: Record<number, string> = {
    1: "var(--text-primary)",
    2: "var(--text-primary)",
    3: "var(--text-secondary)",
    4: "var(--text-secondary)",
    5: "var(--text-muted)",
    6: "var(--text-muted)",
  };

  return (
    <button
      className={clsx(
        "w-full text-left py-[3px] transition-colors rounded-sm mx-0",
        indentMap[heading.level] ?? "px-3",
        sizeMap[heading.level] ?? "text-[0.75rem]",
      )}
      style={{
        background: hovered ? "var(--bg-hover)" : "transparent",
        color: colorMap[heading.level] ?? "var(--text-secondary)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        // Scroll to heading in editor — implementado via evento customizado
        document.dispatchEvent(
          new CustomEvent("solon:scroll-to", { detail: { pos: heading.pos } })
        );
      }}
    >
      <span className="truncate block leading-relaxed">{heading.text}</span>
    </button>
  );
}
