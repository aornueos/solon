const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".tmp");
const testsDir = path.join(root, "tests");

fs.mkdirSync(outDir, { recursive: true });

// Um bundle por arquivo de teste: os que montam um DOM (jsdom) não podem
// vazar `window` para os que testam o comportamento sem DOM.
const entries = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

let failed = false;
for (const name of entries) {
  const outFile = path.join(outDir, name);
  esbuild.buildSync({
    entryPoints: [path.join(testsDir, name)],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "bundle",
    // `docx` so' e' dynamic-import dentro de funcoes de export; os testes
    // exercitam apenas os helpers puros. External evita bundlar a lib
    // inteira (jszip etc.) no bundle de teste. O jsdom carrega arquivos
    // em runtime e não sobrevive a bundle.
    external: ["@tauri-apps/*", "docx", "jsdom"],
    logLevel: "silent",
  });

  const result = spawnSync(process.execPath, [outFile], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
