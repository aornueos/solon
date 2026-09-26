import { useRef, useState } from "react";
import { useAppStore, HeadingItem } from "../../store/useAppStore";
import { getCurrentEditor } from "../../lib/editorRef";
import { startDrag } from "../../lib/drag";
import clsx from "clsx";

/**
 * Indice das secoes do documento. Cada linha mostra:
 *  - indentacao por level (H1 fundo, H6 mais a' direita)
 *  - título da secao
 *  - contagem de palavras da secao (heading inclusivo, ate o proximo
 *    heading do doc)
 *
 * Arrastar reordena secoes inteiras: arrastar um heading move o heading
 * + todo o conteudo abaixo dele (ate o proximo heading) pra uma nova
 * posição no doc. Drop indicator (linha amber) aparece em cima do row
 * alvo enquanto o user arrasta. O arraste é por mouse, como no explorador:
 * o drag-and-drop do HTML5 falha no webview do Tauri no Windows.
 *
 * Implementado via DOM transactions do TipTap — ProseMirror gerencia
 * mapping automático entre delete + insert pra que as posições não se
 * invalidem no meio.
 */
export function Outline() {
  const headings = useAppStore((s) => s.headings);
  const activeFileName = useAppStore((s) => s.activeFileName);

  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const startSectionDrag = (e: React.MouseEvent, heading: HeadingItem) => {
    if (e.button !== 0) return;
    const originX = e.clientX;
    const originY = e.clientY;
    let dragging = false;
    let target: number | null = null;
    let lastX = originX;
    let lastY = originY;
    let autoScrollFrame = 0;

    const rowAt = (x: number, y: number): number | null => {
      const row = document
        .elementsFromPoint(x, y)
        .map((el) => (el as HTMLElement).closest?.<HTMLElement>("[data-outline-index]"))
        .find((el): el is HTMLElement => !!el);
      return row ? Number(row.dataset.outlineIndex) : null;
    };

    // Índice longo: encostar na borda de cima ou de baixo rola a lista.
    const autoScroll = () => {
      autoScrollFrame = 0;
      const list = listRef.current;
      if (!dragging || !list) return;
      const rect = list.getBoundingClientRect();
      if (lastX < rect.left || lastX > rect.right) return;
      const zone = 28;
      let dy = 0;
      if (lastY < rect.top + zone) dy = -Math.min(12, Math.ceil((rect.top + zone - lastY) / 3));
      else if (lastY > rect.bottom - zone) dy = Math.min(12, Math.ceil((lastY - rect.bottom + zone) / 3));
      if (dy === 0) return;
      const before = list.scrollTop;
      list.scrollTop += dy;
      if (list.scrollTop === before) return;
      target = rowAt(lastX, lastY);
      setDropIdx(target);
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    const finish = () => {
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
      document.documentElement.classList.remove("solon-dragging");
      setDragId(null);
      setDropIdx(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    startDrag({
      onMove: (ev) => {
        if (!dragging && Math.hypot(ev.clientX - originX, ev.clientY - originY) < 5) return;
        if (!dragging) {
          dragging = true;
          suppressClickRef.current = true;
          setDragId(heading.pos);
          document.documentElement.classList.add("solon-dragging");
        }
        ev.preventDefault();
        lastX = ev.clientX;
        lastY = ev.clientY;
        target = rowAt(ev.clientX, ev.clientY);
        setDropIdx(target);
        if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll);
      },
      onEnd: (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const idx = rowAt(ev.clientX, ev.clientY) ?? target;
        finish();
        const dest = idx === null ? undefined : headings[idx];
        if (dest && dest.pos !== heading.pos) void reorderSection(heading.pos, dest.pos);
      },
      onCancel: () => {
        if (dragging) finish();
      },
    });
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-panel-2)",
        borderLeft: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header — label "Índice" em small-caps. Mesma gramatica da Sidebar. */}
      <div className="px-3.5 py-3 solon-plaque-bar">
        <span className="solon-plaque">Índice</span>
      </div>

      {/* Lista de headings */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-2">
        {headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <span style={{ color: "var(--border-strong)", fontSize: 22 }} aria-hidden>
              ❦
            </span>
            <p
              className="leading-relaxed italic"
              style={{
                color: "var(--text-placeholder)",
                fontFamily: "var(--font-ui)",
                fontSize: "0.82rem",
              }}
            >
              {activeFileName
                ? "Adicione títulos (#, ##, ###) para ver o índice"
                : "Nenhum arquivo aberto"}
            </p>
          </div>
        ) : (
          <nav>
            {headings.map((heading, idx) => (
              <HeadingRow
                key={`${heading.pos}-${heading.level}`}
                heading={heading}
                idx={idx}
                isDragSource={dragId === heading.pos}
                isDropTarget={dropIdx === idx}
                onMouseDown={(e) => startSectionDrag(e, heading)}
                onJump={() => {
                  // O mouseup de um arraste vira clique; não é para pular.
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  document.dispatchEvent(
                    new CustomEvent("solon:scroll-to", {
                      detail: { pos: heading.pos, text: heading.text, level: heading.level },
                    }),
                  );
                }}
              />
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

const INDENT_PX: Record<number, number> = {
  1: 12,
  2: 22,
  3: 32,
  4: 42,
  5: 50,
  6: 50,
};
const SIZE_CLASS: Record<number, string> = {
  1: "text-[0.8125rem] font-semibold",
  2: "text-[0.78rem] font-medium",
  3: "text-[0.75rem]",
  4: "text-[0.72rem]",
  5: "text-[0.72rem]",
  6: "text-[0.72rem]",
};
const COLOR: Record<number, string> = {
  1: "var(--text-primary)",
  2: "var(--text-primary)",
  3: "var(--text-secondary)",
  4: "var(--text-secondary)",
  5: "var(--text-muted)",
  6: "var(--text-muted)",
};

function HeadingRow({
  heading,
  idx,
  isDragSource,
  isDropTarget,
  onMouseDown,
  onJump,
}: {
  heading: HeadingItem;
  idx: number;
  isDragSource: boolean;
  isDropTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onJump: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative" data-outline-index={idx} onMouseDown={onMouseDown}>
      {/* Drop indicator: linha amber em cima do alvo. */}
      {isDropTarget && !isDragSource && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: -1,
            height: 2,
            background: "var(--accent)",
            zIndex: 2,
          }}
        />
      )}
      <button
        className={clsx(
          "w-full text-left py-[3px] transition-colors rounded-sm flex items-baseline gap-2",
          SIZE_CLASS[heading.level] ?? "text-[0.75rem]",
        )}
        style={{
          paddingLeft: INDENT_PX[heading.level] ?? 12,
          paddingRight: 12,
          background: hovered ? "var(--bg-hover)" : "transparent",
          color: COLOR[heading.level] ?? "var(--text-secondary)",
          opacity: isDragSource ? 0.4 : 1,
          cursor: "grab",
          // Inter — mesma familia da Sidebar (painel oposto). Os dois paineis
          // laterais compartilham header, gramatica e fonte.
          fontFamily: "var(--font-ui)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onJump}
      >
        <span className="truncate flex-1 leading-relaxed">{heading.text || "(sem título)"}</span>
        {heading.wordCount > 0 && (
          <span
            className="text-[0.62rem] tabular-nums flex-shrink-0"
            style={{ color: "var(--text-placeholder)" }}
            title={`${heading.wordCount.toLocaleString("pt-BR")} palavras nesta seção`}
          >
            {formatCount(heading.wordCount)}
          </span>
        )}
      </button>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Reordena uma seção (heading inclusivo + conteudo) no doc do editor.
 *
 * `sourcePos` e a posição do heading que esta sendo arrastado;
 * `targetPos` e a posição do heading-alvo (a secao source vai parar
 * ANTES desse target).
 *
 * Usa o `mapping` da transaction pra ajustar posições após o delete —
 * sem isso o insert apontaria pra lugar errado. Tudo numa única
 * transaction (1 entry no undo stack).
 */
async function reorderSection(sourcePos: number, targetPos: number) {
  const editor = getCurrentEditor();
  // No código-fonte as posições do Índice são linhas do Markdown, e o
  // editor visual está escondido com o texto de antes.
  if (!editor || useAppStore.getState().sourceMode) return;
  const state = editor.state;
  const headings = useAppStore.getState().headings;
  const source = headings.find((h) => h.pos === sourcePos);
  const target = headings.find((h) => h.pos === targetPos);
  if (!source || !target) return;
  if (source.pos === target.pos) return;

  // Sanity: não deixa um heading "engolir a si mesmo" — se o target
  // esta DENTRO do range do source, ignora.
  if (target.pos >= source.pos && target.pos < source.endPos) return;

  // Pega o slice ANTES de mutar — o doc atual ainda esta intacto.
  const slice = state.doc.slice(source.pos, source.endPos);

  // Transaction: delete source range, depois insere o slice antes do
  // target. tr.mapping.map() resolve onde o target ficou após o delete.
  const tr = state.tr.delete(source.pos, source.endPos);
  const mappedTarget = tr.mapping.map(target.pos);
  tr.insert(mappedTarget, slice.content);
  editor.view.dispatch(tr);
  // O onUpdate do editor (debounced 180ms) vai re-extrair headings,
  // então a Outline atualiza sozinha após o reorder.
}
