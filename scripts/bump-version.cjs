/**
 * Bumpa versao em TODOS os 3 arquivos sincronizados:
 *   - package.json (lido em build-time pelo `__APP_VERSION__` via Vite)
 *   - src-tauri/Cargo.toml (versao do binario nativo)
 *   - src-tauri/tauri.conf.json (versao reportada pelo updater)
 *
 * O updater compara a versao reportada (do Cargo/tauri.conf) com a
 * versao do `latest.json`. Se voce bumpa so o package.json, o app NUNCA
 * detecta novas versoes — confusao garantida em alguma release futura.
 *
 * Uso:
 *   npm run version:set 0.6.0
 *   npm run version:set patch    # 0.5.0 → 0.5.1
 *   npm run version:set minor    # 0.5.0 → 0.6.0
 *   npm run version:set major    # 0.5.0 → 1.0.0
 *
 * Apos bumpar, lembre de:
 *   git commit -am "release: vX.Y.Z"
 *   git tag vX.Y.Z
 *   git push origin main --tags
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "package.json");
const CARGO = path.join(ROOT, "src-tauri", "Cargo.toml");
const TAURI_CONF = path.join(ROOT, "src-tauri", "tauri.conf.json");

// ─── parsing do argumento ───
const arg = process.argv[2];
if (!arg) {
  console.error("Uso: npm run version:set <X.Y.Z|patch|minor|major>");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(PKG, "utf-8"));
const current = pkg.version;
const next = resolveNext(current, arg);

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Versao invalida: "${next}". Use semver X.Y.Z.`);
  process.exit(1);
}

console.log(`bump: ${current} → ${next}`);

// ─── package.json ───
pkg.version = next;
// Mantem a indentacao + newline final que o npm gosta de preservar.
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
console.log("  ✓ package.json");

// ─── Cargo.toml ───
let cargoText = fs.readFileSync(CARGO, "utf-8");
const cargoMatch = cargoText.match(/^version\s*=\s*"([^"]+)"/m);
if (!cargoMatch) {
  console.error("Cargo.toml: nao achei `version = \"...\"` na secao [package]");
  process.exit(1);
}
cargoText = cargoText.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`);
fs.writeFileSync(CARGO, cargoText);
console.log("  ✓ src-tauri/Cargo.toml");

// ─── tauri.conf.json ───
const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf-8"));
tauriConf.version = next;
fs.writeFileSync(TAURI_CONF, JSON.stringify(tauriConf, null, 2) + "\n");
console.log("  ✓ src-tauri/tauri.conf.json");

console.log(`\nProximos passos:`);
console.log(`  git commit -am "release: v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push origin main --tags`);

// ─── helpers ───
function resolveNext(current, spec) {
  if (spec === "patch" || spec === "minor" || spec === "major") {
    const [maj, min, pat] = current.split(".").map(Number);
    if ([maj, min, pat].some(Number.isNaN)) {
      throw new Error(`Versao atual "${current}" nao e' semver valido`);
    }
    if (spec === "patch") return `${maj}.${min}.${pat + 1}`;
    if (spec === "minor") return `${maj}.${min + 1}.0`;
    return `${maj + 1}.0.0`;
  }
  // versao explicita
  return spec;
}
