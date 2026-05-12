import type { OpenTab } from "../store/useAppStore";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function safeLabelPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_:]/g, "_").slice(0, 40) || "file";
}

export function requestedFileFromUrl():
  | { path: string; name: string; view: "editor" | "canvas" }
  | null {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("solonFile");
  const name = params.get("solonName");
  if (!path || !name) return null;
  const rawView = params.get("solonView");
  return {
    path,
    name,
    view: rawView === "canvas" ? "canvas" : "editor",
  };
}

export async function openTabInNewWindow(
  tab: OpenTab,
  view: "editor" | "canvas" = "editor",
): Promise<void> {
  const query = new URLSearchParams({
    solonFile: tab.path,
    solonName: tab.name,
    solonView: view,
    solonWindow: "1",
  });
  const url = `index.html?${query.toString()}`;

  if (!isTauri) {
    window.open(`${window.location.origin}/?${query.toString()}`, "_blank", "noopener");
    return;
  }

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = `solon-${Date.now()}-${safeLabelPart(tab.name)}`;
  const win = new WebviewWindow(label, {
    url,
    title: `Solon - ${tab.name.replace(/\.(md|txt)$/i, "")}`,
    width: 1120,
    height: 760,
    minWidth: 800,
    minHeight: 500,
    decorations: false,
    resizable: true,
    center: true,
  });

  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (event) => reject(event.payload));
  });
}
