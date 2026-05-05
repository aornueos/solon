import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronUp, ChevronDown, X, Search } from "lucide-react";

/**
 * Barra de busca no editor. Substitui o find nativo do WebView2
 * (que tem CSS do Edge nada a ver com o tom do app).
 *
 * UX:
 *  - Ctrl+F abre + foca o input
 *  - Digite: highlights ao vivo, contador "1 de 4"
 *  - Enter = proximo, Shift+Enter = anterior
 *  - Esc = fecha
 *  - Click outside fecha tambem
 *
 * Implementacao: percorre `editor.state.doc.textContent` (texto cru
 * sem marcacao) procurando matches case-insensitive. Converte indices
 * de string pra positions ProseMirror via walk dos textBlocks.
 */
interface Props {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

interface Match {
  from: number;
  to: number;
}

export function FindBar({ editor, open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Foca o input quando a barra abre
  useEffect(() => {
    if (open) {
      // requestAnimationFrame pra esperar o render+layout — sem isso
      // o foco as vezes nao "pega" porque o input ainda nao esta no DOM.
      const raf = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Calcula matches quando query muda. Walk do doc inteiro coletando
  // posicoes ProseMirror onde a query bate. Case-insensitive.
  const matches = useMemo<Match[]>(() => {
    if (!query.trim() || !editor) return [];
    const result: Match[] = [];
    const lower = query.toLowerCase();
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = 0;
      while (true) {
        const found = text.indexOf(lower, idx);
        if (found < 0) break;
        // ProseMirror posicao do inicio do text node + offset
        result.push({
          from: pos + found,
          to: pos + found + query.length,
        });
        idx = found + Math.max(1, query.length);
      }
    });
    return result;
    // editor.state.doc dependencia: re-computa quando o doc muda. Mas
    // o React nao re-renderiza so' por mudanca interna do editor — por
    // isso a barra nao "atualiza ao vivo" se voce edita enquanto ela
    // ta aberta. Tradeoff aceitavel: editar normalmente fecha o foco
    // do input. Pra UX ainda melhor, daria pra subscribar via
    // editor.on("update", forceUpdate). Por agora, simplicidade.
  }, [query, editor, editor.state.doc]);

  // Reset do indice quando matches mudam
  useEffect(() => {
    setCurrentIdx(0);
  }, [matches]);

  // Navega pra um match: seleciona via ProseMirror command. O scroll
  // automatico do TipTap traz a selecao pra viewport.
  const goTo = useCallback(
    (idx: number) => {
      if (matches.length === 0) return;
      const i = ((idx % matches.length) + matches.length) % matches.length;
      const m = matches[i];
      editor
        .chain()
        .setTextSelection({ from: m.from, to: m.to })
        .scrollIntoView()
        .run();
      setCurrentIdx(i);
    },
    [editor, matches],
  );

  // Atualiza selecao quando indice muda (ex: usuario digita, contador
  // automatico vai pro primeiro match)
  useEffect(() => {
    if (matches.length === 0 || currentIdx >= matches.length) return;
    const m = matches[currentIdx];
    editor
      .chain()
      .setTextSelection({ from: m.from, to: m.to })
      .scrollIntoView()
      .run();
    // Importante: NAO chamamos focus() — focus iria pro editor e tira
    // do input, quebrando o "user esta digitando o query".
  }, [currentIdx, matches, editor]);

  if (!open) return null;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(e.shiftKey ? currentIdx - 1 : currentIdx + 1);
      return;
    }
  };

  const counter =
    matches.length === 0
      ? query.trim()
        ? "0 resultados"
        : ""
      : `${currentIdx + 1} de ${matches.length}`;

  return (
    <div
      className="absolute top-2 right-3 z-30 flex items-center gap-1 px-2 py-1 rounded shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <Search
        size={12}
        className="flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Buscar…"
        className="bg-transparent outline-none text-[0.78rem] w-[180px]"
        style={{ color: "var(--text-primary)" }}
      />
      <span
        className="text-[0.7rem] tabular-nums px-1 min-w-[60px] text-right"
        style={{ color: "var(--text-muted)" }}
      >
        {counter}
      </span>
      <button
        title="Anterior (Shift+Enter)"
        onClick={() => goTo(currentIdx - 1)}
        disabled={matches.length === 0}
        className="p-0.5 rounded transition-colors disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
        onMouseEnter={(e) => {
          if (matches.length === 0) return;
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-hover)";
        }}
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <ChevronUp size={12} />
      </button>
      <button
        title="Próximo (Enter)"
        onClick={() => goTo(currentIdx + 1)}
        disabled={matches.length === 0}
        className="p-0.5 rounded transition-colors disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
        onMouseEnter={(e) => {
          if (matches.length === 0) return;
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-hover)";
        }}
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <ChevronDown size={12} />
      </button>
      <button
        title="Fechar (Esc)"
        onClick={onClose}
        className="p-0.5 rounded transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "var(--bg-hover)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <X size={12} />
      </button>
    </div>
  );
}
