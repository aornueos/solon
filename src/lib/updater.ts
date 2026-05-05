/**
 * Wrapper do plugin oficial `@tauri-apps/plugin-updater`.
 *
 * Responsabilidades:
 *  - Detectar se estamos no Tauri (no browser dev, vira no-op silencioso).
 *  - Throttle de checagem (LAST_CHECK_TTL_MS) — evita martelar o endpoint
 *    a cada boot/foco.
 *  - Skip por versão — quando o user clica "Ignorar 0.2.0", a gente
 *    salva no localStorage e omite essa versão até aparecer 0.2.1+.
 *  - Falhar silencioso em erro de rede — escritor offline não pode ver
 *    erro vermelho de "falha ao verificar updates".
 *
 * O `Update` retornado pelo plugin é stateful (precisa do mesmo handle
 * pra check + downloadAndInstall), então a gente cacheia o último em
 * `cachedUpdate` durante o ciclo de vida do app.
 */
import type { Update } from "@tauri-apps/plugin-updater";

const LAST_CHECK_KEY = "solon:lastUpdateCheck";
const SKIPPED_VERSION_KEY = "solon:skippedUpdate";
const LAST_CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cachedUpdate: Update | null = null;

export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes: string;
  date?: string;
};

export type UpdateCheckResult =
  | { kind: "none" }
  | { kind: "skipped"; version: string }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "error"; message: string }
  | { kind: "unconfigured"; message: string }
  | { kind: "unsupported" };

const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ !== undefined;

function readLastCheck(): number {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeLastCheck(): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* storage indisponível — ignora */
  }
}

export function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function skipVersion(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {
    /* ignora */
  }
}

export function clearSkippedVersion(): void {
  try {
    localStorage.removeItem(SKIPPED_VERSION_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Roda o check no plugin. Throttle padrão de 6h — `force=true` ignora
 * o cache (usado quando o user clica "Verificar atualizações").
 */
export async function checkForUpdate(
  opts: { force?: boolean } = {},
): Promise<UpdateCheckResult> {
  if (!isTauri()) return { kind: "unsupported" };

  if (!opts.force) {
    const last = readLastCheck();
    if (last && Date.now() - last < LAST_CHECK_TTL_MS) {
      // Throttled — não checa, mas se a gente já tem um update cacheado
      // dessa sessão, ainda surface ele.
      if (cachedUpdate) {
        return buildAvailable(cachedUpdate);
      }
      return { kind: "none" };
    }
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    writeLastCheck();
    if (!update) {
      cachedUpdate = null;
      return { kind: "none" };
    }
    cachedUpdate = update;
    return buildAvailable(update);
  } catch (err) {
    // Erro silencioso por design — checks rodam em background no boot e
    // num app de escrita offline-friendly não dá pra incomodar o user
    // com toast vermelho de rede. Surface só em log.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[updater] check failed:", message);
    if (isMissingUpdateFeed(message)) {
      writeLastCheck();
      cachedUpdate = null;
      return {
        kind: "unconfigured",
        message:
          "Canal de atualizacoes ainda nao publicado (latest.json ausente).",
      };
    }
    return { kind: "error", message };
  }
}

function isMissingUpdateFeed(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("404") ||
    text.includes("not found") ||
    (text.includes("latest.json") && text.includes("failed"))
  );
}

function buildAvailable(update: Update): UpdateCheckResult {
  const skipped = getSkippedVersion();
  if (skipped && skipped === update.version) {
    return { kind: "skipped", version: update.version };
  }
  return {
    kind: "available",
    info: {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? "",
      date: update.date,
    },
  };
}

/**
 * Baixa o bundle e instala. NÃO reinicia automaticamente — o caller
 * decide quando chamar `restartApp()` (default: deixar o user clicar).
 *
 * `onProgress` recebe um valor entre 0..1.
 */
export async function downloadAndInstall(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (!isTauri()) throw new Error("Updater não disponível neste ambiente.");
  if (!cachedUpdate) {
    // Caller chamou direto sem ter cacheado. Refaz o check sem throttle.
    const result = await checkForUpdate({ force: true });
    if (result.kind !== "available" || !cachedUpdate) {
      throw new Error("Nenhuma atualização disponível.");
    }
  }

  let downloaded = 0;
  let total = 0;
  await cachedUpdate!.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress?.(0);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (total > 0) onProgress?.(Math.min(1, downloaded / total));
    } else if (event.event === "Finished") {
      onProgress?.(1);
    }
  });
}

/**
 * Reinicia o app. Wrapper porque o plugin de process tem nome diferente
 * (`relaunch`) — uniformizar o vocabulário no nosso código deixa as
 * call-sites mais legíveis.
 */
export async function restartApp(): Promise<void> {
  if (!isTauri()) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
