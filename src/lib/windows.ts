import type { OpenTab } from "../store/useAppStore";

export const isTauriRuntime = (): boolean =>
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

  if (!isTauriRuntime()) {
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

export async function setAppFullscreen(next?: boolean): Promise<boolean | null> {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const current = await win.isFullscreen();
    const desired = typeof next === "boolean" ? next : !current;
    if (desired !== current) await win.setFullscreen(desired);
    document.documentElement.toggleAttribute("data-solon-fullscreen", desired);
    return desired;
  }

  const doc = document;
  const desired = typeof next === "boolean" ? next : !doc.fullscreenElement;
  if (desired && !doc.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
    document.documentElement.toggleAttribute("data-solon-fullscreen", true);
    return true;
  }
  if (!desired && doc.fullscreenElement) {
    await doc.exitFullscreen?.();
    document.documentElement.toggleAttribute("data-solon-fullscreen", false);
    return false;
  }
  document.documentElement.toggleAttribute("data-solon-fullscreen", desired);
  return desired;
}

export function toggleAppFullscreen(): Promise<boolean | null> {
  return setAppFullscreen();
}
