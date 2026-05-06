import { parseDocument } from "./frontmatter";

export interface LocalSnapshot {
  path: string;
  label: string;
  createdAt: number;
  size: number;
}

const MAX_SNAPSHOTS_PER_FILE = 24;

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function relPath(root: string, filePath: string): string {
  const r = normalize(root);
  const f = normalize(filePath);
  return f.startsWith(`${r}/`) ? f.slice(r.length + 1) : f;
}

export function snapshotBucket(rootFolder: string, filePath: string): string {
  const rel = relPath(rootFolder, filePath);
  let hash = 2166136261;
  for (let i = 0; i < rel.length; i += 1) {
    hash ^= rel.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function historyDir(rootFolder: string, filePath: string): string {
  return joinPath(joinPath(joinPath(rootFolder, ".solon"), "history"), snapshotBucket(rootFolder, filePath));
}

function timestampName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function parseTimestamp(name: string): number {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return 0;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  ).getTime();
}

export async function listSnapshots(
  rootFolder: string | null,
  filePath: string | null,
): Promise<LocalSnapshot[]> {
  if (!isTauri() || !rootFolder || !filePath) return [];
  const { readDir, stat } = await import("@tauri-apps/plugin-fs");
  const dir = historyDir(rootFolder, filePath);
  try {
    const entries = await readDir(dir);
    const items = await Promise.all(
      entries
        .filter((entry) => entry.name?.endsWith(".md"))
        .map(async (entry) => {
          const path = joinPath(dir, entry.name ?? "");
          const createdAt = parseTimestamp(entry.name ?? "");
          let size = 0;
          try {
            size = (await stat(path)).size ?? 0;
          } catch {
            /* tamanho e opcional */
          }
          return {
            path,
            createdAt,
            label: createdAt ? formatSnapshotDate(createdAt) : entry.name ?? "Snapshot",
            size,
          };
        }),
    );
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function createSnapshotBeforeWrite({
  rootFolder,
  filePath,
  nextContent,
}: {
  rootFolder: string | null;
  filePath: string;
  nextContent: string;
}): Promise<void> {
  if (!isTauri() || !rootFolder) return;
  const { exists, mkdir, readTextFile, writeTextFile, remove } = await import(
    "@tauri-apps/plugin-fs"
  );

  if (!(await exists(filePath))) return;
  const current = await readTextFile(filePath);
  if (current === nextContent || !current.trim()) return;

  const dir = historyDir(rootFolder, filePath);
  await mkdir(dir, { recursive: true });

  const latest = (await listSnapshots(rootFolder, filePath))[0];
  if (latest) {
    try {
      const latestContent = await readTextFile(latest.path);
      if (latestContent === current) return;
    } catch {
      /* segue e cria novo snapshot */
    }
  }

  await writeTextFile(joinPath(dir, `${timestampName()}.md`), current);

  const all = await listSnapshots(rootFolder, filePath);
  for (const item of all.slice(MAX_SNAPSHOTS_PER_FILE)) {
    try {
      await remove(item.path);
    } catch {
      /* limpeza best-effort */
    }
  }
}

export async function readSnapshot(path: string): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(path);
}

export async function previewSnapshot(path: string): Promise<{
  title: string;
  body: string;
  words: number;
}> {
  const raw = await readSnapshot(path);
  const parsed = parseDocument(raw);
  const text = parsed.body.trim();
  const firstHeading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = firstHeading || text.split(/\r?\n/).find((line) => line.trim())?.trim() || "Snapshot";
  const words = text ? text.split(/\s+/).length : 0;
  return { title, body: text, words };
}

export async function restoreSnapshot(filePath: string, snapshotPath: string): Promise<string> {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const content = await readSnapshot(snapshotPath);
  await writeTextFile(filePath, content);
  return content;
}

function formatSnapshotDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
