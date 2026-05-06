/**
 * Gera `public/dict/pt-words.txt`, a lista que o backend Rust embute no
 * binario para spellcheck.
 *
 * A versao antiga pegava somente as palavras-base do Hunspell
 * `dictionary-pt`. Isso descartava regras de flexao e fazia palavras
 * corretas como "jogadores", "estao", "deixou", "apenas", "mais" etc.
 * aparecerem como erro. Agora usamos o trie pt-BR do cspell, que ja vem
 * expandido, e mantemos o Hunspell bruto apenas como complemento.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIC = path.join(ROOT, "node_modules", "dictionary-pt", "index.dic");
const CSPELL_TRIE = path.join(
  ROOT,
  "node_modules",
  "@cspell",
  "dict-pt-br",
  "pt_BR.trie.gz",
);
const DEST_DIR = path.join(ROOT, "public", "dict");
const DEST_FILE = path.join(DEST_DIR, "pt-words.txt");

fs.mkdirSync(DEST_DIR, { recursive: true });

(async () => {
  const words = new Set();

  if (fs.existsSync(CSPELL_TRIE)) {
    await addCspellWords(words);
  } else {
    console.warn(
      "[spellcheck] @cspell/dict-pt-br nao encontrado; usando fallback Hunspell base.",
    );
  }

  if (fs.existsSync(SRC_DIC)) {
    addHunspellBaseWords(words);
  }

  addCommonSupplements(words);

  const sorted = [...words].sort((a, b) => a.localeCompare(b, "pt-BR"));
  fs.writeFileSync(DEST_FILE, sorted.join("\n") + "\n", "utf-8");

  const sizeMB = (fs.statSync(DEST_FILE).size / 1024 / 1024).toFixed(1);
  console.log(
    `[spellcheck] public/dict/pt-words.txt: ${sorted.length.toLocaleString("pt-BR")} palavras (${sizeMB} MB)`,
  );

  for (const old of ["pt.aff", "pt.dic"]) {
    const p = path.join(DEST_DIR, old);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`[spellcheck] removido (legacy): ${old}`);
    }
  }
})().catch((err) => {
  console.error("[spellcheck] falha ao gerar dicionario:", err);
  process.exit(1);
});

async function addCspellWords(words) {
  const { decodeTrie } = await import("cspell-trie-lib");
  const trie = decodeTrie(zlib.gunzipSync(fs.readFileSync(CSPELL_TRIE)));
  let count = 0;

  for (const raw of trie.words()) {
    const word = raw.normalize("NFC").toLowerCase();
    // O trie expande milhoes de entradas, incluindo siglas e compostos.
    // O editor separa hifens antes de checar, entao guardamos apenas
    // formas minusculas naturais para reduzir falsos positivos sem
    // embutir dezenas de MB desnecessarios.
    if (!/^[\p{Ll}\p{M}][\p{Ll}\p{M}'’-]*$/u.test(word)) continue;
    if (word.includes("-") || word.length > 32) continue;
    words.add(word);
    count += 1;
  }

  console.log(
    `[spellcheck] @cspell/dict-pt-br: ${count.toLocaleString("pt-BR")} formas`,
  );
}

function addHunspellBaseWords(words) {
  const raw = fs.readFileSync(SRC_DIC, "utf-8");
  const lines = raw.split(/\r?\n/);
  let count = 0;

  for (const line of lines) {
    if (!line || /^\d+$/.test(line)) continue;
    const slash = line.indexOf("/");
    const word = (slash >= 0 ? line.slice(0, slash) : line)
      .normalize("NFC")
      .toLowerCase();
    if (!word || /\s/.test(word)) continue;
    if (!/^[\p{Ll}\p{M}][\p{Ll}\p{M}'’.-]*$/u.test(word)) continue;
    words.add(word);
    count += 1;
  }

  console.log(
    `[spellcheck] dictionary-pt base: ${count.toLocaleString("pt-BR")} entradas`,
  );
}

function addCommonSupplements(words) {
  const extras = [
    "apenas",
    "mas",
    "mais",
    "menos",
    "eles",
    "elas",
    "nele",
    "nela",
    "neles",
    "nelas",
    "deles",
    "delas",
    "pela",
    "pelas",
    "para",
    "pra",
    "entre",
  ];
  for (const word of extras) words.add(word);
}
