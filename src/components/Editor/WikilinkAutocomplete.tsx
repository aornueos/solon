import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { FileText } from "lucide-react";

interface SuggestState {
  /** Texto entre `[[` e o caret (consulta atual do user). */
  query: string;
  /** Posicao do `[[` no doc (inclusivo). */
  from: number;
  /** Posicao do caret no doc (= fim do query). */
  to: number;
  /** Coords viewport pra posicionar o popup. */
  left: number;
  top: number;
}

interface Props {
  editor: Editor;
}

/**
 * Autocomplete de wikilinks. Detecta quando o caret esta dentro de
 * `[[...]]` (sem o segundo `]` fechado ainda), abre popup com lista
 * dos arquivos do projeto filtrada pelo texto digitado, e ao
 * selecionar substitui `[[query` (ou `[[query]]` se ja' fechou) por
 * `[[selected]]`.
 *
 * Setas navegam, Enter seleciona, Esc fecha. Mouse hover tambem
 * navega. Quando o user move o caret pra fora do trigger, fecha
 * automaticamente.
 */
export function WikilinkAutocomplete({ editor }: Props) {
  const fileTree = useAppStore((s) => s.fileTree);
  const [state, setState] = useState<SuggestState | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Lista de arquivos do projeto (basenames sem extensao). Memo no tree
  // — recalcula apenas em mudanca de arvore.
  const files = useMemo(() => flatten(fileTree), [fileTree]);

  // Detecta trigger no caret. Roda em cada update/selectionUpdate.
  useEffect(() => {
    const detect = () => {
      const { state: pmState } = editor;
      const { from, to } = pmState.selection;
      if (from !== to) {
        setState(null);
        return;
      }
      // Pega ate' 80 chars antes do caret no mesmo paragrafo.
      const $pos = pmState.doc.resolve(from);
      const blockStart = $pos.start();
      const textBefore = pmState.doc.textBetween(blockStart, from, "\n", " ");
      // Acha o ULTIMO `[[` antes do caret sem `]]` fechando entre os
      // dois. Regex greedy: pega tudo de `[[` ate o caret se nao houver
      // `]` no meio. Newline dentro do textBetween foi sub por "\n" —
      // tambem invalida trigger (wikilink so' em uma linha).
      const m = textBefore.match(/\[\[([^\]\n\[]*)$/);
      if (!m) {
        setState(null);
        return;
      }
      const query = m[1];
      // from local = posicao do `[` aberto. blockStart + offset onde o
      // match comeca + 2 (pula `[[`).
      const matchIdx = textBefore.lastIndexOf("[[");
      const queryStart = blockStart + matchIdx + 2;
      // Coords no viewport pro popup posicionar.
      try {
        const coords = editor.view.coordsAtPos(queryStart);
        setState({
          query,
          from: queryStart - 2, // inclui o `[[`
          to: from,
          left: coords.left,
          top: coords.bottom + 4,
        });
        setActiveIdx(0);
      } catch {
        setState(null);
      }
    };
    editor.on("selectionUpdate", detect);
    editor.on("update", detect);
    detect();
    return () => {
      editor.off("selectionUpdate", detect);
      editor.off("update", detect);
    };
  }, [editor]);

  // Filtra a lista pelo query. Match prefix-first + substring fallback.
  // Cap em 8 results pra nao explodir o popup.
  const results = useMemo(() => {
    if (!state) return [];
    const q = normalize(state.query);
    if (!q) return files.slice(0, 8);
    const prefix: FileNode[] = [];
    const sub: FileNode[] = [];
    for (const f of files) {
      const base = normalize(f.name.replace(/\.(md|txt)$/i, ""));
      if (base.startsWith(q)) prefix.push(f);
      else if (base.includes(q)) sub.push(f);
    }
    return [...prefix, ...sub].slice(0, 8);
  }, [state, files]);

  // Keyboard: setas + Enter + Esc.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setState(null);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(results.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pick = results[activeIdx];
        if (pick) {
          e.preventDefault();
          insertWikilink(editor, state, pick.name);
          setState(null);
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state, results, activeIdx, editor]);

  if (!state || results.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Sugestões de wikilink"
      className="fixed z-[115] rounded-md shadow-xl overflow-hidden"
      style={{
        left: state.left,
        top: state.top,
        minWidth: 220,
        maxWidth: 340,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
      // Impede que click no popup roube o foco do editor (perderia o
      // caret e a transacao de insert).
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className="px-2 py-1 text-[0.62rem] uppercase tracking-widest"
        style={{
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        Wikilink → arquivo
      </div>
      <ul className="py-1 max-h-[40vh] overflow-y-auto">
        {results.map((f, idx) => {
          const display = f.name.replace(/\.(md|txt)$/i, "");
          const isActive = idx === activeIdx;
          return (
            <li key={f.path}>
              <button
                type="button"
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  insertWikilink(editor, state, f.name);
                  setState(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
                style={{
                  background: isActive ? "var(--bg-hover)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                <FileText
                  size={12}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />
                <span className="truncate text-[0.78rem]">{display}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file" && /\.(md|txt)$/i.test(n.name)) out.push(n);
    if (n.children) out.push(...flatten(n.children));
  }
  return out;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Substitui o trigger ativo `[[query` (e qualquer `]]` que ja foi
 * digitado no caret) pelo wikilink completo. O InputRule da
 * WikilinkExtension transforma o resultado em mark automaticamente.
 */
function insertWikilink(editor: Editor, state: SuggestState, fileName: string) {
  const target = fileName.replace(/\.(md|txt)$/i, "");
  const inserted = `[[${target}]]`;
  // `state.to` aponta pro caret no momento da deteccao. Se o user
  // continuou digitando, a posicao pode estar desatualizada — mas
  // pra o caso comum (digitou ate' Enter), funciona. Re-le o doc no
  // momento da transacao pra sanity.
  const currentTo = editor.state.selection.from;
  editor
    .chain()
    .focus()
    .deleteRange({ from: state.from, to: currentTo })
    .insertContent(inserted)
    .run();
}
