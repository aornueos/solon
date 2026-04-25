/**
 * Metadados de cena — persistidos como YAML frontmatter no .md
 *
 * Chaves estáveis (não renomear sem migração):
 *  - pov, location, time, status, synopsis, wordTarget, tags
 *
 * Canvas, Corkboard, Export, Fountain e views futuras
 * consomem este mesmo contrato.
 */
export type SceneStatus = "draft" | "revised" | "final";

export const SCENE_STATUSES: { value: SceneStatus; label: string; color: string }[] = [
  { value: "draft", label: "Rascunho", color: "#c9a05a" },
  { value: "revised", label: "Revisado", color: "#6b8e4e" },
  { value: "final", label: "Final", color: "#7c5c3e" },
];

export interface SceneMeta {
  pov?: string;
  location?: string;
  time?: string;
  status?: SceneStatus;
  synopsis?: string;
  wordTarget?: number;
  tags?: string[];
}

export const EMPTY_SCENE_META: SceneMeta = {};

export function isSceneStatus(value: unknown): value is SceneStatus {
  return value === "draft" || value === "revised" || value === "final";
}
