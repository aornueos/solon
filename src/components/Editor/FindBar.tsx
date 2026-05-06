import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  Search,
  X,
} from "lucide-react";
import {
  clearFindHighlights,
  setFindHighlights,
  type FindMatchRange,
} from "./FindHighlightExtension";
import { useAppStore } from "../../store/useAppStore";

interface Props {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export function FindBar({ editor, open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [preserveCase, setPreserveCase] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [docVersion, bumpDocVersion] = useReducer((v) => v + 1, 0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openConfirm = useAppStore((state) => state.openConfirm);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) {
      clearFindHighlights(editor.view);
      return;
    }
    const onUpdate = () => bumpDocVersion();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      clearFindHighlights(editor.view);
    };
  }, [editor, open]);

  const matches = useMemo<FindMatchRange[]>(() => {
    const needleRaw = query.trim();
    if (!needleRaw) return [];
    const needle = caseSensitive
      ? needleRaw
      : needleRaw.toLocaleLowerCase("pt-BR");
    const result: FindMatchRange[] = [];

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = caseSensitive
        ? node.text
        : node.text.toLocaleLowerCase("pt-BR");
      let idx = 0;
      while (true) {
        const found = text.indexOf(needle, idx);
        if (found < 0) break;
        if (wholeWord && !isWholeWordMatch(node.text, found, needleRaw.length)) {
          idx = found + Math.max(1, needleRaw.length);
          continue;
        }
        result.push({ from: pos + found, to: pos + found + needleRaw.length });
        idx = found + Math.max(1, needleRaw.length);
      }
    });

    return result;
  }, [query, editor, docVersion, caseSensitive, wholeWord]);

  useEffect(() => {
    setCurrentIdx(0);
  }, [matches]);

  useEffect(() => {
    if (!open) return;
    setFindHighlights(editor.view, matches, currentIdx);
  }, [editor, matches, currentIdx, open]);

  const goTo = useCallback(
    (idx: number) => {
      if (matches.length === 0) return;
      const i = ((idx % matches.length) + matches.length) % matches.length;
      const match = matches[i];
      editor
        .chain()
        .setTextSelection({ from: match.from, to: match.to })
        .scrollIntoView()
        .run();
      setCurrentIdx(i);
    },
    [editor, matches],
  );

  useEffect(() => {
    if (matches.length === 0 || currentIdx >= matches.length) return;
    const match = matches[currentIdx];
    editor
      .chain()
      .setTextSelection({ from: match.from, to: match.to })
      .scrollIntoView()
      .run();
  }, [currentIdx, matches, editor]);

  if (!open) return null;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      clearFindHighlights(editor.view);
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(e.shiftKey ? currentIdx - 1 : currentIdx + 1);
    }
  };

  const replaceCurrent = () => {
    if (matches.length === 0) return;
    const match = matches[currentIdx] ?? matches[0];
    const original = editor.state.doc.textBetween(match.from, match.to);
    const replacement = preserveCase
      ? applyReplacementCase(replaceWith, original)
      : replaceWith;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .insertContent(replacement)
      .run();
    bumpDocVersion();
  };

  const replaceAll = async () => {
    if (matches.length === 0) return;
    const ok =
      matches.length < 2 ||
      (await openConfirm({
        title: "Substituir tudo",
        message: `Substituir ${matches.length} ocorrencias no documento atual?`,
        confirmLabel: "Substituir",
        cancelLabel: "Cancelar",
      }));
    if (!ok) return;

    const tr = editor.state.tr;
    for (const match of [...matches].reverse()) {
      const original = editor.state.doc.textBetween(match.from, match.to);
      const replacement = preserveCase
        ? applyReplacementCase(replaceWith, original)
        : replaceWith;
      tr.insertText(replacement, match.from, match.to);
    }
    editor.view.dispatch(tr.scrollIntoView());
    bumpDocVersion();
  };

  const counter =
    matches.length === 0
      ? query.trim()
        ? "0 resultados"
        : ""
      : `${currentIdx + 1} de ${matches.length}`;

  return (
    <div
      className="absolute top-2 right-3 z-30 flex flex-col gap-1.5 px-2 py-1.5 rounded shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex items-center gap-1">
        <Search size={12} style={{ color: "var(--text-muted)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Buscar..."
          className="bg-transparent outline-none text-[0.78rem] w-[180px]"
          style={{ color: "var(--text-primary)" }}
        />
        <span
          className="text-[0.7rem] tabular-nums px-1 min-w-[64px] text-right"
          style={{ color: "var(--text-muted)" }}
        >
          {counter}
        </span>
        <IconButton
          title="Anterior (Shift+Enter)"
          disabled={matches.length === 0}
          onClick={() => goTo(currentIdx - 1)}
        >
          <ChevronUp size={12} />
        </IconButton>
        <IconButton
          title="Proximo (Enter)"
          disabled={matches.length === 0}
          onClick={() => goTo(currentIdx + 1)}
        >
          <ChevronDown size={12} />
        </IconButton>
        <IconButton
          title="Diferenciar maiusculas"
          active={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          <CaseSensitive size={12} />
        </IconButton>
        <TextButton
          title="Palavra inteira"
          active={wholeWord}
          onClick={() => setWholeWord((v) => !v)}
        >
          W
        </TextButton>
        <TextButton
          title="Preservar maiusculas"
          active={preserveCase}
          onClick={() => setPreserveCase((v) => !v)}
        >
          Aa
        </TextButton>
        <IconButton title="Fechar (Esc)" onClick={onClose}>
          <X size={12} />
        </IconButton>
      </div>
      <div className="flex items-center gap-1">
        <Replace size={12} style={{ color: "var(--text-muted)" }} />
        <input
          value={replaceWith}
          onChange={(e) => setReplaceWith(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Substituir..."
          className="bg-transparent outline-none text-[0.78rem] w-[180px]"
          style={{ color: "var(--text-primary)" }}
        />
        <TextButton disabled={matches.length === 0} onClick={replaceCurrent}>
          Um
        </TextButton>
        <TextButton disabled={matches.length === 0} onClick={replaceAll}>
          Todos
        </TextButton>
      </div>
    </div>
  );
}

function IconButton({
  title,
  disabled,
  active,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="p-0.5 rounded transition-colors disabled:opacity-30"
      style={{
        background: active ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

function TextButton({
  title,
  disabled,
  active,
  onClick,
  children,
}: {
  title?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 rounded text-[0.68rem] disabled:opacity-35"
      style={{
        border: "1px solid var(--border)",
        background: active ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

function isWholeWordMatch(text: string, start: number, length: number) {
  const before = start > 0 ? text[start - 1] : "";
  const after = start + length < text.length ? text[start + length] : "";
  return !isWordChar(before) && !isWordChar(after);
}

function isWordChar(char: string) {
  return !!char && /[\p{L}\p{M}\p{N}_]/u.test(char);
}

function applyReplacementCase(replacement: string, original: string) {
  if (!replacement || !original) return replacement;
  const lower = original.toLocaleLowerCase("pt-BR");
  const upper = original.toLocaleUpperCase("pt-BR");
  if (original === upper && original !== lower) {
    return replacement.toLocaleUpperCase("pt-BR");
  }
  const first = original[0];
  if (first === first.toLocaleUpperCase("pt-BR") && first !== first.toLocaleLowerCase("pt-BR")) {
    return (
      replacement[0].toLocaleUpperCase("pt-BR") +
      replacement.slice(1).toLocaleLowerCase("pt-BR")
    );
  }
  return replacement;
}
