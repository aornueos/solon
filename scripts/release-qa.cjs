const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function output(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  }).trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = readJson("package.json");
const tauri = readJson(path.join("src-tauri", "tauri.conf.json"));
const cargoToml = fs.readFileSync(path.join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
const workflowPath = path.join(ROOT, ".github", "workflows", "release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const tag = `v${pkg.version}`;

assert(pkg.version === tauri.version, "package.json e tauri.conf.json estão desalinhados.");
assert(cargoToml.includes(`version = "${pkg.version}"`), "Cargo.toml está desalinhado.");
assert(tauri.bundle?.windows?.webviewInstallMode?.type === "downloadBootstrapper", "WebView2 precisa usar downloadBootstrapper.");
assert(tauri.plugins?.updater?.active === true, "Updater precisa estar ativo.");
assert(tauri.plugins?.updater?.pubkey?.length > 40, "Updater pubkey ausente ou curta demais.");
assert(
  tauri.plugins?.updater?.endpoints?.some((endpoint) =>
    endpoint.endsWith("/latest/download/latest.json"),
  ),
  "Endpoint do updater precisa apontar para latest.json do release mais recente.",
);
assert(workflow.includes("includeUpdaterJson: true"), "Workflow precisa gerar latest.json.");
assert(workflow.includes("TAURI_SIGNING_PRIVATE_KEY"), "Workflow precisa assinar updates.");

const localTag = output("git", ["tag", "--list", tag]);
const remoteTag = output("git", ["ls-remote", "--tags", "origin", tag]);
assert(!localTag, `Tag local ${tag} já existe.`);
assert(!remoteTag, `Tag remota ${tag} já existe.`);

console.log(`[release:qa] OK para ${tag}`);
