import { readFileSync } from "node:fs";

/**
 * Auditoria de contraste dos temas, direto do globals.css.
 *
 * Os temas são tokens CSS e cada um sobrescreve só uma parte do `:root`, o
 * que torna fácil um ajuste isolado derrubar um par que ninguém mede. Aqui
 * a conta é a da WCAG 2.1 (luminância relativa), sobre os pares que de fato
 * aparecem na interface.
 */

function blocks(source) {
  // Comentários saem antes de qualquer coisa: um `/* … */` acima de um
  // bloco gruda no seletor e o tema passa despercebido — foi assim que
  // `noir` e `amanhecer` ficaram fora da conta na primeira versão.
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  // O seletor não pode conter `;` nem `@`: sem isso a captura atravessa as
  // linhas `@tailwind …;` do topo e o bloco `:root` das cores deixa de ser
  // reconhecido — todo token herdado dele sairia da medição sem avisar.
  const re = /([^{};@\n][^{};]*?)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

function declarations(body) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].trim();
  return out;
}

/** `{ base, themes }` lidos do arquivo de estilos. */
export function readThemes(path = "src/styles/globals.css") {
  const css = readFileSync(path, "utf8");
  const base = {};
  const themes = new Map();

  for (const { selector, body } of blocks(css)) {
    const vars = declarations(body);
    if (Object.keys(vars).length === 0) continue;
    for (const name of selector.split(",").map((s) => s.trim())) {
      if (name === ":root") Object.assign(base, vars);
      const match = name.match(/^\[data-paper="([^"]+)"\]$/);
      if (!match) continue;
      if (!themes.has(match[1])) themes.set(match[1], {});
      Object.assign(themes.get(match[1]), vars);
    }
  }
  // O tema claro é o próprio `:root`, sem sobrescritas.
  themes.set("claro", {});
  return { base, themes };
}

function parseColor(value, scope, base) {
  if (!value) return null;
  const v = String(value).trim();
  const ref = v.match(/^var\((--[\w-]+)/);
  if (ref) return parseColor(scope[ref[1]] ?? base[ref[1]], scope, base);

  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = v.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i,
  );
  if (m) {
    return {
      rgb: [+m[1], +m[2], +m[3]],
      a: m[4] === undefined ? 1 : +m[4],
    };
  }
  return null;
}

function luminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Cor com alfa composta sobre um fundo opaco. */
function flatten(fg, bg) {
  if (fg.a >= 1) return fg.rgb;
  return fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a));
}

export function contrast(fg, bg) {
  const a = luminance(flatten(fg, bg));
  const b = luminance(bg.rgb);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pares medidos e o piso de cada um.
 *
 * 4.5 é o mínimo AA para texto. `--text-placeholder` e os tokens de
 * componente ficam em 3: o placeholder nunca é a única pista (todo campo
 * tem rótulo visível) e `--border-strong` é elemento de interface, coberto
 * pelo 1.4.11 e não pelo 1.4.3.
 */
export const PAIRS = [
  ["--text-primary", "--bg-app", 4.5],
  ["--text-primary", "--bg-panel", 4.5],
  ["--text-primary", "--bg-panel-2", 4.5],
  ["--text-primary", "--bg-hover", 4.5],
  ["--text-primary", "--bg-selected", 4.5],
  ["--text-secondary", "--bg-panel", 4.5],
  ["--text-secondary", "--bg-app", 4.5],
  ["--text-muted", "--bg-panel", 4.5],
  ["--text-muted", "--bg-panel-2", 4.5],
  ["--text-placeholder", "--bg-panel", 3],
  ["--accent", "--bg-panel", 3],
  ["--accent", "--bg-app", 3],
  ["--text-inverse", "--bg-inverse", 4.5],
  ["--text-inverse", "--accent", 4.5],
  ["--text-inverse", "--danger", 4.5],
  ["--danger", "--bg-panel", 3],
  ["--success", "--bg-panel", 3],
  ["--border-strong", "--bg-panel", 3],
  ["--editor-paper-text", "--editor-paper-bg", 4.5],
  // A paleta dos cards é por tema; a tinta precisa servir aos seis fundos.
  ["--card-ink", "--card-1", 4.5],
  ["--card-ink", "--card-2", 4.5],
  ["--card-ink", "--card-3", 4.5],
  ["--card-ink", "--card-4", 4.5],
  ["--card-ink", "--card-5", 4.5],
  ["--card-ink", "--card-6", 4.5],
];

/** Lista de reprovações; vazia quando todos os temas passam. */
export function auditThemes(path) {
  const { base, themes } = readThemes(path);
  const failures = [];
  for (const [theme, overrides] of themes) {
    const scope = { ...base, ...overrides };
    for (const [fgName, bgName, min] of PAIRS) {
      const fg = parseColor(scope[fgName], scope, base);
      const bg = parseColor(scope[bgName], scope, base);
      if (!fg || !bg) continue;
      const ratio = contrast(fg, bg);
      if (ratio < min) {
        failures.push({ theme, fgName, bgName, min, ratio: +ratio.toFixed(2) });
      }
    }
  }
  return failures;
}
