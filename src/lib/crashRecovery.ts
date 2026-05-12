/**
 * Crash recovery — buffer paralelo que sobrevive a crash do app.
 *
 * Problema: auto-save tem debounce de 1.2s. Se o app crashar entre dois
 * saves (kill -9, BSOD, queda de luz, OneDrive lockando o arquivo),
 * a janela de digitacao mais recente vai pro vacuo. O atomic write
 * cobre crash *durante* a escrita; este modulo cobre o gap *entre*
 * escritas.
 *
 * Estrategia:
 *  - A cada N segundos enquanto saveStatus eh "dirty", escreve um
 *    "draft" em `<root>/.solon/.recovery/<id>.draft` (JSON contendo
 *    {path, content, savedAt}).
 *  - Quando um save real conclui, apaga o draft correspondente.
 *  - No boot, varre `.recovery/`; pra cada draft cujo arquivo original
 *    ainda existe e cujo body do disco difere do body do draft, oferece
 *    recuperar.
 *
 * Trade-offs:
 *  - Drafts ficam em texto puro (mesmo conteudo que vai pro .md), o
 *    que e' aceitavel — quem tem acesso ao FS ja tem acesso ao .md.
 *  - Encoding do path: base64url do path absoluto, evita problemas
 *    com `/`, `\`, espacos, unicode em nome de arquivo.
 *  - Best-effort: falhas silenciosas em todas as operacoes — recovery
 *    nao pode bloquear o fluxo normal.
 */

const RECOVERY_DIR = ".solon/.recovery";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface RecoveryDraft {
  /** Path absoluto do arquivo original. */
  path: string;
  /** Conteudo bruto (.md inteiro, ja com frontmatter se houver). */
  content: string;
  /** Timestamp (epoch ms) da escrita do draft. */
  savedAt: number;
}

function recoveryIdFor(filePath: string): string {
  // Base64url do path absoluto — reverte deterministico. URL-safe pra
  // que o nome do arquivo nunca tenha `/`, `+` ou `=` (compatibilidade
  // Windows + macOS + Linux). Comprimento maximo previsto: ~340 chars
  // pra path de 260 (MAX_PATH do Windows), fica dentro do limite de
  // nome de arquivo em qualquer FS moderno.
  const bytes = new TextEncoder().encode(filePath);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function recoveryPathFor(rootFolder: string, filePath: string): string {
  const sep =
    rootFolder.includes("\\") && !rootFolder.includes("/") ? "\\" : "/";
  const dir = `${rootFolder}${sep}${RECOVERY_DIR.replace(/\//g, sep)}`;
  return `${dir}${sep}${recoveryIdFor(filePath)}.draft`;
}

async function ensureRecoveryDir(rootFolder: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const sep =
      rootFolder.includes("\\") && !rootFolder.includes("/") ? "\\" : "/";
    const dir = `${rootFolder}${sep}${RECOVERY_DIR.replace(/\//g, sep)}`;
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Escreve um draft de recovery pro arquivo. Idempotente — sobrescreve
 * o draft anterior se houver. Silencia falhas (best-effort).
 */
export async function saveRecoveryDraft(
  rootFolder: string | null,
  filePath: string,
  content: string,
): Promise<void> {
  if (!isTauri || !rootFolder || !filePath) return;
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await ensureRecoveryDir(rootFolder);
    const draft: RecoveryDraft = {
      path: filePath,
      content,
      savedAt: Date.now(),
    };
    await writeTextFile(recoveryPathFor(rootFolder, filePath), JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}

/**
 * Apaga o draft de recovery (chamado apos save real bem-sucedido).
 */
export async function clearRecoveryDraft(
  rootFolder: string | null,
  filePath: string,
): Promise<void> {
  if (!isTauri || !rootFolder || !filePath) return;
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const draftPath = recoveryPathFor(rootFolder, filePath);
    if (await exists(draftPath)) {
      await remove(draftPath);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Varre o diretorio de recovery e retorna drafts cujo conteudo diverge
 * do que esta no disco. Esses sao candidatos a "recuperar" no proximo
 * boot. Drafts cujo arquivo original sumiu sao descartados (orfaos).
 *
 * **Performance**: antes lia O ARQUIVO INTEIRO de cada candidato pra
 * comparar string-igual com o draft — fatal pra projetos com varios
 * drafts antigos acumulados (cada save() de arquivo grande virava
 * ~50ms de read + compare). Boot ficou perceptivelmente lento.
 *
 * Agora usa o `mtime` do `stat()` como primeira etapa: se o arquivo
 * em disco foi modificado DEPOIS do draft, o save concluiu (com
 * folga de 1s pra cobrir clock skew) — apaga draft sem ler conteudo.
 * Caso `mtime` <= `savedAt`, ai sim le e compara strings (acontece
 * apenas pra drafts genuinamente em conflito, casos raros).
 *
 * Tambem paraleliza as N comparacoes — antes era serie pura.
 */
export async function scanRecoveryDrafts(
  rootFolder: string | null,
): Promise<RecoveryDraft[]> {
  if (!isTauri || !rootFolder) return [];
  try {
    const { readDir, readTextFile, exists, remove, stat } = await import(
      "@tauri-apps/plugin-fs"
    );
    const sep =
      rootFolder.includes("\\") && !rootFolder.includes("/") ? "\\" : "/";
    const dir = `${rootFolder}${sep}${RECOVERY_DIR.replace(/\//g, sep)}`;
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    const draftEntries = entries.filter((e) => e.name?.endsWith(".draft"));
    if (draftEntries.length === 0) return [];

    // Avalia em paralelo. Cada draft: le metadata do .draft (rapido,
    // arquivo pequeno) + stat do original (rapido). Compara mtime.
    // Le conteudo do original SOMENTE se a heuristica de mtime nao
    // resolve o caso. Resultado: boot ~5x mais rapido em projetos
    // com ~10 drafts acumulados.
    const SKEW_MS = 1000;
    const results = await Promise.all(
      draftEntries.map(async (entry) => {
        const draftPath = `${dir}${sep}${entry.name}`;
        try {
          const raw = await readTextFile(draftPath);
          const draft = JSON.parse(raw) as RecoveryDraft;
          if (!draft.path || typeof draft.content !== "string") {
            return null;
          }
          if (!(await exists(draft.path))) {
            await remove(draftPath).catch(() => {});
            return null;
          }
          // Heuristica rapida via stat: arquivo em disco mais novo que
          // o draft (com tolerancia de 1s) significa que o save real
          // concluiu DEPOIS do ultimo draft escrito — draft eh stale.
          try {
            const info = await stat(draft.path);
            const mtimeMs =
              info.mtime instanceof Date ? info.mtime.getTime() : NaN;
            if (Number.isFinite(mtimeMs) && mtimeMs > draft.savedAt + SKEW_MS) {
              await remove(draftPath).catch(() => {});
              return null;
            }
          } catch {
            // stat falhou — cai pro caminho lento.
          }
          // Caminho lento (apenas pra drafts ambiguos): le o arquivo
          // e compara conteudo.
          const onDisk = await readTextFile(draft.path).catch(() => null);
          if (onDisk === draft.content) {
            await remove(draftPath).catch(() => {});
            return null;
          }
          return draft;
        } catch {
          /* draft corrompido — ignora */
          return null;
        }
      }),
    );
    const drafts = results.filter((d): d is RecoveryDraft => d !== null);
    // Mais recentes primeiro
    drafts.sort((a, b) => b.savedAt - a.savedAt);
    return drafts;
  } catch {
    return [];
  }
}

/**
 * Apaga drafts sem ler/comparar (uso: user dispensou o prompt e quer
 * limpar tudo de uma vez).
 */
export async function purgeAllRecoveryDrafts(
  rootFolder: string | null,
): Promise<void> {
  if (!isTauri || !rootFolder) return;
  try {
    const { readDir, remove, exists } = await import("@tauri-apps/plugin-fs");
    const sep =
      rootFolder.includes("\\") && !rootFolder.includes("/") ? "\\" : "/";
    const dir = `${rootFolder}${sep}${RECOVERY_DIR.replace(/\//g, sep)}`;
    if (!(await exists(dir))) return;
    const entries = await readDir(dir);
    for (const entry of entries) {
      if (!entry.name?.endsWith(".draft")) continue;
      await remove(`${dir}${sep}${entry.name}`).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}
