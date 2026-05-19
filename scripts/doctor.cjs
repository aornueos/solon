/**
 * Preflight do Solon. Roda `npm run doctor` quando algo "não bate" —
 * tipicamente: buildou e saiu uma versão velha, ou `npm ci` faltando.
 *
 * Esta sessão bateu repetidas vezes no mesmo atrito (buildar checkout
 * desatualizado, Cargo.lock à deriva, node_modules sem `docx`). O doctor
 * detecta esses casos ANTES do build de ~3min, em vez de descobrir no
 * fim que saiu `Solon_0.9.8` de novo.
 *
 * Sai com código != 0 só em problema duro (versões desalinhadas, deps
 * críticas faltando) — assim dá pra encadear antes do build. "Atrás de
 * origin/main" é aviso, não erro: buildar um commit antigo pode ser
 * intencional.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
let problems = 0;
let warnings = 0;

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => {
  warnings++;
  console.log(`  ! ${m}`);
};
const bad = (m) => {
  problems++;
  console.log(`  ✗ ${m}`);
};

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}
function readJson(rel) {
  const t = readText(rel);
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
function gitOk(args) {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

console.log("[doctor] Solon preflight\n");

// 1) Versões alinhadas entre os 4 arquivos sincronizados.
const pkg = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml") || "";
const cargoLock = readText("src-tauri/Cargo.lock") || "";
const versions = {
  "package.json": pkg && pkg.version,
  "tauri.conf.json": tauri && tauri.version,
  "Cargo.toml": (cargoToml.match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
  "Cargo.lock(solon)": (cargoLock.match(/name = "solon"\r?\nversion = "([^"]+)"/) || [])[1],
};
const distinct = [...new Set(Object.values(versions).filter(Boolean))];
if (distinct.length === 1) {
  ok(`versão alinhada: ${distinct[0]}`);
} else {
  bad(
    "versões DESALINHADAS: " +
      Object.entries(versions)
        .map(([k, v]) => `${k}=${v ?? "?"}`)
        .join(", ") +
      " — rode `npm run version:set <X.Y.Z>`",
  );
}

// 2) Checkout vs origin/main (sem fetch — usa o que já está local).
const head = git(["rev-parse", "HEAD"]);
const origin = git(["rev-parse", "origin/main"]);
const short = (h) => h.slice(0, 7);
if (!head) {
  warn("não consegui ler HEAD (git disponível?)");
} else if (!origin) {
  warn("sem ref `origin/main` local — rode `git fetch origin`");
} else if (head === origin) {
  ok(`checkout na ponta de origin/main (${short(head)})`);
} else if (gitOk(["merge-base", "--is-ancestor", "HEAD", "origin/main"])) {
  warn(
    `checkout ATRÁS de origin/main (local ${short(head)} < origin ${short(origin)}) ` +
      "— rode `git pull --ff-only` antes de buildar",
  );
} else if (gitOk(["merge-base", "--is-ancestor", "origin/main", "HEAD"])) {
  ok(`à frente de origin/main (${short(head)}, commits locais não pushados)`);
} else {
  warn(`divergiu de origin/main (local ${short(head)}, origin ${short(origin)})`);
}

// 3) package.json vs última tag publicada (informativo).
const latestTag = git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
if (latestTag && pkg && pkg.version) {
  const tagV = latestTag.replace(/^v/, "");
  if (tagV === pkg.version) ok(`versão corresponde à última tag (${latestTag})`);
  else
    warn(
      `package.json=${pkg.version} mas última tag=${latestTag} ` +
        "— build não corresponde a uma release publicada (ok se for dev)",
    );
}

// 4) node_modules tem as deps críticas do lock (pega o "esqueci npm ci").
const critical = ["docx", "esbuild", "@tauri-apps/api", "@tiptap/core", "vite"];
const missing = critical.filter(
  (dep) => !fs.existsSync(path.join(ROOT, "node_modules", dep, "package.json")),
);
if (missing.length === 0) ok("node_modules tem as deps críticas");
else bad(`node_modules sem: ${missing.join(", ")} — rode \`npm ci\``);

console.log(
  `\n[doctor] ${problems} problema(s), ${warnings} aviso(s).` +
    (problems ? " Resolva os ✗ antes de buildar." : " Pronto pra buildar."),
);
process.exit(problems > 0 ? 1 : 0);
