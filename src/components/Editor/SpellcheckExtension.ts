import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { useAppStore } from "../../store/useAppStore";
import {
  checkWords,
  ensureSpellchecker,
  normalizeSpellWord,
  shouldSpellcheckWord,
} from "../../lib/spellcheck";

type SpellMeta = { decorations: Decoration[] };

const spellcheckKey = new PluginKey<DecorationSet>("solon-spellcheck");
const WORD_RE = /[\p{L}\p{M}]{2,}/gu;
const MAX_UNIQUE_WORDS = 2500;

export const SpellcheckExtension = Extension.create({
  name: "solonSpellcheck",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: spellcheckKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet, _oldState, newState) {
            const meta = tr.getMeta(spellcheckKey) as SpellMeta | undefined;
            if (meta) {
              return DecorationSet.create(newState.doc, meta.decorations);
            }
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return spellcheckKey.getState(state) ?? DecorationSet.empty;
          },
        },
        view(view) {
          let timeout: number | null = null;
          let destroyed = false;
          let sequence = 0;
          let lastEnabled = useAppStore.getState().spellcheckEnabled;

          const dispatchDecorations = (decorations: Decoration[]) => {
            if (destroyed) return;
            view.dispatch(
              view.state.tr.setMeta(spellcheckKey, { decorations }),
            );
          };

          const run = async (editorView: EditorView) => {
            const enabled = useAppStore.getState().spellcheckEnabled;
            const currentSequence = ++sequence;
            if (!enabled) {
              dispatchDecorations([]);
              return;
            }

            ensureSpellchecker();
            const ranges = collectWordRanges(editorView);
            const words = Array.from(new Set(ranges.map((r) => r.normalized)));
            const checks = await checkWords(words);
            if (destroyed || currentSequence !== sequence) return;

            const decorations = ranges
              .filter((range) => checks.get(range.normalized) === false)
              .map((range) =>
                Decoration.inline(range.from, range.to, {
                  class: "solon-spell-error",
                }),
              );
            dispatchDecorations(decorations);
          };

          const schedule = (editorView: EditorView) => {
            if (timeout !== null) window.clearTimeout(timeout);
            timeout = window.setTimeout(() => {
              timeout = null;
              void run(editorView);
            }, 450);
          };

          const unsubscribe = useAppStore.subscribe((state) => {
            if (state.spellcheckEnabled === lastEnabled) return;
            lastEnabled = state.spellcheckEnabled;
            schedule(view);
          });
          const onPersonalDictChanged = () => schedule(view);
          window.addEventListener(
            "solon:spellcheck-dict-changed",
            onPersonalDictChanged,
          );

          schedule(view);

          return {
            update(nextView, prevState) {
              if (prevState.doc !== nextView.state.doc) schedule(nextView);
            },
            destroy() {
              destroyed = true;
              if (timeout !== null) window.clearTimeout(timeout);
              window.removeEventListener(
                "solon:spellcheck-dict-changed",
                onPersonalDictChanged,
              );
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});

function collectWordRanges(view: EditorView): {
  from: number;
  to: number;
  normalized: string;
}[] {
  const ranges: { from: number; to: number; normalized: string }[] = [];
  const unique = new Set<string>();
  const selectionFrom = view.state.selection.from;
  const selectionTo = view.state.selection.to;

  view.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    WORD_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_RE.exec(node.text))) {
      const word = match[0];
      const from = pos + match.index;
      const to = from + word.length;
      if (selectionFrom <= to && selectionTo >= from) continue;
      if (!shouldSpellcheckWord(word)) continue;
      const normalized = normalizeSpellWord(word);
      if (!unique.has(normalized)) {
        if (unique.size >= MAX_UNIQUE_WORDS) continue;
        unique.add(normalized);
      }
      ranges.push({
        from,
        to,
        normalized,
      });
    }
  });

  return ranges;
}
