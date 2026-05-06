const { execFileSync } = require("node:child_process");
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

run("node", [path.join("scripts", "generate-brand-icon.cjs")]);
run("node", [path.join("scripts", "generate-icons.cjs")]);
run(NPM, ["run", "build"], process.platform === "win32" ? { shell: true } : {});

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
