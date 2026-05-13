/**
 * Escrita atomica de arquivos — garante que crash durante a escrita
 * NUNCA deixa o arquivo destino truncado/corrompido.
 *
 * Estrategia: escreve em `<path>.<rand>.solon-tmp`, faz rename atomico
 * por cima do destino. Em FSs comuns (NTFS, APFS, ext4 — todos os
 * casos do user), o rename eh atomico no mesmo volume.
 *
 * O `<rand>` no nome do tmp previne race entre saves concorrentes
 * pro mesmo arquivo (dois flushes do mesmo doc disparados em
 * paralelo, ou save + duplicate operando ao mesmo tempo). Antes
 * usavamos `<path>.solon-tmp` fixo: dois saves simultaneos racavam
 * (um `remove`ava o tmp do outro, ou rename falhava).
 *
 * Em falha do rename (FS readonly, antivirus segurando lock, etc),
 * cai pra `writeTextFile` direto como fallback — perdemos
 * atomicidade mas pelo menos o save acontece.
 *
 * Best-effort: lib retorna sucesso/falha bool; caller decide o que
 * fazer com erro (toast, throw, etc).
 */

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function tmpSuffix(): string {
  // 6 chars hex random — ~16M combinacoes. Suficiente pra evitar
  // colisao entre N saves concorrentes do mesmo arquivo. crypto
  // disponivel em Tauri webview; fallback Math.random pro caso dev.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(3);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2, 8);
}

/**
 * Escreve `content` em `path` de forma atomica. Retorna `true` se
 * sucesso (atomic OU fallback direto), `false` se falhou ambos.
 *
 * Caller que precisar tratar falha (toast/throw) deve ler o boolean
 * de retorno.
 */
export async function atomicWriteTextFile(
  path: string,
  content: string,
): Promise<boolean> {
  if (!isTauri) return false;
  const { writeTextFile, rename, remove, exists } = await import(
    "@tauri-apps/plugin-fs"
  );
  // `<path>.<rand>.solon-tmp` — sufixo random previne race em saves
  // concorrentes pro mesmo destino.
  const tmpPath = `${path}.${tmpSuffix()}.solon-tmp`;
  try {
    await writeTextFile(tmpPath, content);
  } catch (err) {
    // Nem o tmp escreveu — FS provavelmente readonly. Tenta direto.
    try {
      await writeTextFile(path, content);
      return true;
    } catch {
      console.error("[atomicWrite] falha completa:", err);
      return false;
    }
  }
  try {
    await rename(tmpPath, path);
    return true;
  } catch (renameErr) {
    // Fallback: escreve direto (nao-atomico). Tenta limpar o tmp.
    try {
      await writeTextFile(path, content);
    } catch (writeErr) {
      console.error("[atomicWrite] rename + write direto falharam:", renameErr, writeErr);
      try {
        if (await exists(tmpPath)) await remove(tmpPath);
      } catch {
        /* tmp orfao — usuario pode limpar manualmente */
      }
      return false;
    }
    try {
      if (await exists(tmpPath)) await remove(tmpPath);
    } catch {
      /* tmp orfao OK */
    }
    console.warn("[atomicWrite] rename atomico falhou, fallback direto:", renameErr);
    return true;
  }
}
