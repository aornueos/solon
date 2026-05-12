import type { OpenTab } from "../store/useAppStore";

export const TAB_DND_MIME = "application/x-solon-tab";

export function readDraggedTab(dataTransfer: DataTransfer): OpenTab | null {
  const raw = dataTransfer.getData(TAB_DND_MIME);
  if (!raw) return null;
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
    return null;
  }
  return null;
}
