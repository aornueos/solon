import type { FileNode } from "../store/useAppStore";
import { atomicWriteTextFile } from "./atomicWrite";
import { isProjectNotePath } from "./pathSecurity";

export interface ProjectBackupResult {
  path: string;
  fileCount: number;
  failedCount: number;
}

export interface ProjectRestoreResult {
  path: string;
  fileCount: number;
  failedCount: number;
}

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function parentOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

function normalized(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function relativePath(rootFolder: string, filePath: string): string | null {
  const root = normalized(rootFolder);
  const file = normalized(filePath);
  if (file === root) return "";
  if (!file.startsWith(`${root}/`)) return null;
  return file.slice(root.length + 1);
}

function backupRoot(rootFolder: string): string {
  return joinPath(joinPath(rootFolder, ".solon"), "backups");
}

function isInsideBackupRoot(rootFolder: string, backupPath: string): boolean {
  const root = normalized(backupRoot(rootFolder)).toLowerCase();
  const target = normalized(backupPath).toLowerCase();
  return target === root || target.startsWith(`${root}/`);
}

function timestampName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
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

function flattenNotes(nodes: FileNode[], rootFolder: string): FileNode[] {
  const out: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file" && isProjectNotePath(rootFolder, node.path)) {
      out.push(node);
    }
    if (node.children) out.push(...flattenNotes(node.children, rootFolder));
  }
  return out;
}

async function ensureDir(path: string): Promise<void> {
  const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function ensureParentDir(path: string): Promise<void> {
  await ensureDir(parentOf(path));
}

async function listBackupDirs(rootFolder: string): Promise<string[]> {
  const { exists, readDir } = await import("@tauri-apps/plugin-fs");
  const root = backupRoot(rootFolder);
  if (!(await exists(root))) return [];
  const entries = await readDir(root);
  return entries
    .filter((entry) => entry.name && ("isDirectory" in entry ? entry.isDirectory : true))
    .map((entry) => joinPath(root, entry.name ?? ""))
    .sort((a, b) => b.localeCompare(a));
}

async function collectBackupNotes(dir: string): Promise<string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(dir);
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.name || entry.name === "manifest.json") continue;
    const full = joinPath(dir, entry.name);
    const isDir = "isDirectory" in entry ? entry.isDirectory : false;
    if (isDir) {
      out.push(...await collectBackupNotes(full));
    } else if (/\.(md|txt)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export async function createProjectBackup(
  rootFolder: string | null,
  fileTree: FileNode[],
): Promise<ProjectBackupResult> {
  if (!isTauri() || !rootFolder) {
    throw new Error("Backup disponível apenas no app desktop com projeto aberto.");
  }

  const notes = flattenNotes(fileTree, rootFolder);
  if (notes.length === 0) {
    throw new Error("Nenhuma nota .md/.txt encontrada para backup.");
  }

  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const backupDir = joinPath(backupRoot(rootFolder), timestampName());
  await ensureDir(backupDir);

  let fileCount = 0;
  let failedCount = 0;

  for (const note of notes) {
    const rel = relativePath(rootFolder, note.path);
    if (!rel) {
      failedCount += 1;
      continue;
    }

    const target = joinPath(backupDir, rel.replace(/[\\/]/g, backupDir.includes("\\") ? "\\" : "/"));
    try {
      const raw = await readTextFile(note.path);
      await ensureParentDir(target);
      const ok = await atomicWriteTextFile(target, raw);
      if (!ok) throw new Error("falha ao gravar cópia");
      fileCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  await atomicWriteTextFile(
    joinPath(backupDir, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        rootFolder,
        fileCount,
        failedCount,
      },
      null,
      2,
    ),
  );

  return { path: backupDir, fileCount, failedCount };
}

export async function restoreLatestProjectBackup(
  rootFolder: string | null,
): Promise<ProjectRestoreResult> {
  if (!isTauri() || !rootFolder) {
    throw new Error("Restauração disponível apenas no app desktop com projeto aberto.");
  }

  const backups = await listBackupDirs(rootFolder);
  const backupDir = backups[0];
  if (!backupDir || !isInsideBackupRoot(rootFolder, backupDir)) {
    throw new Error("Nenhum backup local encontrado.");
  }

  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const notes = await collectBackupNotes(backupDir);
  if (notes.length === 0) {
    throw new Error("O backup mais recente não contém notas restauráveis.");
  }

  let fileCount = 0;
  let failedCount = 0;
  for (const source of notes) {
    const rel = relativePath(backupDir, source);
    if (!rel) {
      failedCount += 1;
      continue;
    }

    const target = joinPath(rootFolder, rel.replace(/[\\/]/g, rootFolder.includes("\\") ? "\\" : "/"));
    if (!isProjectNotePath(rootFolder, target)) {
      failedCount += 1;
      continue;
    }

    try {
      const raw = await readTextFile(source);
      await ensureParentDir(target);
      const ok = await atomicWriteTextFile(target, raw);
      if (!ok) throw new Error("falha ao restaurar nota");
      fileCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return { path: backupDir, fileCount, failedCount };
}
