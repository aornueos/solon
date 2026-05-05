import { create } from "zustand";
import {
  CanvasArrow,
  CanvasCard,
  CanvasDoc,
  CanvasImage,
  CanvasStroke,
  CanvasText,
  CanvasTool,
  CanvasViewport,
  CardSide,
  DEFAULT_CARD_H,
  DEFAULT_CARD_W,
  DEFAULT_DRAW_WIDTH,
  DEFAULT_SCENE_CARD_H,
  DEFAULT_SCENE_CARD_W,
  DEFAULT_TEXT_SIZE,
  EMPTY_CANVAS,
  SceneCardSnapshot,
} from "../types/canvas";

/**
 * Store dedicada do canvas.
 *
 * Cada arquivo `.md` tem seu próprio canvas (sidecar `<file>.canvas.json`).
 * Separada da `useAppStore` porque:
 *  - muitas mudanças são de alta frequência (drag, pan/zoom) e não devem
 *    re-renderizar o editor;
 *  - o ciclo de save/load é diferente do `.md` (JSON vs. markdown).
 */

/** Tipo auxiliar para saber a natureza do item selecionado. */
export type SelectionKind = "card" | "arrow" | "text" | "stroke" | "image";

/**
 * Snapshot das posicoes originais dos itens de uma selecao, capturado
 * no comeco de um drag de grupo. Usado pelo `translateSelection` para
 * aplicar o mesmo delta em todos os itens sem acumular erro de
 * arredondamento que o padrao "dx incremental por frame" produziria.
 *
 * Strokes guardam o array de `points` original inteiro (em world coords)
 * porque nao tem um par x/y — a translacao e aplicada ponto a ponto.
 */
export type SelectionSnapshot = Map<
  string,
  | { kind: "card" | "image" | "text"; x: number; y: number }
  | { kind: "stroke"; points: number[] }
>;

/**
 * Snapshot mínimo serializavel pra historico de undo/redo. Inclui só os
 * arrays de geometria — viewport (pan/zoom) e tool nao entram porque o
 * usuario nao espera que Ctrl+Z desfaca um zoom acidental ou volte de
 * eraser pra select.
 */
interface CanvasSnapshot {
  cards: CanvasCard[];
  arrows: CanvasArrow[];
  texts: CanvasText[];
  strokes: CanvasStroke[];
  images: CanvasImage[];
}

const MAX_HISTORY = 80;

interface CanvasState {
  /** Arquivo `.md` para qual este canvas pertence (ou null). */
  filePath: string | null;
  cards: CanvasCard[];
  arrows: CanvasArrow[];
  texts: CanvasText[];
  strokes: CanvasStroke[];
  images: CanvasImage[];
  viewport: CanvasViewport;

  /** Pilha de snapshots para undo (mais antigo no inicio, mais recente no fim). */
  past: CanvasSnapshot[];
  /** Pilha de snapshots para redo. Limpa em qualquer mutacao nova. */
  future: CanvasSnapshot[];

  /** Ferramenta ativa (default: select). */
  tool: CanvasTool;
  /** Cor atual para free-draw e novos textos flutuantes. */
  drawColor: string;
  drawWidth: number;

  /** id da entidade selecionada primariamente (focus), ou null.
   *  UI contextual (Inspector, ações inline) usa este campo. */
  selectedId: string | null;
  /** IDs selecionados em massa (marquee). Inclui `selectedId` quando há
   *  seleção única. Vazio quando nada está selecionado. */
  selectedIds: Set<string>;
  /** Se estamos no modo "conectar": id do card de origem aguardando destino. */
  linkingFromId: string | null;
  /** Lado escolhido no card de origem (quando o usuário clicou num dos 4
   *  pontos de conexão). Null = auto-pick baseado em geometria. */
  linkingFromSide: CardSide | null;

  /** Carrega doc vindo do disco. */
  hydrate: (filePath: string, doc: CanvasDoc) => void;
  /** Reset ao fechar arquivo/projeto. */
  reset: () => void;

  addCard: (partial?: Partial<CanvasCard>) => string;
  /** Cria um card de cena linkado a um arquivo `.md`. */
  addSceneCard: (args: {
    scenePath: string;
    sceneName: string;
    snapshot: SceneCardSnapshot;
    x: number;
    y: number;
  }) => string;
  updateCard: (id: string, patch: Partial<CanvasCard>) => void;
  /** Atualiza o snapshot de todos os cards linkados a um dado arquivo. */
  updateSceneSnapshotByPath: (
    scenePath: string,
    snapshot: SceneCardSnapshot | null,
  ) => void;
  /** Reaponta cards de `oldPath` para `newPath` (após rename). */
  rewireScenePath: (oldPath: string, newPath: string) => void;
  /** Reaponta cards cujos arquivos estejam dentro de uma pasta movida/renomeada. */
  rewireScenePathPrefix: (oldPrefix: string, newPrefix: string) => void;
  removeCard: (id: string) => void;
  /** Duplica o card selecionado, offsetado um pouco. */
  duplicateCard: (id: string) => string | null;
  bringToFront: (id: string) => void;

  addArrow: (
    from: string,
    to: string,
    sides?: { from?: CardSide; to?: CardSide },
  ) => void;
  removeArrow: (id: string) => void;
  updateArrow: (id: string, patch: Partial<CanvasArrow>) => void;
  setArrowBend: (id: string, bend: { dx: number; dy: number } | null) => void;
  /** Troca o lado de ancoragem de uma das pontas de uma seta existente.
   *  `side = null` remove o override e volta ao auto-pick. */
  setArrowSide: (
    id: string,
    endpoint: "from" | "to",
    side: CardSide | null,
  ) => void;

  addText: (partial: Partial<CanvasText> & { x: number; y: number }) => string;
  updateText: (id: string, patch: Partial<CanvasText>) => void;
  removeText: (id: string) => void;

  addStroke: (stroke: Omit<CanvasStroke, "id">) => string;
  updateStroke: (id: string, patch: Partial<CanvasStroke>) => void;
  removeStroke: (id: string) => void;

  addImage: (img: Omit<CanvasImage, "id">) => string;
  updateImage: (id: string, patch: Partial<CanvasImage>) => void;
  removeImage: (id: string) => void;

  setViewport: (v: Partial<CanvasViewport>) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (clientX: number, clientY: number, delta: number) => void;

  setTool: (tool: CanvasTool) => void;
  setDrawColor: (color: string) => void;
  setDrawWidth: (w: number) => void;

  select: (id: string | null) => void;
  /** Seleciona múltiplos IDs (marquee result). `primary` vira `selectedId`. */
  selectMany: (ids: string[], primary?: string | null) => void;
  /** Alterna um id do conjunto (Shift+click futuro). */
  toggleInSelection: (id: string) => void;
  /** Identifica a categoria de `id` na store. */
  findSelectionKind: (id: string) => SelectionKind | null;
  /** Remove um item por id, descobrindo o tipo dele. Usado pela
   *  ferramenta borracha (que nao discrimina kind no UI). */
  eraseById: (id: string) => void;
  /** Remove todas as entidades selecionadas (`selectedIds`). */
  removeSelected: () => void;
  /** Captura as posicoes originais de todos os itens em `selectedIds`
   *  num snapshot, pra servir de referencia num drag de grupo. */
  snapshotSelection: () => SelectionSnapshot;
  /** Aplica delta (dx, dy) em cada item do snapshot. Reescreve posicoes
   *  como `origem + delta` (nao incremental) pra evitar drift. */
  translateSelection: (snapshot: SelectionSnapshot, dx: number, dy: number) => void;
  beginLink: (fromId: string, side?: CardSide) => void;
  cancelLink: () => void;
  completeLink: (toId: string, side?: CardSide) => void;

  /** Serializa para gravar no disco. */
  toDoc: () => CanvasDoc;

  /** Captura o estado atual no past — chame ANTES de mutar pra registrar
   *  o "ponto de undo". Idempotente em snapshot identico (debounce: nao
   *  empurra se o ultimo past ja e igual ao state atual). */
  pushHistory: () => void;
  /** Reverte ao snapshot mais recente do past. No-op se vazio. */
  undo: () => void;
  /** Re-aplica do future. No-op se vazio. */
  redo: () => void;
}

/**
 * Gera um id razoavelmente único. Tenta `crypto.randomUUID()` primeiro
 * (que entrega 122 bits de entropia e é suportado em Tauri/Chromium e
 * navegadores modernos); cai para um composto de timestamp + 64 bits de
 * `crypto.getRandomValues` como fallback.
 *
 * O antigo `Math.random().toString(36).slice(2, 8)` só dava 6 chars (~36⁶
 * ≈ 2B) o que, em picos de criação (paste rápido, duplicate repetido em
 * strict-mode dev), batia no birthday paradox perto de ~50k ids.
 */
const nanoid = () => {
  const c =
    typeof crypto !== "undefined"
      ? (crypto as Crypto & { randomUUID?: () => string })
      : null;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const buf = new Uint8Array(8);
    c.getRandomValues(buf);
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${Date.now().toString(36)}${hex}`;
  }
  // Último recurso (Tauri sempre terá crypto; esse branch é só defensivo).
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function rebasePath(
  path: string | undefined,
  oldPrefix: string,
  newPrefix: string,
): string | null {
  if (!path) return null;
  const p = normalizedPath(path);
  const oldP = normalizedPath(oldPrefix);
  if (p !== oldP && !p.startsWith(`${oldP}/`)) return null;
  const rel = p === oldP ? "" : p.slice(oldP.length + 1);
  const sep = newPrefix.includes("\\") && !newPrefix.includes("/") ? "\\" : "/";
  if (!rel) return newPrefix;
  const normalizedRel = rel.replace(/[\\/]/g, sep);
  return newPrefix.endsWith("/") || newPrefix.endsWith("\\")
    ? `${newPrefix}${normalizedRel}`
    : `${newPrefix}${sep}${normalizedRel}`;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  filePath: null,
  cards: EMPTY_CANVAS.cards,
  arrows: EMPTY_CANVAS.arrows,
  texts: EMPTY_CANVAS.texts,
  strokes: EMPTY_CANVAS.strokes,
  images: EMPTY_CANVAS.images,
  viewport: { ...EMPTY_CANVAS.viewport },
  tool: "select",
  // `drawColor` e o pigment ativo do toolbar — compartilhado entre free-
  // draw e tool `text`. Default e "" ("Auto", sentinela theme-aware). Pra
  // strokes, "" e tratado como "#2a2420" (Tinta) no `startDrawStroke` —
  // strokes precisam de cor concreta. Pra textos, "" significa "siga
  // var(--text-primary)" e adapta ao tema light/dark — o usuario pode
  // pintar deliberadamente via palette depois.
  drawColor: "",
  drawWidth: DEFAULT_DRAW_WIDTH,
  selectedId: null,
  selectedIds: new Set<string>(),
  linkingFromId: null,
  linkingFromSide: null,
  past: [],
  future: [],

  hydrate: (filePath, doc) =>
    set({
      filePath,
      cards: doc.cards,
      arrows: doc.arrows,
      texts: doc.texts,
      strokes: doc.strokes,
      images: doc.images,
      viewport: doc.viewport,
      selectedId: null,
      selectedIds: new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
      tool: "select",
      // Trocar de arquivo zera o historico — Ctrl+Z apos abrir um canvas
      // diferente nao deveria voltar pro estado do canvas anterior.
      past: [],
      future: [],
    }),

  reset: () =>
    set({
      filePath: null,
      cards: [],
      arrows: [],
      texts: [],
      strokes: [],
      images: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedId: null,
      selectedIds: new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
      tool: "select",
      past: [],
      future: [],
    }),

  addCard: (partial) => {
    get().pushHistory();
    const id = nanoid();
    const { viewport, cards } = get();
    const w = partial?.w ?? DEFAULT_CARD_W;
    const h = partial?.h ?? DEFAULT_CARD_H;
    let x = partial?.x ?? -viewport.x / viewport.zoom + 200;
    let y = partial?.y ?? -viewport.y / viewport.zoom + 120;
    // Evita que cards novos empilhem no mesmo spot — se o retângulo default
    // colidir com um card existente, desloca em cascade até achar um lugar
    // que se sobreponha em no máximo 20% do bbox. Sem isso, clicar "+ Card"
    // várias vezes gera stack perfeito e arrows entre eles ficam ilegíveis.
    if (partial?.x == null && partial?.y == null) {
      const STEP = 32;
      const clash = (cx: number, cy: number) =>
        cards.some((c) => {
          const ox = Math.max(0, Math.min(cx + w, c.x + c.w) - Math.max(cx, c.x));
          const oy = Math.max(0, Math.min(cy + h, c.y + c.h) - Math.max(cy, c.y));
          const overlapArea = ox * oy;
          return overlapArea > w * h * 0.2;
        });
      let guard = 0;
      while (clash(x, y) && guard++ < 40) {
        x += STEP;
        y += STEP;
      }
    }
    const card: CanvasCard = {
      id,
      kind: "text",
      x,
      y,
      w,
      h,
      text: "",
      ...partial,
      // Garante que os overrides de x/y/w/h acima já estejam aplicados
      // mesmo quando `partial` inclui esses campos.
      ...(partial?.x == null ? { x } : {}),
      ...(partial?.y == null ? { y } : {}),
    };
    set((s) => ({ cards: [...s.cards, card], selectedId: id }));
    return id;
  },

  addSceneCard: ({ scenePath, sceneName, snapshot, x, y }) => {
    const existing = get().cards.find(
      (c) => c.kind === "scene" && c.scenePath === scenePath,
    );
    if (existing) {
      set({ selectedId: existing.id });
      return existing.id;
    }
    get().pushHistory();
    const id = nanoid();
    const card: CanvasCard = {
      id,
      kind: "scene",
      x,
      y,
      w: DEFAULT_SCENE_CARD_W,
      h: DEFAULT_SCENE_CARD_H,
      text: sceneName,
      scenePath,
      scene: snapshot,
    };
    set((s) => ({ cards: [...s.cards, card], selectedId: id }));
    return id;
  },

  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  updateSceneSnapshotByPath: (scenePath, snapshot) =>
    set((s) => {
      let changed = false;
      const cards = s.cards.map((c) => {
        if (c.kind !== "scene" || c.scenePath !== scenePath) return c;
        changed = true;
        return { ...c, scene: snapshot ?? undefined };
      });
      return changed ? { cards } : s;
    }),

  rewireScenePath: (oldPath, newPath) =>
    set((s) => {
      let changed = false;
      const cards = s.cards.map((c) => {
        if (c.kind !== "scene" || c.scenePath !== oldPath) return c;
        changed = true;
        return { ...c, scenePath: newPath };
      });
      return changed ? { cards } : s;
    }),

  rewireScenePathPrefix: (oldPrefix, newPrefix) =>
    set((s) => {
      let changed = false;
      const cards = s.cards.map((c) => {
        if (c.kind !== "scene") return c;
        const nextPath = rebasePath(c.scenePath, oldPrefix, newPrefix);
        if (!nextPath || nextPath === c.scenePath) return c;
        changed = true;
        return { ...c, scenePath: nextPath };
      });
      return changed ? { cards } : s;
    }),

  removeCard: (id) => {
    get().pushHistory();
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      arrows: s.arrows.filter((a) => a.from !== id && a.to !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  duplicateCard: (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return null;
    // Cenas não duplicam (duas cards apontando pro mesmo arquivo confunde
    // o fluxo de snapshot e abertura). O atalho vira no-op para cenas.
    if (card.kind === "scene") return null;
    get().pushHistory();
    const newId = nanoid();
    const copy: CanvasCard = {
      ...card,
      id: newId,
      x: card.x + 24,
      y: card.y + 24,
    };
    set((s) => ({ cards: [...s.cards, copy], selectedId: newId }));
    return newId;
  },

  bringToFront: (id) =>
    set((s) => {
      const card = s.cards.find((c) => c.id === id);
      if (!card) return s;
      return { cards: [...s.cards.filter((c) => c.id !== id), card] };
    }),

  addArrow: (from, to, sides) => {
    if (from === to) return;
    get().pushHistory();
    set((s) => {
      // Duplicate check considera também o par de lados: duas setas entre
      // os mesmos cards mas em lados diferentes são legítimas (ex: ida e
      // volta visual distinta). Sem sides, continua bloqueando duplicata.
      if (
        s.arrows.some(
          (a) =>
            a.from === from &&
            a.to === to &&
            a.fromSide === sides?.from &&
            a.toSide === sides?.to,
        )
      ) {
        return s;
      }
      const arrow: CanvasArrow = { id: nanoid(), from, to };
      if (sides?.from) arrow.fromSide = sides.from;
      if (sides?.to) arrow.toSide = sides.to;
      return { arrows: [...s.arrows, arrow] };
    });
  },

  removeArrow: (id) => {
    get().pushHistory();
    set((s) => ({
      arrows: s.arrows.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  updateArrow: (id, patch) =>
    set((s) => ({
      arrows: s.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  setArrowBend: (id, bend) =>
    set((s) => ({
      arrows: s.arrows.map((a) => {
        if (a.id !== id) return a;
        if (bend === null) {
          const { bend: _drop, ...rest } = a;
          return rest;
        }
        return { ...a, bend };
      }),
    })),

  setArrowSide: (id, endpoint, side) =>
    set((s) => ({
      arrows: s.arrows.map((a) => {
        if (a.id !== id) return a;
        const key = endpoint === "from" ? "fromSide" : "toSide";
        if (side === null) {
          // Remove o override pra voltar ao auto-pick
          const copy = { ...a } as CanvasArrow & Record<string, unknown>;
          delete copy[key];
          return copy as CanvasArrow;
        }
        return { ...a, [key]: side };
      }),
    })),

  addText: (partial) => {
    get().pushHistory();
    const id = nanoid();
    // Default color e "" (sentinela "Auto"), nao o `drawColor` da store.
    // Assim o texto recem-criado adapta a cor ao tema (light/dark) via
    // `var(--text-primary)` no FloatingText. Usuario pode trocar pra cor
    // fixa via palette depois (Sangue, Indigo, etc).
    const text: CanvasText = {
      id,
      x: partial.x,
      y: partial.y,
      text: partial.text ?? "",
      size: partial.size ?? DEFAULT_TEXT_SIZE,
      color: partial.color ?? "",
      bold: partial.bold,
    };
    set((s) => ({ texts: [...s.texts, text], selectedId: id }));
    return id;
  },

  updateText: (id, patch) =>
    set((s) => ({
      texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  removeText: (id) => {
    get().pushHistory();
    set((s) => ({
      texts: s.texts.filter((t) => t.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  addStroke: (stroke) => {
    get().pushHistory();
    const id = nanoid();
    set((s) => ({ strokes: [...s.strokes, { ...stroke, id }] }));
    return id;
  },

  updateStroke: (id, patch) =>
    set((s) => ({
      strokes: s.strokes.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),

  removeStroke: (id) => {
    get().pushHistory();
    set((s) => ({
      strokes: s.strokes.filter((t) => t.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  addImage: (img) => {
    get().pushHistory();
    const id = nanoid();
    set((s) => ({ images: [...s.images, { ...img, id }], selectedId: id }));
    return id;
  },

  updateImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  removeImage: (id) => {
    get().pushHistory();
    set((s) => ({
      images: s.images.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),

  panBy: (dx, dy) =>
    set((s) => ({
      viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy },
    })),

  zoomAt: (clientX, clientY, delta) =>
    set((s) => {
      const v = s.viewport;
      const factor = Math.exp(-delta * 0.0015);
      const newZoom = Math.max(0.2, Math.min(3, v.zoom * factor));
      const worldX = (clientX - v.x) / v.zoom;
      const worldY = (clientY - v.y) / v.zoom;
      return {
        viewport: {
          zoom: newZoom,
          x: clientX - worldX * newZoom,
          y: clientY - worldY * newZoom,
        },
      };
    }),

  setTool: (tool) =>
    set((s) => ({
      tool,
      // Trocar de ferramenta limpa seleção/linking pra evitar estados mistos
      selectedId: tool === "select" ? s.selectedId : null,
      selectedIds: tool === "select" ? s.selectedIds : new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
    })),
  setDrawColor: (color) => set({ drawColor: color }),
  setDrawWidth: (w) => set({ drawWidth: w }),

  select: (id) =>
    set({
      selectedId: id,
      selectedIds: id ? new Set<string>([id]) : new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
    }),

  selectMany: (ids, primary = null) => {
    const set_ = new Set<string>(ids);
    const primaryId = primary && set_.has(primary) ? primary : null;
    set({
      selectedIds: set_,
      selectedId: primaryId,
      linkingFromId: null,
      linkingFromSide: null,
    });
  },

  toggleInSelection: (id) =>
    set((s) => {
      const next = new Set<string>(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const primary = next.size === 1 ? [...next][0] : null;
      return { selectedIds: next, selectedId: primary };
    }),

  findSelectionKind: (id) => {
    const s = get();
    if (s.cards.some((c) => c.id === id)) return "card";
    if (s.arrows.some((a) => a.id === id)) return "arrow";
    if (s.texts.some((t) => t.id === id)) return "text";
    if (s.strokes.some((t) => t.id === id)) return "stroke";
    if (s.images.some((i) => i.id === id)) return "image";
    return null;
  },

  eraseById: (id) => {
    const s = get();
    const kind = s.findSelectionKind(id);
    if (kind === "card") s.removeCard(id);
    else if (kind === "arrow") s.removeArrow(id);
    else if (kind === "text") s.removeText(id);
    else if (kind === "stroke") s.removeStroke(id);
    else if (kind === "image") s.removeImage(id);
  },

  removeSelected: () => {
    const s = get();
    const ids = s.selectedIds.size > 0
      ? [...s.selectedIds]
      : s.selectedId ? [s.selectedId] : [];
    if (ids.length === 0) return;
    // Um unico push de history pra todo o batch — senao Delete em N cards
    // viraria N entries no past e o usuario teria que apertar Ctrl+Z N
    // vezes pra recuperar a selecao.
    s.pushHistory();
    const idSet = new Set(ids);
    set((curr) => ({
      cards: curr.cards.filter((c) => !idSet.has(c.id)),
      // Apaga arrows selecionadas E qualquer arrow cujos endpoints
      // foram apagados (cascade equivalente ao removeCard original).
      arrows: curr.arrows.filter(
        (a) => !idSet.has(a.id) && !idSet.has(a.from) && !idSet.has(a.to),
      ),
      texts: curr.texts.filter((t) => !idSet.has(t.id)),
      strokes: curr.strokes.filter((st) => !idSet.has(st.id)),
      images: curr.images.filter((i) => !idSet.has(i.id)),
      selectedId: null,
      selectedIds: new Set<string>(),
    }));
  },

  snapshotSelection: () => {
    const s = get();
    const snap: SelectionSnapshot = new Map();
    for (const id of s.selectedIds) {
      const c = s.cards.find((x) => x.id === id);
      if (c) { snap.set(id, { kind: "card", x: c.x, y: c.y }); continue; }
      const im = s.images.find((x) => x.id === id);
      if (im) { snap.set(id, { kind: "image", x: im.x, y: im.y }); continue; }
      const t = s.texts.find((x) => x.id === id);
      if (t) { snap.set(id, { kind: "text", x: t.x, y: t.y }); continue; }
      const st = s.strokes.find((x) => x.id === id);
      if (st) { snap.set(id, { kind: "stroke", points: st.points.slice() }); continue; }
      // Arrows nao entram no snapshot — derivam da posicao dos cards
      // endpoints, entao se ambos os cards estao no grupo a seta "se move"
      // sozinha; se so uma ponta estiver selecionada, a seta reflow.
    }
    return snap;
  },

  translateSelection: (snapshot, dx, dy) => {
    set((s) => {
      // Constroi novos arrays so se houve mudanca — evita re-render de listas
      // grandes quando o snapshot e vazio.
      if (snapshot.size === 0) return s;
      const cards = s.cards.map((c) => {
        const entry = snapshot.get(c.id);
        if (!entry || entry.kind !== "card") return c;
        return { ...c, x: entry.x + dx, y: entry.y + dy };
      });
      const images = s.images.map((im) => {
        const entry = snapshot.get(im.id);
        if (!entry || entry.kind !== "image") return im;
        return { ...im, x: entry.x + dx, y: entry.y + dy };
      });
      const texts = s.texts.map((t) => {
        const entry = snapshot.get(t.id);
        if (!entry || entry.kind !== "text") return t;
        return { ...t, x: entry.x + dx, y: entry.y + dy };
      });
      const strokes = s.strokes.map((st) => {
        const entry = snapshot.get(st.id);
        if (!entry || entry.kind !== "stroke") return st;
        // Translada ponto a ponto a partir da copia original. Importante:
        // `entry.points` e o snapshot (imutavel); criamos um novo array.
        const pts = new Array<number>(entry.points.length);
        for (let i = 0; i < entry.points.length; i += 2) {
          pts[i] = entry.points[i] + dx;
          pts[i + 1] = entry.points[i + 1] + dy;
        }
        return { ...st, points: pts };
      });
      return { cards, images, texts, strokes };
    });
  },

  beginLink: (fromId, side) =>
    set({
      linkingFromId: fromId,
      linkingFromSide: side ?? null,
      selectedId: fromId,
    }),

  cancelLink: () => set({ linkingFromId: null, linkingFromSide: null }),

  completeLink: (toId, side) => {
    const { linkingFromId: from, linkingFromSide: fromSide } = get();
    if (!from) return;
    get().addArrow(from, toId, {
      from: fromSide ?? undefined,
      to: side,
    });
    set({ linkingFromId: null, linkingFromSide: null });
  },

  toDoc: (): CanvasDoc => {
    const { cards, arrows, texts, strokes, images, viewport } = get();
    return { version: 1, cards, arrows, texts, strokes, images, viewport };
  },

  pushHistory: () => {
    const s = get();
    const snap: CanvasSnapshot = {
      cards: s.cards,
      arrows: s.arrows,
      texts: s.texts,
      strokes: s.strokes,
      images: s.images,
    };
    // Debounce: se o ultimo snapshot tem as mesmas referencias, nao
    // empurra de novo. Acontece quando duas mutacoes vem no mesmo tick
    // e ambas chamam pushHistory.
    const last = s.past[s.past.length - 1];
    if (
      last &&
      last.cards === snap.cards &&
      last.arrows === snap.arrows &&
      last.texts === snap.texts &&
      last.strokes === snap.strokes &&
      last.images === snap.images
    ) {
      // future tambem precisa morrer — qualquer nova acao invalida o redo
      if (s.future.length > 0) set({ future: [] });
      return;
    }
    const past = s.past.length >= MAX_HISTORY
      ? [...s.past.slice(s.past.length - MAX_HISTORY + 1), snap]
      : [...s.past, snap];
    set({ past, future: [] });
  },

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const prev = s.past[s.past.length - 1];
    const present: CanvasSnapshot = {
      cards: s.cards,
      arrows: s.arrows,
      texts: s.texts,
      strokes: s.strokes,
      images: s.images,
    };
    set({
      cards: prev.cards,
      arrows: prev.arrows,
      texts: prev.texts,
      strokes: prev.strokes,
      images: prev.images,
      past: s.past.slice(0, -1),
      future: [...s.future, present],
      // Selecao pode referenciar items que sumiram no undo — limpa por
      // seguranca. UX equivalente ao Figma/Excalidraw.
      selectedId: null,
      selectedIds: new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[s.future.length - 1];
    const present: CanvasSnapshot = {
      cards: s.cards,
      arrows: s.arrows,
      texts: s.texts,
      strokes: s.strokes,
      images: s.images,
    };
    set({
      cards: next.cards,
      arrows: next.arrows,
      texts: next.texts,
      strokes: next.strokes,
      images: next.images,
      past: [...s.past, present],
      future: s.future.slice(0, -1),
      selectedId: null,
      selectedIds: new Set<string>(),
      linkingFromId: null,
      linkingFromSide: null,
    });
  },
}));
