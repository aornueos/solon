const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEFAULT_SNIPPETS: Record<string, string> = {
  ";chr": "personagem",
};

function join(a: string, b: string): string {
  const sep = a.includes("\\") && !a.includes("/") ? "\\" : "/";
  return a.endsWith("/") || a.endsWith("\\") ? `${a}${b}` : `${a}${sep}${b}`;
}

export async function loadSnippets(
  rootFolder: string | null,
): Promise<Record<string, string>> {
  if (!isTauri || !rootFolder) return DEFAULT_SNIPPETS;
  try {
    const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = join(rootFolder, ".solon/snippets.json");
    if (!(await exists(path))) return DEFAULT_SNIPPETS;
    const parsed = JSON.parse(await readTextFile(path));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_SNIPPETS;
    }
    const custom = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          entry[0].startsWith(";") &&
          typeof entry[1] === "string",
      ),
    );
    return { ...DEFAULT_SNIPPETS, ...custom };
  } catch {
    return DEFAULT_SNIPPETS;
  }
}
