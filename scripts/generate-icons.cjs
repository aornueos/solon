/**
 * Gera os 16 PNGs + .ico + .icns a partir de `src-tauri/app-icon.png`,
 * **preservando alpha em TUDO**.
 *
 * Por que nao usar `npx tauri icon` (cli builtin)? Ele compoe a
 * transparencia sobre branco nos Square*Logo (Windows Store/MSIX) — o
 * resultado fica com fundo branco sólido, ignorando o que o user tinha
 * em transparente. Pra um app desktop com window decorations escuras
 * ou em tema escuro, o ícone fica feio.
 *
 * Aqui usamos jimp (pure JS, sem deps nativas tipo node-gyp) pra resize
 * preservando alpha, e png2icons pra montar .ico/.icns multi-tamanho.
 *
 * Uso:
 *   npm run icons
 *
 * Reroda quando trocar `src-tauri/app-icon.png`. NAO faz parte do
 * postinstall — ícones nao mudam toda hora, e o source-of-truth e' o
 * próprio app-icon.png commitado no repo.
 */
const path = require("node:path");
const fs = require("node:fs");
const Jimp = require("jimp");
const png2icons = require("png2icons");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src-tauri", "app-icon.png");
const ICONS_DIR = path.join(ROOT, "src-tauri", "icons");

// Tamanhos esperados pela Tauri config + Windows MSIX/Store manifest.
// Square*Logo sao os tiles do Windows; tamanhos sao MANDATORIOS — se
// errar 1px o packaging do MSIX rejeita.
const PNG_TARGETS = [
  // App icon principal — 1024x1024 e' o source pros .ico/.icns abaixo.
  { file: "icon.png", size: 1024 },
  { file: "32x32.png", size: 32 },
  { file: "64x64.png", size: 64 },
  { file: "128x128.png", size: 128 },
  { file: "128x128@2x.png", size: 256 },
  // Windows Store / MSIX
  { file: "StoreLogo.png", size: 50 },
  { file: "Square30x30Logo.png", size: 30 },
  { file: "Square44x44Logo.png", size: 44 },
  { file: "Square71x71Logo.png", size: 71 },
  { file: "Square89x89Logo.png", size: 89 },
  { file: "Square107x107Logo.png", size: 107 },
  { file: "Square142x142Logo.png", size: 142 },
  { file: "Square150x150Logo.png", size: 150 },
  { file: "Square284x284Logo.png", size: 284 },
  { file: "Square310x310Logo.png", size: 310 },
];

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`[icons] source nao encontrado: ${SRC}`);
    process.exit(1);
  }

  fs.mkdirSync(ICONS_DIR, { recursive: true });

  // Le o source UMA vez. Jimp parseia o PNG e mantem o canal alpha.
  // Pra cada target, clonamos o objeto e dimensionamos — clone permite
  // resize independente sem afetar o source carregado.
  const src = await Jimp.read(SRC);
  const sourceHasAlpha = src.hasAlpha();
  console.log(
    `[icons] source: ${src.bitmap.width}x${src.bitmap.height}, alpha=${sourceHasAlpha}`,
  );

  // Se o source veio sem canal alpha (color type 2 = RGB), aplicamos
  // chroma key: pixels brancos viram transparentes. Funciona bem pra
  // logos com fundo branco solido (caso do app-icon.png da Solon).
  // Threshold conservador (250) pra preservar anti-aliasing de bordas
  // — pixels quase-brancos ficam parcialmente transparentes via gradient.
  if (!sourceHasAlpha) {
    console.log("[icons] source sem alpha → aplicando chroma key (branco → transparente)");
    let removed = 0;
    let total = src.bitmap.width * src.bitmap.height;
    src.scan(0, 0, src.bitmap.width, src.bitmap.height, function (_x, _y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      // Quao "branco" e' o pixel? 255 = totalmente branco, 0 = preto.
      const whiteness = Math.min(r, g, b);
      if (whiteness >= 250) {
        // Branco puro → totalmente transparente
        this.bitmap.data[idx + 3] = 0;
        removed++;
      } else if (whiteness >= 220) {
        // Quase branco (anti-alias da borda) → alpha proporcional.
        // 220→opacity 50%, 250→opacity 0%. Suaviza serrilhado.
        const alpha = Math.round(((250 - whiteness) / 30) * 255);
        this.bitmap.data[idx + 3] = alpha;
      }
      // < 220: pixel "real" do logo, mantem alpha=255 (default).
    });
    const pct = ((removed / total) * 100).toFixed(1);
    console.log(`[icons] ${removed.toLocaleString("pt-BR")} pixels (${pct}%) → transparentes`);
  }

  for (const { file, size } of PNG_TARGETS) {
    const dest = path.join(ICONS_DIR, file);
    // BICUBIC e' o melhor balanco qualidade/tempo pra fotos ou
    // ilustracoes com bordas curvas (caso do nosso S em moldura).
    const clone = src.clone();
    clone.resize(size, size, Jimp.RESIZE_BICUBIC);
    await clone.writeAsync(dest);
    const sizeKB = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`  ✓ ${file} (${size}x${size}, ${sizeKB} KB)`);
  }

  // .ico (Windows) + .icns (macOS) — png2icons gera os sub-tamanhos
  // internos a partir de um PNG fonte. Usamos o icon.png (1024x1024)
  // que acabamos de gerar com alpha.
  console.log("\n[icons] gerando containers multi-resolucao…");
  const baseBuf = fs.readFileSync(path.join(ICONS_DIR, "icon.png"));

  const icoBuf = png2icons.createICO(
    baseBuf,
    png2icons.BICUBIC,
    0, // numOfColors=0 = max (preserva alpha de 8-bit)
    false, // useRaw=false → comprime via PNG (alpha preservado)
    true, // forcePngInIco — TRUE = embute PNGs ao inves de BMPs (alpha funciona)
  );
  if (icoBuf) {
    const dest = path.join(ICONS_DIR, "icon.ico");
    fs.writeFileSync(dest, icoBuf);
    const sizeKB = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`  ✓ icon.ico (multi-tamanho, ${sizeKB} KB)`);
  } else {
    console.warn("  ✗ icon.ico falhou");
  }

  const icnsBuf = png2icons.createICNS(baseBuf, png2icons.BICUBIC, 0);
  if (icnsBuf) {
    const dest = path.join(ICONS_DIR, "icon.icns");
    fs.writeFileSync(dest, icnsBuf);
    const sizeKB = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`  ✓ icon.icns (multi-tamanho, ${sizeKB} KB)`);
  } else {
    console.warn("  ✗ icon.icns falhou");
  }

  console.log("\n[icons] concluido. Rebuild Tauri pra picar os novos icones.");
})();
