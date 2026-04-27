/**
 * Pre-processa o dicionario pt-BR pra um formato simples que NAO depende
 * de bibliotecas Hunspell-compatible em puro JS (que estouravam o V8 com
 * "Too many properties to enumerate").
 *
 * Output:
 *   public/dict/pt-words.txt  — lista plain text, uma palavra por linha,
 *                                lowercase, deduplicada.
 *
 * Como geramos a lista? O `.dic` do dictionary-pt tem linhas no formato
 * `palavra/flags` ou `palavra`. As flags codificariam regras de afixacao
 * (conjugacoes, generos, etc) que precisariam de Hunspell pra expandir.
 *
 * SEM expansao, perdemos algumas conjugacoes raras. Mas o `.dic` do pt-BR
 * lista MUITAS formas explicitamente (300k+ entradas) — cobertura
 * pratica e' boa o suficiente pra um app de escrita.
 *
 * Quando precisarmos de cobertura total, plano e' rodar Hunspell
 * (nodehun ou cli) em postinstall pra expandir todas as formas. Por
 * agora a lista bruta e' o caminho mais simples e robusto.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIC = path.join(ROOT, "node_modules", "dictionary-pt", "index.dic");
const DEST_DIR = path.join(ROOT, "public", "dict");
const DEST_FILE = path.join(DEST_DIR, "pt-words.txt");

if (!fs.existsSync(SRC_DIC)) {
  console.warn(
    "[spellcheck] dictionary-pt nao encontrado em node_modules — pulando.",
  );
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

const raw = fs.readFileSync(SRC_DIC, "utf-8");
const lines = raw.split(/\r?\n/);
// Primeira linha do .dic e' o count (numero), pula.
// Cada linha: `palavra` ou `palavra/FLAGS`. Pegamos so' o lado esquerdo.
const words = new Set();
for (const line of lines) {
  if (!line) continue;
  // Skip header numerico
  if (/^\d+$/.test(line)) continue;
  const slash = line.indexOf("/");
  const word = slash >= 0 ? line.slice(0, slash) : line;
  // Skip palavras com tab/espaco (anomalias) e palavras vazias.
  if (!word || /\s/.test(word)) continue;
  words.add(word.toLowerCase());
}

const sorted = [...words].sort();
fs.writeFileSync(DEST_FILE, sorted.join("\n") + "\n", "utf-8");

const sizeKB = (fs.statSync(DEST_FILE).size / 1024).toFixed(1);
console.log(
  `[spellcheck] public/dict/pt-words.txt: ${sorted.length.toLocaleString("pt-BR")} palavras (${sizeKB} KB)`,
);

// Apaga eventuais arquivos antigos (.aff/.dic) — nao usamos mais.
for (const old of ["pt.aff", "pt.dic"]) {
  const p = path.join(DEST_DIR, old);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`[spellcheck] removido (legacy): ${old}`);
  }
}
