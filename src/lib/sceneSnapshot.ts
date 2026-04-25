import { parseDocument } from "./frontmatter";
import { SceneCardSnapshot } from "../types/canvas";
import { SceneMeta } from "../types/scene";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Lê um `.md` do disco e devolve um snapshot pronto para o card de cena.
 * Se a leitura falhar (arquivo removido, renomeado), devolve `null`.
 */
export async function readSceneSnapshot(
  path: string,
  name: string,
): Promise<SceneCardSnapshot | null> {
  if (!isTauri) {
    // Browser mock: sem fs, devolve snapshot mínimo
    return { title: titleFromName(name) };
  }
  try {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(path))) return null;
    const raw = await readTextFile(path);
    const { meta, body } = parseDocument(raw);
    return makeSnapshot(name, meta, body);
  } catch (err) {
    console.error("readSceneSnapshot:", err);
    return null;
  }
}

/**
 * Constrói o snapshot a partir do nome + meta + body já parseados.
 * Usado pelo live-sync quando a cena ativa é editada no editor.
 */
export function makeSnapshot(
  name: string,
  meta: SceneMeta,
  body: string,
): SceneCardSnapshot {
  return {
    title: titleFromName(name),
    status: meta.status,
    pov: meta.pov,
    location: meta.location,
    time: meta.time,
    synopsis: meta.synopsis ?? extractFirstSentences(body, 160),
  };
}

function titleFromName(name: string): string {
  return name.replace(/\.(md|txt)$/i, "");
}

/**
 * Fallback quando não há `synopsis` no frontmatter — pega as primeiras
 * linhas de texto corrido (ignorando headings e blocos especiais) até
 * `maxChars`. Ajuda o escritor a "ler de relance" o que a cena trata.
 */
function extractFirstSentences(body: string, maxChars: number): string | undefined {
  if (!body) return undefined;
  const lines = body.split(/\r?\n/);
  const plain: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) continue;    // headings
    if (t.startsWith(">")) continue;    // blockquotes
    if (t.startsWith("---")) continue;  // hr
    if (/^[-*]\s/.test(t)) continue;    // bullets
    if (/^\d+\.\s/.test(t)) continue;   // listas numeradas
    plain.push(t);
    if (plain.join(" ").length >= maxChars) break;
  }
  if (plain.length === 0) return undefined;
  const joined = plain.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > maxChars
    ? joined.slice(0, maxChars).replace(/\s\S*$/, "") + "…"
    : joined;
}
