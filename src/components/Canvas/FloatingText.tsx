import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { CanvasText, DRAW_COLORS } from "../../types/canvas";
import { useCanvasStore } from "../../store/useCanvasStore";
import { EDITOR_FONT_FAMILIES, useAppStore } from "../../store/useAppStore";
import { startDrag } from "../../lib/drag";
import { textRect } from "../../lib/canvasGeom";
import {
  Trash2,
  Palette,
  Bold,
  Italic,
  Underline,
  Highlighter,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  Link as LinkIcon,
} from "lucide-react";
import clsx from "clsx";
import { ConnectionDots } from "./ConnectionDots";

interface Props {
  text: CanvasText;
  /** Forca entrar em modo edicao logo apos criacao (click-to-place). */
  autoEdit?: boolean;
}

const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: "Sem grifo", value: "" },
  { label: "Amarelo", value: "#fff48080" },
  { label: "Verde", value: "#b7eb8f80" },
  { label: "Rosa", value: "#ffadd280" },
  { label: "Azul", value: "#91d5ff80" },
  { label: "Lilas", value: "#d3adf780" },
  { label: "Laranja", value: "#ffd59180" },
];

const TEXT_SIZES = [12, 14, 18, 24, 32, 48] as const;
const MIN_TEXT_SIZE = 8;
const MAX_TEXT_SIZE = 160;
// Amortece o resize (< 1 = menos sensivel). 0.6 = a caixa muda 60% do
// movimento do mouse — pedido do usuario (estava "rapido demais").
const RESIZE_SENSITIVITY = 0.6;

// Rich text inline: so' as tags/estilos que o execCommand produz pra
// negrito/italico/sublinhado/tachado/grifo/cor. DOMPurify limpa o resto e
// sanitiza os valores de `style` (sem url()/expressions). Como e' dado local
// do canvas o risco e' baixo, mas sanitizamos por higiene mesmo assim.
const RICH_TEXT_SANITIZE = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "s", "strike", "mark", "span", "font", "br", "div", "p"],
  ALLOWED_ATTR: ["style", "color"],
};
function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE);
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// Conteudo inicial ao ENTRAR em edicao. Se ja' e' rico, usa o html. Senao,
// converte os flags de BLOCO (bold/italic/underline/grifo) num span inicial —
// assim um bloco todo negrito nao perde o negrito ao comecar a editar inline.
// A cor NAO entra (Auto e' theme-aware; baka-la num hex quebraria o tema).
function buildInitialEditHtml(t: CanvasText): string {
  if (t.html && t.html.trim()) return t.html;
  const esc = escapeHtml(t.text).replace(/\n/g, "<br>");
  const styles: string[] = [];
  if (t.bold) styles.push("font-weight:700");
  if (t.italic) styles.push("font-style:italic");
  if (t.underline) styles.push("text-decoration:underline");
  if (t.highlight) styles.push(`background-color:${t.highlight}`);
  return styles.length ? `<span style="${styles.join(";")}">${esc}</span>` : esc;
}
// Detecta se o HTML tem alguma marcacao inline de verdade (nao so' texto/br).
function hasInlineMarkup(html: string): boolean {
  return /<(b|strong|i|em|u|s|strike|mark|span|font)\b/i.test(html);
}

type ResizeDir = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

// So' os 4 CANTOS. Cada um resiza a largura (o texto reflui; altura auto).
// Removidos os handles laterais e/w: eles ficavam no meio das bordas —
// exatamente em cima dos dots de conexao (bolinha da seta), atrapalhando.
// Removidos tambem n/s (altura e' automatica). Cantos resizam, laterais
// conectam — igual Miro.
const RESIZE_HANDLES: { dir: ResizeDir; cursor: string; title: string }[] = [
  { dir: "nw", cursor: "nwse-resize", title: "Largura — o texto reflui" },
  { dir: "ne", cursor: "nesw-resize", title: "Largura — o texto reflui" },
  { dir: "se", cursor: "nwse-resize", title: "Largura — o texto reflui" },
  { dir: "sw", cursor: "nesw-resize", title: "Largura — o texto reflui" },
];

export const FloatingText = memo(function FloatingText({ text, autoEdit }: Props) {
  const updateText = useCanvasStore((s) => s.updateText);
  const removeText = useCanvasStore((s) => s.removeText);
  const select = useCanvasStore((s) => s.select);
  const toggleInSelection = useCanvasStore((s) => s.toggleInSelection);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const snapshotSelection = useCanvasStore((s) => s.snapshotSelection);
  const translateSelection = useCanvasStore((s) => s.translateSelection);
  const viewport = useCanvasStore((s) => s.viewport);
  const tool = useCanvasStore((s) => s.tool);
  const linkingFromId = useCanvasStore((s) => s.linkingFromId);
  const linkingFromSide = useCanvasStore((s) => s.linkingFromSide);
  const beginLink = useCanvasStore((s) => s.beginLink);
  const completeLink = useCanvasStore((s) => s.completeLink);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const openPrompt = useAppStore((s) => s.openPrompt);
  const canvasSnapToGrid = useAppStore((s) => s.canvasSnapToGrid);
  const canvasGridSize = useAppStore((s) => s.canvasGridSize);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);

  const isSelected = selectedId === text.id;
  const isInGroup = selectedId !== text.id && selectedIds.has(text.id);
  const isLinkSource = linkingFromId === text.id;
  const isLinkCandidate = linkingFromId !== null && linkingFromId !== text.id;
  const [editing, setEditing] = useState(!!autoEdit);
  const [draftText, setDraftText] = useState(text.text);
  const [openMenu, setOpenMenu] = useState<
    null | "color" | "highlight" | "size"
  >(null);
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  // Estado da selecao atual (B/I/U "aceso" conforme o trecho selecionado).
  const [inlineFmt, setInlineFmt] = useState({
    bold: false,
    italic: false,
    underline: false,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const snap = (value: number) =>
    canvasSnapToGrid
      ? Math.round(value / canvasGridSize) * canvasGridSize
      : value;

  const displayText = editing ? draftText : text.text;
  const displayModel = { ...text, text: displayText };
  const canvasTextFont =
    EDITOR_FONT_FAMILIES.find((option) => option.value === editorFontFamily)
      ?.css ?? EDITOR_FONT_FAMILIES[0].css;

  const naturalRect = textRect({
    ...displayModel,
    width: undefined,
    height: undefined,
  });
  const implicitWidth = Math.max(80, Math.min(800, Math.ceil(naturalRect.w)));
  const measuredRect = textRect({
    ...displayModel,
    width: text.width ?? implicitWidth,
    height: text.height,
  });
  const boxWidth = Math.max(60, Math.round(text.width ?? implicitWidth));
  const boxHeight = Math.max(
    Math.max(28, text.size * 1.35),
    Math.round(text.height ?? measuredRect.h),
  );

  // Ao entrar em edicao: injeta o conteudo (html rico ou texto puro) UMA vez,
  // foca e seleciona tudo. Depois o contenteditable e' uncontrolled — NAO
  // resetamos innerHTML em re-render (senao apagaria o que o usuario digita);
  // so' lemos de volta no commit. O auto-grow e' natural (a div cresce com o
  // conteudo; a caixa ja' tem height:auto).
  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.innerHTML = buildInitialEditHtml(text);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // B/I/U reativo: enquanto edita, escuta selectionchange e reflete o estado
  // do trecho selecionado (queryCommandState). So' atualiza se a selecao esta
  // DENTRO deste editor — senao um clique em outra caixa mexeria aqui.
  useEffect(() => {
    if (!editing) return;
    const update = () => {
      const el = editRef.current;
      const sel = window.getSelection();
      if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      setInlineFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    };
    document.addEventListener("selectionchange", update);
    update();
    return () => document.removeEventListener("selectionchange", update);
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraftText(text.text);
  }, [editing, text.text]);

  useEffect(() => {
    if (!openMenu) return;
    const onClick = () => setOpenMenu(null);
    const id = window.setTimeout(
      () => document.addEventListener("click", onClick),
      0,
    );
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", onClick);
    };
  }, [openMenu]);

  useLayoutEffect(() => {
    // Mostra a toolbar quando selecionado OU editando (pra formatar a selecao
    // inline — inclui texto novo que ainda nao esta "selecionado" como bloco).
    if (!isSelected && !editing) {
      setToolbarPos(null);
      return;
    }

    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPos({
        left: Math.max(8, rect.left),
        top: Math.max(8, rect.top - 34),
      });
    };

    update();
    const observer =
      typeof ResizeObserver !== "undefined" && rootRef.current
        ? new ResizeObserver(update)
        : null;
    observer?.observe(rootRef.current!);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    isSelected,
    editing,
    text.x,
    text.y,
    text.width,
    text.height,
    text.size,
    viewport.zoom,
  ]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (editing) return;
    if ((e.target as HTMLElement).closest("[data-text-action]")) return;

    if (tool === "eraser") {
      e.stopPropagation();
      removeText(text.id);
      return;
    }

    if (linkingFromId && linkingFromId !== text.id) {
      e.stopPropagation();
      e.preventDefault();
      completeLink(text.id);
      return;
    }

    if (tool === "arrow") {
      e.stopPropagation();
      e.preventDefault();
      if (linkingFromId) completeLink(text.id);
      else beginLink(text.id);
      return;
    }

    if (tool !== "select") return;

    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleInSelection(text.id);
      return;
    }

    const currentIds = useCanvasStore.getState().selectedIds;
    const isGroupDrag = currentIds.size > 1 && currentIds.has(text.id);

    if (isGroupDrag) {
      const snapshot = snapshotSelection();
      const orig = { startX: e.clientX, startY: e.clientY };
      let frame: number | null = null;
      let pendingDelta: { dx: number; dy: number } | null = null;
      const flushMove = () => {
        frame = null;
        if (!pendingDelta) return;
        translateSelection(snapshot, pendingDelta.dx, pendingDelta.dy);
        pendingDelta = null;
      };
      const scheduleMove = (dx: number, dy: number) => {
        pendingDelta = { dx, dy };
        if (frame == null) frame = requestAnimationFrame(flushMove);
      };
      const cancelMove = () => {
        if (frame != null) cancelAnimationFrame(frame);
        frame = null;
        pendingDelta = null;
      };
      pushHistory();
      dragState.current = {
        startX: orig.startX,
        startY: orig.startY,
        origX: text.x,
        origY: text.y,
        moved: false,
      };
      startDrag({
        onMove: (ev) => {
          const dx = (ev.clientX - orig.startX) / viewport.zoom;
          const dy = (ev.clientY - orig.startY) / viewport.zoom;
          if (dragState.current && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
            dragState.current.moved = true;
          }
          scheduleMove(dx, dy);
        },
        onEnd: (ev) => {
          cancelMove();
          const dx = (ev.clientX - orig.startX) / viewport.zoom;
          const dy = (ev.clientY - orig.startY) / viewport.zoom;
          translateSelection(snapshot, dx, dy);
          dragState.current = null;
        },
        onCancel: () => {
          cancelMove();
          dragState.current = null;
          translateSelection(snapshot, 0, 0);
        },
      });
      return;
    }

    select(text.id);
    pushHistory();

    const orig = {
      startX: e.clientX,
      startY: e.clientY,
      origX: text.x,
      origY: text.y,
      moved: false,
    };
    dragState.current = orig;
    let frame: number | null = null;
    let pendingPatch: Partial<CanvasText> | null = null;
    const flushMove = () => {
      frame = null;
      if (!pendingPatch) return;
      updateText(text.id, pendingPatch);
      pendingPatch = null;
    };
    const scheduleMove = (patch: Partial<CanvasText>) => {
      pendingPatch = patch;
      if (frame == null) frame = requestAnimationFrame(flushMove);
    };
    const cancelMove = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      pendingPatch = null;
    };

    startDrag({
      onMove: (ev) => {
        if (!dragState.current) return;
        const dx = (ev.clientX - orig.startX) / viewport.zoom;
        const dy = (ev.clientY - orig.startY) / viewport.zoom;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragState.current.moved = true;
        scheduleMove({
          x: snap(orig.origX + dx),
          y: snap(orig.origY + dy),
        });
      },
      onEnd: (ev) => {
        cancelMove();
        const dx = (ev.clientX - orig.startX) / viewport.zoom;
        const dy = (ev.clientY - orig.startY) / viewport.zoom;
        updateText(text.id, {
          x: snap(orig.origX + dx),
          y: snap(orig.origY + dy),
        });
        dragState.current = null;
      },
      onCancel: () => {
        cancelMove();
        dragState.current = null;
        updateText(text.id, { x: orig.origX, y: orig.origY });
      },
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setDraftText(text.text);
    setEditing(true);
  };

  // Le o conteudo do contenteditable e persiste. Se nao ha marcacao inline
  // (so' texto), NAO guarda html — mantem o bloco no modelo simples/leve.
  const commitDraft = () => {
    const el = editRef.current;
    if (!el) return;
    const plain = el.textContent ?? "";
    const html = sanitizeRichText(el.innerHTML);
    updateText(text.id, {
      text: plain,
      html: hasInlineMarkup(html) ? html : undefined,
    });
  };

  // Aplica formatacao INLINE na selecao atual do contenteditable (negrito,
  // grifo, cor de trecho — igual Miro). Roda so' em edicao; o preventDefault
  // no mousedown do botao (TinyBtn) preserva a selecao/foco. Persiste na hora.
  const applyInline = (command: string, value?: string) => {
    const el = editRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    commitDraft();
    // Reflete o novo estado nos botoes (execCommand nem sempre dispara
    // selectionchange).
    setInlineFmt({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  const onResizeMouseDown = (dir: ResizeDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();

    const startX = e.clientX;
    const startY = e.clientY;
    const orig = {
      x: text.x,
      y: text.y,
      w: boxWidth,
      h: boxHeight,
      size: text.size,
      storedW: text.width,
      storedH: text.height,
    };
    const minBoxW = 60;
    const minBoxH = Math.max(28, text.size * 1.35);
    const minScaleW = 24;
    const minScaleH = Math.max(14, MIN_TEXT_SIZE * 1.35);
    const maxW = 2000;
    const maxH = 1600;
    let frame: number | null = null;
    let pendingPatch: Partial<CanvasText> | null = null;

    const flushResize = () => {
      frame = null;
      if (!pendingPatch) return;
      updateText(text.id, pendingPatch);
      pendingPatch = null;
    };

    const scheduleResize = (patch: Partial<CanvasText>) => {
      pendingPatch = patch;
      if (frame == null) frame = requestAnimationFrame(flushResize);
    };

    const cancelPendingResize = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      pendingPatch = null;
    };

    const computeResizePatch = (
      clientX: number,
      clientY: number,
      boxOnly: boolean,
    ): Partial<CanvasText> => {
      // Fator de amortecimento: a caixa cresce ~60% do movimento do mouse.
      // Sem isso (1:1) o resize ficava sensivel demais — muita mudanca com
      // pouco movimento. O handle nao gruda no cursor, mas o ajuste fica
      // controlado (feedback do usuario).
      const dx = ((clientX - startX) / viewport.zoom) * RESIZE_SENSITIVITY;
      const dy = ((clientY - startY) / viewport.zoom) * RESIZE_SENSITIVITY;
      const minW = boxOnly ? minBoxW : minScaleW;
      const minH = boxOnly ? minBoxH : minScaleH;

      let x = orig.x;
      let w = orig.w;
      let h = orig.h;

      if (dir.includes("e")) w = orig.w + dx;
      if (dir.includes("s")) h = orig.h + dy;
      if (dir.includes("w")) {
        w = orig.w - dx;
        x = orig.x + dx;
      }
      if (dir.includes("n")) {
        h = orig.h - dy;
      }

      if (w < minW) {
        if (dir.includes("w")) x = orig.x + orig.w - minW;
        w = minW;
      }
      if (h < minH) {
        h = minH;
      }

      w = Math.min(maxW, w);
      h = Math.min(maxH, h);

      if (boxOnly) {
        // So' largura (+ x pros handles do lado esquerdo). Altura fica AUTO:
        // o texto reflui na nova largura e a caixa se ajusta ao conteudo.
        // Nao mexemos em y/height nem escalamos a fonte — e' o resize
        // responsivo (tipo Miro); tamanho da fonte fica na toolbar.
        return {
          x: Math.round(x),
          width: Math.round(w),
        };
      }

      const scaleX = w / orig.w;
      const scaleY = h / orig.h;
      const scale =
        dir === "e" || dir === "w"
          ? scaleX
          : dir === "n" || dir === "s"
            ? scaleY
            : Math.abs(scaleX - 1) >= Math.abs(scaleY - 1)
              ? scaleX
              : scaleY;
      const nextSize = clamp(
        Math.round(orig.size * scale),
        MIN_TEXT_SIZE,
        MAX_TEXT_SIZE,
      );
      const scaledW = clamp(Math.round(orig.w * scale), minBoxW, maxW);
      const scaledH = clamp(
        Math.round(orig.h * scale),
        Math.max(20, Math.ceil(nextSize * 1.25)),
        maxH,
      );

      return {
        x: dir.includes("w")
          ? Math.round(orig.x + orig.w - scaledW)
          : Math.round(orig.x),
        y: dir.includes("n")
          ? Math.round(orig.y + orig.h - scaledH)
          : Math.round(orig.y),
        width: scaledW,
        height: scaledH,
        size: nextSize,
      };
    };

    // Cada handle resiza a CAIXA (largura → o texto reflui), nunca escala a
    // fonte — resize responsivo tipo Miro. O tamanho da fonte fica no seletor
    // da toolbar. `computeResizePatch(..., true)` = so' largura; altura auto.
    startDrag({
      onMove: (ev) => {
        scheduleResize(computeResizePatch(ev.clientX, ev.clientY, true));
      },
      onEnd: (ev) => {
        cancelPendingResize();
        updateText(text.id, computeResizePatch(ev.clientX, ev.clientY, true));
      },
      onCancel: () => {
        cancelPendingResize();
        updateText(text.id, {
          x: orig.x,
          y: orig.y,
          size: orig.size,
          width: orig.storedW,
          height: orig.storedH,
        });
      },
    });
  };

  const renderColor =
    !text.color || text.color === "#2a2420"
      ? "var(--canvas-text-auto)"
      : text.color;
  const hasVisibleText = displayText.trim().length > 0;
  // Bloco rico: a formatacao vive no html inline; os flags de bloco viram
  // so' o estilo-base (senao dobram — ex.: bold no bloco + <b> inline).
  const hasHtml = !!(text.html && text.html.trim());

  const rootStyle: React.CSSProperties = {
    position: "absolute",
    left: text.x,
    top: text.y,
    width: boxWidth,
    // Altura SEMPRE automatica: a caixa cresce com o conteudo e nunca deixa
    // o texto vazar/clipar (era o bug do texto transbordando embaixo). O
    // minHeight garante um piso (fonte + altura resultante de resize de canto).
    height: "auto",
    minWidth: 60,
    minHeight: editing
      ? Math.max(28, text.size * 1.35)
      : Math.max(28, text.size * 1.35, Math.round(text.height ?? 0)),
    overflow: "visible",
    ...(isSelected
      ? {
          outline: `${1 / viewport.zoom}px solid var(--accent)`,
          outlineOffset: `${1 / viewport.zoom}px`,
        }
      : isInGroup
        ? {
            outline: `${1 / viewport.zoom}px dashed var(--selection-ring)`,
            outlineOffset: `${1 / viewport.zoom}px`,
          }
        : null),
  };

  const contentStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    color: renderColor,
    fontSize: text.size,
    fontWeight: hasHtml ? 500 : text.bold ? 700 : 500,
    fontStyle: hasHtml ? "normal" : text.italic ? "italic" : "normal",
    textDecoration: hasHtml ? "none" : text.underline ? "underline" : "none",
    textAlign: text.align ?? "left",
    lineHeight: 1.18,
    fontFamily: canvasTextFont,
    letterSpacing: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "normal",
    overflowWrap: "anywhere",
    overflow: editing ? "auto" : "visible",
    padding: hasHtml ? 0 : text.highlight ? "1px 4px" : 0,
    background: hasHtml ? "transparent" : text.highlight || "transparent",
    borderRadius: hasHtml ? 0 : text.highlight ? 2 : 0,
  };

  const renderedLines = displayText.split("\n");

  return (
    <div
      ref={rootRef}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      data-canvas-entity-id={text.id}
      className={clsx(
        "group",
        tool === "select"
          ? "cursor-grab active:cursor-grabbing"
          : tool === "eraser"
            ? "cursor-cell"
            : tool === "arrow"
              ? "cursor-crosshair"
              : "cursor-default",
      )}
      style={rootStyle}
    >
      {editing ? (
        <div
          ref={editRef}
          className="canvas-text-input"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Digite..."
          // Uncontrolled: o conteudo e' injetado uma vez no effect de entrada
          // em edicao. onInput so' atualiza o draft (medida), nunca reseta o
          // innerHTML. Selecione um trecho e use a toolbar pra formatar so' ele.
          onInput={() => setDraftText(editRef.current?.textContent ?? "")}
          onBlur={() => {
            commitDraft();
            setEditing(false);
            if (!(editRef.current?.textContent ?? "").trim()) removeText(text.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              editRef.current?.blur();
              return;
            }
            e.stopPropagation();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...contentStyle,
            // Contenteditable cresce sozinho com o conteudo (height auto).
            height: "auto",
            overflow: "visible",
            border: hasVisibleText
              ? "1px solid transparent"
              : "1px dashed var(--selection-ring)",
            outline: "none",
            background: "transparent",
            caretColor: "var(--accent)",
            // Cursor de TEXTO (I-beam) enquanto edita — sobrescreve o
            // cursor-grab da caixa (que e' pra arrastar o bloco).
            cursor: "text",
            minHeight: Math.max(28, text.size * 1.35),
          }}
        />
      ) : (
        <TextPreview
          text={displayText}
          html={hasHtml ? sanitizeRichText(text.html!) : undefined}
          lines={renderedLines}
          list={text.list}
          link={text.link}
          style={contentStyle}
        />
      )}

      {tool !== "eraser" && !editing && (
        <ConnectionDots
          entityId={text.id}
          isLinkSource={isLinkSource}
          isLinkCandidate={isLinkCandidate}
          linkingFromSide={linkingFromSide}
          isSelected={isSelected}
          onPick={(side) => {
            if (linkingFromId && linkingFromId !== text.id) {
              completeLink(text.id, side);
            } else {
              beginLink(text.id, side);
            }
          }}
        />
      )}

      {/* Handles so' quando a caixa tem tamanho de tela suficiente pra
          resizar — no zoom-out, uma caixa minuscula viraria uma sopa de
          marcadores sobre o texto (as "linhas" que apareciam). */}
      {isSelected && !editing && text.text.trim().length > 0 &&
        boxWidth * viewport.zoom >= 44 && (
        <>
          {RESIZE_HANDLES.map((h) => (
            <ResizeHandle
              key={h.dir}
              dir={h.dir}
              cursor={h.cursor}
              title={h.title}
              zoom={viewport.zoom}
              onMouseDown={(e) => onResizeMouseDown(h.dir, e)}
            />
          ))}
        </>
      )}

      {(isSelected || editing) && toolbarPos && createPortal(
        <div
          data-text-action
          className="fixed z-[70] flex items-center gap-0.5 px-1 py-0.5"
          style={{
            left: toolbarPos.left,
            top: toolbarPos.top,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TinyBtn
            title={editing ? "Negrito (na seleção)" : "Negrito"}
            active={editing ? inlineFmt.bold : text.bold}
            onClick={(e) => {
              e.stopPropagation();
              if (editing) applyInline("bold");
              else updateText(text.id, { bold: !text.bold });
            }}
          >
            <Bold size={11} />
          </TinyBtn>
          <TinyBtn
            title={editing ? "Itálico (na seleção)" : "Itálico"}
            active={editing ? inlineFmt.italic : text.italic}
            onClick={(e) => {
              e.stopPropagation();
              if (editing) applyInline("italic");
              else updateText(text.id, { italic: !text.italic });
            }}
          >
            <Italic size={11} />
          </TinyBtn>
          <TinyBtn
            title={editing ? "Sublinhado (na seleção)" : "Sublinhado"}
            active={editing ? inlineFmt.underline : text.underline}
            onClick={(e) => {
              e.stopPropagation();
              if (editing) applyInline("underline");
              else updateText(text.id, { underline: !text.underline });
            }}
          >
            <Underline size={11} />
          </TinyBtn>
          <Divider />

          <TinyBtn
            title="Bullet point"
            active={text.list === "bullet"}
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, {
                list: text.list === "bullet" ? undefined : "bullet",
              });
            }}
          >
            <List size={11} />
          </TinyBtn>
          <TinyBtn
            title="Alinhar a esquerda"
            active={!text.align || text.align === "left"}
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { align: "left" });
            }}
          >
            <AlignLeft size={11} />
          </TinyBtn>
          <TinyBtn
            title="Centralizar"
            active={text.align === "center"}
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { align: "center" });
            }}
          >
            <AlignCenter size={11} />
          </TinyBtn>
          <TinyBtn
            title="Alinhar a direita"
            active={text.align === "right"}
            onClick={(e) => {
              e.stopPropagation();
              updateText(text.id, { align: "right" });
            }}
          >
            <AlignRight size={11} />
          </TinyBtn>
          <TinyBtn
            title={text.link ? "Editar link" : "Adicionar link"}
            active={!!text.link}
            onClick={async (e) => {
              e.stopPropagation();
              const value = await openPrompt({
                title: "Link do texto",
                message: "Cole uma URL ou deixe em branco para remover.",
                defaultValue: text.link ?? "",
                placeholder: "https://...",
                confirmLabel: "Aplicar",
              });
              if (value === null) return;
              updateText(text.id, { link: value.trim() || undefined });
            }}
          >
            <LinkIcon size={11} />
          </TinyBtn>
          <Divider />

          <div className="relative">
            <TinyBtn
              title="Tamanho"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "size" ? null : "size");
              }}
            >
              <Type size={11} />
            </TinyBtn>
            {openMenu === "size" && (
              <Popover>
                {TEXT_SIZES.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateText(text.id, { size: s });
                      setOpenMenu(null);
                    }}
                    className="px-2 py-0.5 text-[10px] transition-colors tabular-nums"
                    style={{
                      background:
                        text.size === s ? "var(--accent-soft)" : "transparent",
                      color: text.size === s ? "var(--accent)" : "var(--text-secondary)",
                      border: text.size === s
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border-strong)",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </Popover>
            )}
          </div>

          <div className="relative">
            <TinyBtn
              title="Cor do texto"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "color" ? null : "color");
              }}
            >
              <Palette size={11} />
            </TinyBtn>
            {openMenu === "color" && (
              <Popover>
                {DRAW_COLORS.map((c) => (
                  <button
                    key={c.value || "auto"}
                    title={c.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Editando + cor concreta → pinta so' a selecao. "Auto"
                      // (vazio) ou fora de edicao → cor do bloco inteiro.
                      if (editing && c.value) applyInline("foreColor", c.value);
                      else updateText(text.id, { color: c.value });
                      setOpenMenu(null);
                    }}
                    style={{
                      background:
                        c.value ||
                        "linear-gradient(135deg, var(--text-primary) 0 50%, var(--bg-panel-2) 50% 100%)",
                      border: "1px solid var(--border)",
                    }}
                    className="w-4 h-4 rounded-full hover:scale-110 transition-transform"
                  />
                ))}
              </Popover>
            )}
          </div>

          <div className="relative">
            <TinyBtn
              title="Grifar"
              active={!!text.highlight}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "highlight" ? null : "highlight");
              }}
            >
              <Highlighter size={11} />
            </TinyBtn>
            {openMenu === "highlight" && (
              <Popover>
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.value || "none"}
                    title={c.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Editando → grifa so' a selecao (ou remove com
                      // transparent). Fora de edicao → grifo do bloco inteiro.
                      if (editing) applyInline("hiliteColor", c.value || "transparent");
                      else updateText(text.id, { highlight: c.value || undefined });
                      setOpenMenu(null);
                    }}
                    style={{
                      background:
                        c.value ||
                        "repeating-linear-gradient(45deg, var(--bg-panel-2) 0 3px, transparent 3px 6px)",
                      border: "1px solid var(--border)",
                    }}
                    className={clsx(
                      "w-4 h-4 rounded transition-transform hover:scale-110",
                      text.highlight === (c.value || undefined) &&
                        "ring-1 ring-accent",
                    )}
                  />
                ))}
              </Popover>
            )}
          </div>

          <Divider />
          <TinyBtn
            title="Excluir"
            danger
            onClick={(e) => {
              e.stopPropagation();
              removeText(text.id);
            }}
          >
            <Trash2 size={11} />
          </TinyBtn>
        </div>,
        document.body,
      )}
    </div>
  );
});

function TextPreview({
  text,
  html,
  lines,
  list,
  link,
  style,
}: {
  text: string;
  /** HTML rico ja' sanitizado. Quando presente, tem precedencia sobre o
   *  texto puro / bullets (a formatacao inline vive nele). */
  html?: string;
  lines: string[];
  list?: "bullet";
  link?: string;
  style: React.CSSProperties;
}) {
  const content = html != null ? (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  ) : !text ? (
    <span style={{ color: "var(--canvas-text-placeholder)" }}>Digite...</span>
  ) : list === "bullet" ? (
    <ul
      style={{
        margin: 0,
        paddingLeft: "1.15em",
        listStylePosition: "outside",
        listStyleType: "disc",
      }}
    >
      {(lines.length ? lines : [" "]).map((line, index) => (
        <li key={`${line}-${index}`}>{line || " "}</li>
      ))}
    </ul>
  ) : (
    text
  );

  if (!link) return <div style={style}>{content}</div>;
  const safeHref = normalizeLinkHref(link);

  return (
    <div
      onMouseDown={(e) => {
        if (!safeHref || (!e.ctrlKey && !e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (!safeHref || (!e.ctrlKey && !e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        window.open(safeHref, "_blank", "noopener,noreferrer");
      }}
      style={{
        ...style,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        cursor: safeHref ? "alias" : style.cursor,
      }}
      title={safeHref ? `${safeHref} (Ctrl+clique para abrir)` : link}
    >
      {content}
    </div>
  );
}

function normalizeLinkHref(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ResizeHandle({
  dir,
  cursor,
  title,
  zoom,
  onMouseDown,
}: {
  dir: ResizeDir;
  cursor: string;
  title: string;
  zoom: number;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const isCorner = dir.length === 2;
  const cornerSize = 7 / zoom;
  const sideLong = 22 / zoom;
  const sideShort = 4 / zoom;
  const halfCorner = cornerSize / 2;
  const inset = 7 / zoom;

  const style: React.CSSProperties = {
    position: "absolute",
    width: isCorner ? cornerSize : dir === "n" || dir === "s" ? sideLong : sideShort,
    height: isCorner ? cornerSize : dir === "e" || dir === "w" ? sideLong : sideShort,
    background: "var(--accent)",
    border: isCorner ? `${1 / zoom}px solid var(--bg-panel)` : "none",
    borderRadius: 999,
    boxShadow: "var(--shadow-sm)",
    cursor,
    opacity: isCorner ? 0.95 : 0.72,
    zIndex: 12,
  };

  if (isCorner && dir.includes("n")) style.top = -halfCorner;
  if (isCorner && dir.includes("s")) style.bottom = -halfCorner;
  if (isCorner && dir.includes("w")) style.left = -halfCorner;
  if (isCorner && dir.includes("e")) style.right = -halfCorner;
  if (dir === "n" || dir === "s") {
    style.left = "50%";
    style.transform = "translateX(-50%)";
    if (dir === "n") style.top = inset;
    else style.bottom = inset;
  }
  if (dir === "e" || dir === "w") {
    style.top = "50%";
    style.transform = "translateY(-50%)";
    // Sobre a BORDA (straddle), nao inset pra dentro — senao vira uma barra
    // vertical em cima do texto, pior em caixas estreitas e no zoom-out.
    if (dir === "e") style.right = -sideShort / 2;
    else style.left = -sideShort / 2;
  }

  return (
    <div
      data-text-action
      title={title}
      onMouseDown={onMouseDown}
      style={style}
    />
  );
}

function Divider() {
  return (
    <div
      className="w-px h-3.5 mx-0.5"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute top-full left-0 mt-1 flex gap-1 px-1.5 py-1 z-30"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      {children}
    </div>
  );
}

function TinyBtn({
  children,
  onClick,
  title,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = active
    ? "var(--accent-2)"
    : hovered
      ? danger
        ? "var(--danger)"
        : "var(--bg-hover)"
      : "transparent";
  const fg = active
    ? "var(--text-inverse)"
    : hovered
      ? danger
        ? "var(--text-inverse)"
        : "var(--text-secondary)"
      : "var(--text-muted)";
  return (
    <button
      title={title}
      onClick={onClick}
      // preventDefault no mousedown mantem o foco/selecao no contenteditable —
      // sem isso, clicar num botao da toolbar tirava a selecao e o execCommand
      // de formatacao inline nao teria em que aplicar.
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="p-1 transition-colors"
      style={{ background: bg, color: fg, borderRadius: "var(--radius-sm)" }}
    >
      {children}
    </button>
  );
}
