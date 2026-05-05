/**
 * Mata processos `solon.exe` (Windows) ou `solon` (Unix) em execucao.
 * Usado pra liberar o lock do binario antes de `cargo build` — Windows
 * recusa sobrescrever .exe em uso com `os error 5: Acesso negado`.
 *
 * Idempotente: se nao houver processo rodando, sai limpo. Erros sao
 * suprimidos (taskkill em alvo inexistente retorna codigo != 0).
 *
 * Uso:
 *   npm run kill           # manualmente
 *   (auto via prebuild)    # antes de tauri build/dev
 */
const { execSync } = require("node:child_process");
const os = require("node:os");

const isWindows = os.platform() === "win32";

function tryKill(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (isWindows) {
  // Windows: taskkill /F (force) /IM (image name). Tenta minusculo e
  // capitalizado — `productName` em tauri.conf.json e' "Solon" mas
  // dev mode pode buildar como "solon.exe".
  const k1 = tryKill("taskkill /F /IM solon.exe");
  const k2 = tryKill("taskkill /F /IM Solon.exe");
  if (k1 || k2) {
    console.log("[kill] processo Solon encerrado.");
  } else {
    console.log("[kill] nenhum processo Solon rodando.");
  }
} else {
  // Linux/macOS: pkill por nome. -f permite match no path completo.
  tryKill("pkill -f -i 'solon$'");
  console.log("[kill] sinal enviado pra qualquer processo solon.");
}
