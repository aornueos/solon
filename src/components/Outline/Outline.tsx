import { useState } from "react";
import { useAppStore, HeadingItem } from "../../store/useAppStore";
import { getCurrentEditor } from "../../lib/editorRef";
import clsx from "clsx";

/**
 * Indice das secoes do documento. Cada linha mostra:
 *  - indentacao por level (H1 fundo, H6 mais a' direita)
 *  - titulo da secao
 *  - contagem de palavras da secao (heading inclusivo, ate o proximo
 *    heading do doc)
 *
 * Drag-and-drop reordena secoes inteiras: arrastar um heading move o
 * heading + todo o conteudo abaixo dele (ate o proximo heading) pra uma
 * nova posicao no doc. Drop indicator (linha amber) aparece em cima do
 * row alvo enquanto o user arrasta.
 *
 * Implementado via DOM transactions do TipTap — ProseMirror gerencia
 * mapping automatico entre delete + insert pra que as posicoes nao se
 * invalidem no meio.
 */
export function Outline() {
  const headings = useAppStore((s) => s.headings);
  const activeFileName = useAppStore((s) => s.activeFileName);

  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

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
            {headings.map((heading, idx) => (
              <HeadingRow
                key={`${heading.pos}-${heading.level}`}
                heading={heading}
                idx={idx}
                isDragSource={dragId === heading.pos}
                isDropTarget={dropIdx === idx}
                onDragStart={() => setDragId(heading.pos)}
                onDragOver={() => setDropIdx(idx)}
                onDragLeave={() => {
                  // Limpa so' se o leave era pra ESTE idx — events de
                  // children podem disparar leave/over alternados.
                  setDropIdx((curr) => (curr === idx ? null : curr));
                }}
                onDrop={() => {
                  if (dragId !== null && dragId !== heading.pos) {
                    void reorderSection(dragId, heading.pos);
                  }
                  setDragId(null);
                  setDropIdx(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIdx(null);
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
  isDragSource,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  heading: HeadingItem;
  idx: number;
  isDragSource: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Dado simbolico — a referencia real esta no state do Outline.
        e.dataTransfer.setData("text/plain", String(heading.pos));
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
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
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          document.dispatchEvent(
            new CustomEvent("solon:scroll-to", { detail: { pos: heading.pos } }),
          );
        }}
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
 * `sourcePos` e a posicao do heading que esta sendo arrastado;
 * `targetPos` e a posicao do heading-alvo (a secao source vai parar
 * ANTES desse target).
 *
 * Usa o `mapping` da transaction pra ajustar posicoes apos o delete —
 * sem isso o insert apontaria pra lugar errado. Tudo numa unica
 * transaction (1 entry no undo stack).
 */
async function reorderSection(sourcePos: number, targetPos: number) {
  const editor = getCurrentEditor();
  if (!editor) return;
  const state = editor.state;
  const headings = useAppStore.getState().headings;
  const source = headings.find((h) => h.pos === sourcePos);
  const target = headings.find((h) => h.pos === targetPos);
  if (!source || !target) return;
  if (source.pos === target.pos) return;

  // Sanity: nao deixa um heading "engolir a si mesmo" — se o target
  // esta DENTRO do range do source, ignora.
  if (target.pos >= source.pos && target.pos < source.endPos) return;

  // Pega o slice ANTES de mutar — o doc atual ainda esta intacto.
  const slice = state.doc.slice(source.pos, source.endPos);

  // Transaction: delete source range, depois insere o slice antes do
  // target. tr.mapping.map() resolve onde o target ficou apos o delete.
  const tr = state.tr.delete(source.pos, source.endPos);
  const mappedTarget = tr.mapping.map(target.pos);
  tr.insert(mappedTarget, slice.content);
  editor.view.dispatch(tr);
  // O onUpdate do editor (debounced 180ms) vai re-extrair headings,
  // entao a Outline atualiza sozinha apos o reorder.
}
