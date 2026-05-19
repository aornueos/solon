const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".tmp");
const outFile = path.join(outDir, "robustness.test.mjs");

fs.mkdirSync(outDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, "tests", "robustness.test.mjs")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "bundle",
  // `docx` so' e' dynamic-import dentro de funcoes de export; os testes
  // exercitam apenas os helpers puros. External evita bundlar a lib
  // inteira (jszip etc.) no bundle de teste.
  external: ["@tauri-apps/*", "docx"],
  logLevel: "silent",
});

const result = spawnSync(process.execPath, [outFile], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
