/**
 * Contrato do Canvas Miro-inspired.
 *
 * O canvas é uma *visão* sobre o projeto — cards podem ser freeform
 * (texto livre) ou linkados a uma cena (`.md` com frontmatter). No MVP
 * v0.4.0 implementamos freeform; scene-link vem em passo futuro.
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
  from: string; // card id
  to: string;   // card id
  label?: string;
  /** Offset (em world coords) do ponto de controle em relação ao ponto médio
   *  da reta from→to. Quando ausente, a arrow usa uma curva padrão sutil. */
  bend?: { dx: number; dy: number };
  /** Lado específico do card de origem onde a seta se ancora.
   *  Ausente = auto (lado que encara o outro card). */
  fromSide?: CardSide;
  /** Lado específico do card de destino onde a seta se ancora.
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
  text: string;
  size: number;   // em px (world coords)
  color: string;  // hex
  bold?: boolean;
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
 * referencia.
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

/**
 * Paleta de cores pro free-draw / textos flutuantes — simples e editorial,
 * sem saturação pura.
 *
 * O primeiro item, "Auto", usa value vazio como sentinela: significa "siga
 * a cor do tema" (`var(--text-primary)`). Sem isso, textos criados em tema
 * claro (cor padrao "#2a2420" sépia escuro) viravam preto-em-grafite e
 * sumiam ao trocar pra dark theme. "Auto" e o default para FloatingText
 * exatamente por esse motivo — o usuario pode pintar deliberadamente
 * depois (sangue, indigo, etc) e o pigment fica fixo, mas o caso comum e
 * "tinta padrao que se adapta".
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
export const DEFAULT_TEXT_SIZE = 18;

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
