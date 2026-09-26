import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { startDrag } from "../../lib/drag";

/** Menor largura que o arraste aceita, em px. */
const MIN_IMAGE_WIDTH = 48;

/**
 * Largura vinda do HTML (`<img width="320">`): número de px ou
 * porcentagem. Qualquer outra coisa é ignorada e a imagem fica no tamanho
 * natural.
 */
export function normalizeImageWidth(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(px|%)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!(amount > 0)) return null;
  return match[2] === "%" ? `${match[1]}%` : String(Math.round(amount));
}

function widthStyle(width: string | null): string {
  if (!width) return "";
  return width.endsWith("%") ? width : `${width}px`;
}

export const EditorImageExtension = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      title: { default: null },
      dataSolonSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-solon-src"),
        renderHTML: (attributes) =>
          attributes.dataSolonSrc
            ? { "data-solon-src": attributes.dataSolonSrc }
            : {},
      },
      // Largura escolhida arrastando a borda da imagem. No Markdown vira
      // `<img ... width="320">` (o `![]()` não tem como guardar tamanho).
      width: {
        default: null,
        parseHTML: (element) => normalizeImageWidth(element.getAttribute("width")),
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        class: "solon-editor-image",
      }),
    ];
  },

  // Moldura com uma alça em cada lado: arrastar muda a largura (a imagem
  // fica centralizada, então a borda acompanha o cursor), duplo clique na
  // alça volta ao tamanho original. O tamanho só vai para o documento ao
  // soltar — durante o arraste muda só o estilo, sem encher o desfazer.
  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let node = initialNode;

      const frame = document.createElement("div");
      frame.className = "solon-image-frame";
      frame.contentEditable = "false";

      const img = document.createElement("img");
      img.className = "solon-editor-image";
      img.draggable = false;
      frame.appendChild(img);

      const size = document.createElement("span");
      size.className = "solon-image-size";
      size.setAttribute("aria-hidden", "true");
      frame.appendChild(size);

      const render = () => {
        const attrs = node.attrs as {
          src: string | null;
          alt: string;
          title: string | null;
          dataSolonSrc: string | null;
          width: string | null;
        };
        if (attrs.src) img.setAttribute("src", attrs.src);
        else img.removeAttribute("src");
        img.setAttribute("alt", attrs.alt ?? "");
        if (attrs.title) img.setAttribute("title", attrs.title);
        else img.removeAttribute("title");
        if (attrs.dataSolonSrc) img.setAttribute("data-solon-src", attrs.dataSolonSrc);
        else img.removeAttribute("data-solon-src");
        if (attrs.width) img.setAttribute("width", attrs.width);
        else img.removeAttribute("width");
        img.style.width = widthStyle(attrs.width);
      };
      render();

      const commitWidth = (width: string | null) => {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number" || !editor.isEditable) return;
        if ((node.attrs.width ?? null) === width) return;
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width });
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        editor.view.dispatch(tr);
        // A alça não tira o foco de onde estava; com o editor focado, o
        // Ctrl+Z desfaz o redimensionamento logo em seguida.
        editor.view.focus();
      };

      const startResize = (event: MouseEvent, side: "left" | "right") => {
        if (event.button !== 0 || !editor.isEditable) return;
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = img.getBoundingClientRect().width;
        const available = frame.parentElement?.clientWidth || startWidth;
        let width = startWidth;
        // A moldura é arrastável (mover a imagem pelo texto); durante o
        // redimensionamento, o navegador não pode começar esse outro arraste.
        const wasDraggable = frame.draggable;
        frame.draggable = false;
        frame.classList.add("is-resizing");
        document.documentElement.classList.add("solon-resizing-image");

        const finish = () => {
          frame.draggable = wasDraggable;
          frame.classList.remove("is-resizing");
          document.documentElement.classList.remove("solon-resizing-image");
        };

        startDrag({
          onMove: (ev) => {
            ev.preventDefault();
            const delta = (ev.clientX - startX) * (side === "right" ? 2 : -2);
            width = Math.round(
              Math.min(available, Math.max(MIN_IMAGE_WIDTH, startWidth + delta)),
            );
            img.style.width = `${width}px`;
            size.textContent = `${width} px`;
          },
          onEnd: () => {
            finish();
            if (Math.abs(width - startWidth) < 1) {
              render();
              return;
            }
            commitWidth(String(width));
          },
          onCancel: () => {
            finish();
            render();
          },
        });
      };

      for (const side of ["left", "right"] as const) {
        const handle = document.createElement("span");
        handle.className = "solon-image-handle";
        handle.dataset.side = side;
        handle.title = "Arraste para mudar o tamanho · duplo clique volta ao original";
        handle.addEventListener("mousedown", (event) => startResize(event, side));
        handle.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          commitWidth(null);
        });
        frame.appendChild(handle);
      }

      return {
        dom: frame,
        update: (next) => {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        selectNode: () => frame.classList.add("is-selected"),
        deselectNode: () => frame.classList.remove("is-selected"),
        // As alças são nossas: o ProseMirror não seleciona nem arrasta a
        // imagem quando o clique começa nelas.
        stopEvent: (event) =>
          event.target instanceof HTMLElement &&
          event.target.classList.contains("solon-image-handle"),
        ignoreMutation: () => true,
      };
    };
  },
});
