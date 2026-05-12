import { mergeAttributes, Node } from "@tiptap/core";

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
});
