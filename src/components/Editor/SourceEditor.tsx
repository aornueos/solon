import { useEffect, useLayoutEffect, useRef } from "react";
import { useAppStore, type HeadingItem } from "../../store/useAppStore";

/**
 * Modo código-fonte: o Markdown cru da nota num campo de texto, no lugar
 * do editor formatado — para ajustar o que o modo visual não alcança e
 * para ver exatamente o que vai para o arquivo.
 *
 * O campo edita o `fileBody` direto (o auto-save grava como sempre). O
 * Índice e a contagem de palavras são recalculados a partir do texto cru,
 * e um clique no Índice leva à linha do título.
 */
export function SourceEditor() {
  const fileBody = useAppStore((s) => s.fileBody);
  const setFileBody = useAppStore((s) => s.setFileBody);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Cresce com o conteúdo: quem rola é a página, como no modo visual.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [fileBody]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  // Índice e contagem vindos do texto cru, com o mesmo respiro do editor.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const { setHeadings, setWordCount } = useAppStore.getState();
      setHeadings(headingsFromMarkdown(fileBody));
      const prose = stripMarkdown(fileBody);
      const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;
      setWordCount(words, prose.length);
    }, 200);
    return () => window.clearTimeout(t);
  }, [fileBody]);

  // Clique no Índice: vai para a linha do título (texto e nível; `pos` é o
  // número da linha e desempata títulos repetidos).
  useEffect(() => {
    const onJump = (e: Event) => {
      const el = ref.current;
      const detail = (e as CustomEvent).detail as
        | { pos?: number; text?: string; level?: number }
        | undefined;
      if (!el || !detail) return;
      const lines = el.value.split("\n");
      let line = -1;
      let best = Infinity;
      headingLines(lines).forEach(({ index, level, text }) => {
        if (text !== detail.text || (detail.level && level !== detail.level)) return;
        const distance = Math.abs(index - (detail.pos ?? 0));
        if (distance < best) {
          best = distance;
          line = index;
        }
      });
      if (line < 0) return;
      const offset = lines.slice(0, line).reduce((sum, l) => sum + l.length + 1, 0);
      el.focus({ preventScroll: true });
      el.setSelectionRange(offset, offset + lines[line].length);
      scrollOffsetIntoView(el, offset);
    };
    document.addEventListener("solon:scroll-to", onJump);
    return () => document.removeEventListener("solon:scroll-to", onJump);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab recua em vez de tirar o foco do campo — lista aninhada precisa.
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;
    if (e.shiftKey) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const removable = value.slice(lineStart, lineStart + 2).match(/^ {1,2}/)?.[0].length ?? 0;
      if (!removable) return;
      el.setRangeText("", lineStart, lineStart + removable, "preserve");
      el.setSelectionRange(Math.max(lineStart, start - removable), Math.max(lineStart, end - removable));
    } else {
      el.setRangeText("  ", start, end, "end");
    }
    setFileBody(el.value);
  };

  return (
    <textarea
      ref={ref}
      className="solon-source-editor"
      value={fileBody}
      onChange={(e) => setFileBody(e.target.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      aria-label="Markdown da nota"
    />
  );
}

/** Linhas de título ATX, fora de blocos de código cercados. */
function headingLines(lines: string[]): { index: number; level: number; text: string }[] {
  const out: { index: number; level: number; text: string }[] = [];
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) out.push({ index, level: m[1].length, text: stripMarkdown(m[2]).trim() });
  });
  return out;
}

function headingsFromMarkdown(markdown: string): HeadingItem[] {
  const lines = markdown.split("\n");
  const found = headingLines(lines);
  return found.map((h, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : lines.length;
    const section = stripMarkdown(lines.slice(h.index, end).join("\n")).trim();
    return {
      level: h.level,
      text: h.text,
      pos: h.index,
      endPos: end,
      wordCount: section ? section.split(/\s+/).length : 0,
    };
  });
}

/** Tira a sintaxe mais comum, para contar palavras e mostrar títulos. */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`|]/g, "");
}

/**
 * Rola a página até o caractere `offset` do campo. O campo cresce com o
 * conteúdo, então a posição da linha é medida num espelho com o mesmo
 * estilo e largura.
 */
function scrollOffsetIntoView(el: HTMLTextAreaElement, offset: number): void {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of [
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "paddingTop", "paddingLeft", "paddingRight", "borderTopWidth", "borderLeftWidth",
    "boxSizing", "whiteSpace", "wordWrap", "tabSize",
  ] as const) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.width = `${el.clientWidth}px`;
  mirror.textContent = el.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();

  let scroller: HTMLElement | null = el.parentElement;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return;
  const delta =
    el.getBoundingClientRect().top + top - scroller.getBoundingClientRect().top - 24;
  scroller.scrollTop += delta;
}
