import yaml from "js-yaml";
import { SceneMeta, isSceneStatus } from "../types/scene";

export interface ParsedDocument {
  meta: SceneMeta;
  body: string;
}

/**
 * Separa YAML frontmatter do corpo do arquivo.
 *
 * Uma regex não-greedy `^---\n([\s\S]*?)\n---\n?` parece fechar no primeiro
 * `\n---` — mas em documentos de cena é comum o usuário usar `---` como
 * separador de cenas no corpo. Se o YAML tiver erros e o primeiro `---`
 * estiver logo no começo do body, a regex captura algo que *não é* YAML e
 * depois o `yaml.load` falha silenciosamente, perdendo o frontmatter real.
 *
 * Estratégia atual: fatiamos linha por linha — procuramos `---` na primeira
 * linha, depois procuramos a próxima linha que seja exatamente `---`. Isso
 * respeita semântica YAML oficial (o terminador é uma linha `---` standalone,
 * não uma sequência arbitrária de `\n---`).
 *
 * Tolerante: se não houver frontmatter válido, retorna meta vazio + body original.
 */
export function parseDocument(raw: string): ParsedDocument {
  if (!raw) return { meta: {}, body: "" };
  if (!/^---\r?\n/.test(raw)) return { meta: {}, body: raw };

  const lines = raw.split(/\r?\n/);
  // lines[0] === "---". Procura próxima linha igual a "---".
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { meta: {}, body: raw };

  const yamlText = lines.slice(1, endIdx).join("\n");
  const bodyStart = lines.slice(endIdx + 1).join("\n");

  try {
    const parsed = yaml.load(yamlText);
    return { meta: coerceMeta(parsed), body: bodyStart };
  } catch {
    // YAML inválido → devolve arquivo inteiro como body
    return { meta: {}, body: raw };
  }
}

/**
 * Junta metadados + corpo num único string markdown.
 * Se meta for vazio, não escreve o bloco de frontmatter.
 */
export function serializeDocument(meta: SceneMeta, body: string): string {
  const cleaned = cleanMeta(meta);
  if (Object.keys(cleaned).length === 0) return body.replace(/^\n+/, "");

  const yamlText = yaml.dump(serializeKeys(cleaned), {
    indent: 2,
    lineWidth: -1, // sem wrap automático (sinopse pode ser longa)
    noCompatMode: true,
  });

  const bodyClean = body.replace(/^\n+/, "");
  return `---\n${yamlText}---\n\n${bodyClean}`;
}

/** Converte keys do domínio → YAML (camelCase → snake_case para legibilidade humana). */
function serializeKeys(meta: SceneMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.pov !== undefined) out.pov = meta.pov;
  if (meta.location !== undefined) out.location = meta.location;
  if (meta.time !== undefined) out.time = meta.time;
  if (meta.status !== undefined) out.status = meta.status;
  if (meta.synopsis !== undefined) out.synopsis = meta.synopsis;
  if (meta.wordTarget !== undefined) out.word_target = meta.wordTarget;
  if (meta.tags !== undefined && meta.tags.length) out.tags = meta.tags;
  return out;
}

/** Normaliza qualquer objeto para SceneMeta (aceita snake_case e camelCase). */
function coerceMeta(raw: unknown): SceneMeta {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SceneMeta = {};

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : v != null ? String(v) : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : undefined;

  if (r.pov != null) out.pov = str(r.pov);
  if (r.location != null) out.location = str(r.location);
  if (r.time != null) out.time = str(r.time);

  const status = r.status;
  if (isSceneStatus(status)) out.status = status;

  if (r.synopsis != null) out.synopsis = str(r.synopsis);

  const wt = r.word_target ?? r.wordTarget;
  const wtNum = num(wt);
  if (wtNum !== undefined && !Number.isNaN(wtNum)) out.wordTarget = wtNum;

  if (Array.isArray(r.tags)) {
    out.tags = r.tags.map(String).filter(Boolean);
  } else if (typeof r.tags === "string") {
    out.tags = r.tags.split(",").map((t) => t.trim()).filter(Boolean);
  }

  return out;
}

/** Remove campos vazios/undefined para não poluir o YAML. */
function cleanMeta(meta: SceneMeta): SceneMeta {
  const out: SceneMeta = {};
  if (meta.pov?.trim()) out.pov = meta.pov.trim();
  if (meta.location?.trim()) out.location = meta.location.trim();
  if (meta.time?.trim()) out.time = meta.time.trim();
  if (meta.status) out.status = meta.status;
  if (meta.synopsis?.trim()) out.synopsis = meta.synopsis.trim();
  if (meta.wordTarget && meta.wordTarget > 0) out.wordTarget = meta.wordTarget;
  if (meta.tags && meta.tags.length) out.tags = meta.tags.filter(Boolean);
  return out;
}
