import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface FindMatchRange {
  from: number;
  to: number;
}

type FindHighlightMeta = {
  matches: FindMatchRange[];
  currentIndex: number;
};

export const findHighlightKey = new PluginKey<DecorationSet>(
  "solon-find-highlight",
);

export const FindHighlightExtension = Extension.create({
  name: "solonFindHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: findHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet, _oldState, newState) {
            const meta = tr.getMeta(findHighlightKey) as
              | FindHighlightMeta
              | undefined;
            if (meta) {
              const decorations = meta.matches.map((match, idx) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    idx === meta.currentIndex
                      ? "solon-find-match solon-find-current"
                      : "solon-find-match",
                }),
              );
              return DecorationSet.create(newState.doc, decorations);
            }
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return findHighlightKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function setFindHighlights(
  view: EditorView,
  matches: FindMatchRange[],
  currentIndex: number,
) {
  view.dispatch(
    view.state.tr.setMeta(findHighlightKey, { matches, currentIndex }),
  );
}

export function clearFindHighlights(view: EditorView) {
  setFindHighlights(view, [], 0);
}
