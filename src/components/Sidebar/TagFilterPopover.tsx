import { useEffect, useRef, useState } from "react";
import { Tag, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { buildTagIndex, uniqueTags, type TagIndex } from "../../lib/tagIndex";

interface Props {
  onClose: () => void;
  anchor: HTMLElement | null;
}

/**
 * Popover ancorado no botao de filtro de tags da Sidebar. Indexa as
 * tags do projeto sob demanda (uma vez por abertura — re-indexa se o
 * fileTree mudou de identidade). Clicar numa tag aplica filtro;
 * "Limpar" remove.
 */
export function TagFilterPopover({ onClose, anchor }: Props) {
  const fileTree = useAppStore((s) => s.fileTree);
  const activeTagFilter = useAppStore((s) => s.activeTagFilter);
  const setActiveTagFilter = useAppStore((s) => s.setActiveTagFilter);
  const setTagIndex = useAppStore((s) => s.setTagIndex);

  const [index, setIndex] = useState<TagIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Posicao calculada do anchor — atualiza so' no mount (se o user
  // redimensionar a janela durante o popover aberto, fecha de qualquer
  // jeito por mousedown fora).
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const idx = await buildTagIndex(fileTree);
      if (cancelled) return;
      setIndex(idx);
      setTagIndex(idx);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fileTree, setTagIndex]);

  // Fecha ao clicar fora ou Esc.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      if (anchor && e.target instanceof Node && anchor.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchor]);

  const tags = index ? uniqueTags(index) : [];

  if (!position) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Filtrar por tag"
      className="fixed z-[110] rounded-md shadow-xl overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        minWidth: 200,
        maxWidth: 280,
        maxHeight: 360,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[0.65rem] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Filtrar por tag
        </span>
        {activeTagFilter && (
          <button
            onClick={() => {
              setActiveTagFilter(null);
              onClose();
            }}
            className="text-[0.7rem] inline-flex items-center gap-1 hover:underline"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={10} /> Limpar
          </button>
        )}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
        {loading ? (
          <div
            className="px-3 py-4 text-center text-[0.75rem] italic"
            style={{ color: "var(--text-muted)" }}
          >
            indexando…
          </div>
        ) : tags.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-[0.75rem]"
            style={{ color: "var(--text-muted)" }}
          >
            Nenhuma tag no projeto.<br />
            <span className="text-[0.65rem] italic">
              Adicione tags pelo Inspector da cena.
            </span>
          </div>
        ) : (
          <ul className="py-1">
            {tags.map(({ tag, count }) => {
              const isActive = activeTagFilter === tag;
              return (
                <li key={tag}>
                  <button
                    onClick={() => {
                      setActiveTagFilter(isActive ? null : tag);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors"
                    style={{
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Tag size={11} />
                      <span className="truncate">{tag}</span>
                    </span>
                    <span
                      className="text-[0.68rem] tabular-nums flex-shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
