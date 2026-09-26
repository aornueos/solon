import type { TabInsertPlacement } from "../store/useAppStore";

/**
 * Onde uma aba arrastada vai parar. O arraste é por mouse (como no
 * explorador): o drag-and-drop nativo do HTML5 falha no webview do Tauri
 * no Windows, e a aba só se movia pela alça.
 */
export type TabDropTarget =
  | { kind: "reorder"; path: string; placement: TabInsertPlacement }
  | { kind: "split" }
  | { kind: "detach" }
  | null;

export interface TabDropProbe {
  x: number;
  y: number;
  viewport: { width: number; height: number };
  sourcePath: string;
  /** Aba sob o cursor. */
  tab?: { path: string; left: number; width: number } | null;
  /** O cursor está na barra de abas (fora de uma aba). */
  overTabBar?: boolean;
  /** Retângulo da área principal, quando o cursor está nela. */
  splitZone?: { left: number; width: number } | null;
}

/** Evento que liga e desliga o aviso "Soltar como painel de referência". */
export const TAB_SPLIT_HINT_EVENT = "solon:tab-split-hint";

/** A metade direita da área principal (a partir de 55%) abre o painel. */
const SPLIT_FROM = 0.55;

export function resolveTabDrop(probe: TabDropProbe): TabDropTarget {
  const { x, y, viewport } = probe;
  // Solta fora da janela: a aba vira uma janela própria.
  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
    return { kind: "detach" };
  }
  if (probe.tab) {
    if (probe.tab.path === probe.sourcePath) return null;
    const placement: TabInsertPlacement =
      x > probe.tab.left + probe.tab.width / 2 ? "after" : "before";
    return { kind: "reorder", path: probe.tab.path, placement };
  }
  if (probe.overTabBar) return null;
  const zone = probe.splitZone;
  if (zone && x > zone.left + zone.width * SPLIT_FROM) return { kind: "split" };
  return null;
}
