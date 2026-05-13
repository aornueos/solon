import type { OpenTab } from "../store/useAppStore";

export const TAB_DND_MIME = "application/x-solon-tab";

function parseTab(raw: string): OpenTab | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.path === "string" &&
      typeof parsed.name === "string"
    ) {
      return { path: parsed.path, name: parsed.name };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export function readDraggedTab(dataTransfer: DataTransfer): OpenTab | null {
  // Tenta o MIME custom primeiro (formato canonico). Em ambientes que
  // bloqueiam MIMEs custom (Tauri webview em algumas builds), o
  // dataTransfer fica vazio nesse type — caimos no fallback text/plain
  // que o setData duplicado cobre.
  const custom = dataTransfer.getData(TAB_DND_MIME);
  if (custom) {
    const tab = parseTab(custom);
    if (tab) return tab;
  }
  const plain = dataTransfer.getData("text/plain");
  if (plain) return parseTab(plain);
  return null;
}
