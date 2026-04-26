/**
 * Copia o dicionario Hunspell de `node_modules/dictionary-pt/` pra
 * `public/dict/` pra que o Vite sirva como assets estaticos.
 *
 * Por que copiar em vez de importar via `dictionary-pt/index.aff?raw`?
 * O package usa `exports` field restritivo no package.json, bloqueando
 * subpath imports. Vite respeita isso. A unica saida e' acessar os
 * arquivos por filesystem (este script) ou via require dinamico (que
 * nao funciona em browser).
 *
 * Roda como `postinstall` — `npm install` dispara automatico. Output
 * vai pra public/dict/pt.{aff,dic} (nomes amigaveis, sem dependencia
 * do nome do package interno). Spellcheck-impl.ts faz fetch dessas
 * URLs em runtime.
 *
 * Idempotente. Executar varias vezes nao quebra nada — sobrescreve.
 * Se o package nao estiver instalado (npm ci falhou, etc), avisa e
 * sai com 0 — nao queremos fazer o install todo falhar.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "node_modules", "dictionary-pt");
const DEST_DIR = path.join(ROOT, "public", "dict");

const files = [
  { src: "index.aff", dest: "pt.aff" },
  { src: "index.dic", dest: "pt.dic" },
];

if (!fs.existsSync(SRC_DIR)) {
  console.warn(
    "[spellcheck] dictionary-pt nao encontrado em node_modules — pulando copy.",
  );
  console.warn("[spellcheck] (rode `npm install` se quiser spellcheck pt-BR)");
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

for (const { src, dest } of files) {
  const srcPath = path.join(SRC_DIR, src);
  const destPath = path.join(DEST_DIR, dest);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[spellcheck] nao achei ${src} em dictionary-pt — pulando.`);
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  const sizeKB = (fs.statSync(destPath).size / 1024).toFixed(1);
  console.log(`[spellcheck] public/dict/${dest} (${sizeKB} KB)`);
}
