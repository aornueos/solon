/**
 * Contrato do canvas.
 *
 * O canvas é uma visão sobre o projeto: cards podem ser texto livre ou
 * estar ligados a uma cena (um `.md` com frontmatter). Cada arquivo tem
 * o seu, guardado ao lado dele como `<arquivo>.canvas.json`.
 */

import { SceneStatus } from "./scene";

export type CardKind = "text" | "scene";

/** Snapshot dos metadados de cena para exibição rápida, sem re-ler o arquivo. */
export interface SceneCardSnapshot {
  title: string;
  status?: SceneStatus;
  pov?: string;
  location?: string;
  time?: string;
  synopsis?: string;
}

export interface CanvasCard {
  id: string;
  kind: CardKind;
  /** Posição no *world space* (independe do zoom/pan). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Texto/título do card (usado para kind="text"). */
  text: string;
  /** Cor de fundo (hex). Opcional — default = sepia claro. */
  color?: string;
  /** Para kind="scene": caminho absoluto do arquivo `.md` linkado. */
  scenePath?: string;
  /** Para kind="scene": snapshot para render instantâneo. Sincronizado
   *  automaticamente quando a cena é editada no editor. */
  scene?: SceneCardSnapshot;
}

/** Identifier do MIME type usado no drag'n'drop Sidebar → Canvas. */
export const SCENE_DND_MIME = "application/x-solon-scene";

export const DEFAULT_SCENE_CARD_W = 260;
export const DEFAULT_SCENE_CARD_H = 150;

/** Lado cardinal de um card ao qual uma seta pode se ancorar. */
export type CardSide = "top" | "right" | "bottom" | "left";

export interface CanvasArrow {
  id: string;
  /** id da entidade de origem: card, texto, imagem ou traço. */
  from: string;
  /** id da entidade de destino. */
  to: string;
  /** Espessura visual da seta em world px. */
  width?: number;
  /** Offset (em world coords) do ponto de controle em relação ao ponto médio
   *  da reta from→to. Quando ausente, a arrow usa uma curva padrão sutil. */
  bend?: { dx: number; dy: number };
  /** Lado específico do card de origem onde a seta se âncora.
   *  Ausente = auto (lado que encara o outro card). */
  fromSide?: CardSide;
  /** Lado específico do card de destino onde a seta se âncora.
   *  Ausente = auto. */
  toSide?: CardSide;
}

/**
 * Texto flutuante — texto cru, sem caixa/fundo de card. Útil para títulos
 * de seção do canvas ("Ato I", "Subplot Elara"), anotações soltas, etc.
 */
export interface CanvasText {
  id: string;
  x: number;
  y: number;
  /** Texto puro, usado para medir largura e para a busca. Mantido em
   *  sincronia com `html` (é o `textContent` dele). */
  text: string;
  /** Rich text opcional: formatação por trecho (negrito, itálico, grifo,
   *  cor). Quando presente, é o que se renderiza e edita; os flags de
   *  bloco abaixo passam a valer só como estilo-base, para não dobrar
   *  com a formatação inline. */
  html?: string;
  size: number;   // em px (world coords)
  color: string;  // hex
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  list?: "bullet";
  link?: string;
  /** Cor de grifo (background). Vazio/undefined = sem grifo. */
  highlight?: string;
  /** Largura máxima da caixa (world px). Definida, o texto quebra linha;
   *  ausente, a caixa cresce na horizontal. */
  width?: number;
  /** Altura da caixa (world px). Ausente = altura natural do conteúdo. */
  height?: number;
}

/**
 * Traço de free-draw. Pontos em world coords, representados em flat array
 * `[x0, y0, x1, y1, …]` para economia de bytes no JSON.
 */
export interface CanvasStroke {
  id: string;
  points: number[];
  color: string;
  width: number;  // em world px
}

/**
 * Imagem no canvas. `src` é um caminho relativo à pasta `.solon/` do projeto
 * (ex: "assets/abc123.png"). Os bytes ficam em disco; o canvas.json só
 * referência.
 */
export interface CanvasImage {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
}

/** Modo da ferramenta ativa no canvas. */
export type CanvasTool = "select" | "draw" | "text" | "arrow" | "eraser";

/** Ordem canonica da toolbar do canvas. Os atalhos numericos seguem isto. */
export const CANVAS_TOOL_ORDER: CanvasTool[] = [
  "select",
  "arrow",
  "draw",
  "text",
  "eraser",
];

/**
 * Paleta do desenho livre e dos textos flutuantes — editorial, sem
 * saturação pura.
 *
 * "Auto" usa string vazia como sentinela e significa "siga a cor do tema"
 * (`var(--text-primary)`). É o padrão porque uma cor fixa escolhida num
 * tema claro some ao trocar para um tema escuro; quem quiser um pigmento
 * fixo escolhe um dos outros.
 */
export const DRAW_COLORS: { label: string; value: string }[] = [
  { label: "Auto", value: "" },
  { label: "Tinta", value: "#2a2420" },
  { label: "Sangue", value: "#a04040" },
  { label: "Índigo", value: "#3a5f8f" },
  { label: "Marcador", value: "#d4a825" },
  { label: "Floresta", value: "#4a6b3a" },
];

export const DEFAULT_DRAW_WIDTH = 2;
export const DEFAULT_TEXT_SIZE = 24;

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasDoc {
  version: 1;
  cards: CanvasCard[];
  arrows: CanvasArrow[];
  /** Textos flutuantes (sem card). */
  texts: CanvasText[];
  /** Free-draw strokes. */
  strokes: CanvasStroke[];
  /** Imagens coladas/importadas. */
  images: CanvasImage[];
  viewport: CanvasViewport;
}

export const EMPTY_CANVAS: CanvasDoc = {
  version: 1,
  cards: [],
  arrows: [],
  texts: [],
  strokes: [],
  images: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export const CARD_COLORS: { label: string; value: string }[] = [
  { label: "Sépia", value: "#fdfaf4" },
  { label: "Âmbar", value: "#f5e4c3" },
  { label: "Verde", value: "#dfead0" },
  { label: "Rosa", value: "#f3dcd6" },
  { label: "Azul", value: "#d8e3ec" },
  { label: "Lavanda", value: "#e3dcec" },
];

export const DEFAULT_CARD_W = 220;
export const DEFAULT_CARD_H = 120;
