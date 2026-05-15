const { execFileSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args, opts = {}) {
  const label = [cmd, ...args].join(" ");
  console.log(`\n[release:prepare] ${label}`);
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
}

function runShell(command) {
  console.log(`\n[release:prepare] ${command}`);
  execSync(command, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function output(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  }).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

const pkg = readJson("package.json");
const tauri = readJson(path.join("src-tauri", "tauri.conf.json"));
const tag = `v${pkg.version}`;

const branch = output("git", ["branch", "--show-current"]);
if (branch !== "main") {
  throw new Error(`Release deve sair da branch main. Branch atual: ${branch || "(desconhecida)"}.`);
}

if (pkg.version !== tauri.version) {
  throw new Error(
    `Versoes desalinhadas: package.json=${pkg.version}, tauri.conf.json=${tauri.version}`,
  );
}

const cargoToml = fs.readFileSync(path.join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
if (!cargoToml.includes(`version = "${pkg.version}"`)) {
  throw new Error(`Cargo.toml nao esta em ${pkg.version}.`);
}

const tags = output("git", ["tag", "--list", tag]);
if (tags) {
  throw new Error(`Tag ${tag} ja existe. Rode npm run version:set patch antes.`);
}

const remoteTag = output("git", ["ls-remote", "--tags", "origin", tag]);
if (remoteTag) {
  throw new Error(`Tag ${tag} ja existe no origin. Bumpe a versao antes de publicar.`);
}

const updater = tauri.plugins?.updater;
if (!updater?.active) {
  throw new Error("Updater esta inativo em src-tauri/tauri.conf.json.");
}
if (!Array.isArray(updater.endpoints) || updater.endpoints.length === 0) {
  throw new Error("Updater sem endpoint em src-tauri/tauri.conf.json.");
}
if (!updater.endpoints.some((endpoint) => endpoint.endsWith("/latest/download/latest.json"))) {
  throw new Error("Endpoint do updater nao aponta para releases/latest/download/latest.json.");
}
if (!updater.pubkey || updater.pubkey.length < 40) {
  throw new Error("Updater pubkey ausente ou curta demais em src-tauri/tauri.conf.json.");
}

const webviewMode = tauri.bundle?.windows?.webviewInstallMode;
if (webviewMode?.type !== "downloadBootstrapper") {
  throw new Error("bundle.windows.webviewInstallMode precisa ficar em downloadBootstrapper.");
}

const releaseWorkflowPath = path.join(ROOT, ".github", "workflows", "release.yml");
if (!fs.existsSync(releaseWorkflowPath)) {
  throw new Error("Workflow .github/workflows/release.yml nao existe.");
}
const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, "utf8");
if (!releaseWorkflow.includes("includeUpdaterJson: true")) {
  throw new Error("Workflow de release precisa conter includeUpdaterJson: true.");
}
if (!releaseWorkflow.includes("TAURI_SIGNING_PRIVATE_KEY")) {
  throw new Error("Workflow de release nao referencia TAURI_SIGNING_PRIVATE_KEY.");
}

run("node", [path.join("scripts", "generate-brand-icon.cjs")]);
run("node", [path.join("scripts", "generate-icons.cjs")]);
if (process.platform === "win32") {
  runShell(`${NPM} run build`);
} else {
  run(NPM, ["run", "build"]);
}

const status = output("git", ["status", "--short"]);
const forbidden = status
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) =>
    /(^|\s)(CHANGELOG\.md|CHANGES\.md|\.gitignore|CLAUDE\.md|\.claude[\\/])$/i.test(
      line.slice(3),
    ),
  );

if (forbidden.length > 0) {
  console.warn("\n[release:prepare] Atencao: arquivos que voce pediu para nao commitar:");
  for (const line of forbidden) console.warn(`  ${line}`);
}

console.log(`\n[release:prepare] OK para preparar ${tag}.`);
console.log("\nComandos sugeridos:");
console.log("  git add package.json package-lock.json src src-tauri scripts public/solon.svg");
console.log(`  git commit -m "release: ${tag}"`);
console.log(`  git tag ${tag}`);
console.log("  git push origin main");
console.log(`  git push origin ${tag}`);
