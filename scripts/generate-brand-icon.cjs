/**
 * Gera o source-of-truth do icone nativo (`src-tauri/app-icon.png`).
 *
 * Visual: o mesmo mark usado na UI (card claro + pena cobre), mas com
 * menos margem externa para aparecer maior na taskbar e no Explorer.
 */
const path = require("node:path");
const Jimp = require("jimp");

const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "src-tauri", "app-icon.png");
const SIZE = 1024;
const SCALE = 4;

const rgba = Jimp.rgbaToInt;
const transparent = rgba(0, 0, 0, 0);
const paper = rgba(239, 233, 222, 255);
const paperLight = rgba(248, 244, 236, 255);
const border = rgba(213, 204, 190, 255);
const ink = rgba(160, 120, 80, 255);
const inkSoft = rgba(160, 120, 80, 90);
const shadow = rgba(30, 28, 25, 35);

function putSafe(img, x, y, color) {
  if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) return;
  img.setPixelColor(color, x, y);
}

function circle(img, cx, cy, r, color) {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  const r2 = r * r;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) putSafe(img, x, y, color);
    }
  }
}

function thickLine(img, x0, y0, x1, y1, width, color) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (width * 0.35)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    circle(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color);
  }
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}

function bezier(img, p0, p1, p2, p3, width, color) {
  let prev = p0;
  for (let i = 1; i <= 96; i += 1) {
    const t = i / 96;
    const next = {
      x: cubicPoint(p0.x, p1.x, p2.x, p3.x, t),
      y: cubicPoint(p0.y, p1.y, p2.y, p3.y, t),
    };
    thickLine(img, prev.x, prev.y, next.x, next.y, width, color);
    prev = next;
  }
}

function roundedRect(img, x, y, w, h, r, color) {
  const x2 = x + w;
  const y2 = y + h;
  for (let yy = y; yy < y2; yy += 1) {
    for (let xx = x; xx < x2; xx += 1) {
      const cx = xx < x + r ? x + r : xx >= x2 - r ? x2 - r - 1 : xx;
      const cy = yy < y + r ? y + r : yy >= y2 - r ? y2 - r - 1 : yy;
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) putSafe(img, xx, yy, color);
    }
  }
}

function drawIcon(img) {
  const s = SCALE;
  const S = (v) => Math.round(v * s);

  roundedRect(img, S(38), S(54), S(948), S(948), S(76), shadow);
  roundedRect(img, S(14), S(14), S(996), S(996), S(74), paper);
  roundedRect(img, S(34), S(34), S(956), S(956), S(62), paperLight);

  // Borda em duas passadas para ficar macia depois do downscale.
  roundedRect(img, S(14), S(14), S(996), S(996), S(74), border);
  roundedRect(img, S(30), S(30), S(964), S(964), S(64), paper);
  roundedRect(img, S(52), S(52), S(920), S(920), S(52), paperLight);

  // Pena inspirada no mark da UI.
  bezier(
    img,
    { x: S(800), y: S(198) },
    { x: S(626), y: S(154) },
    { x: S(334), y: S(314) },
    { x: S(194), y: S(592) },
    S(44),
    ink,
  );
  bezier(
    img,
    { x: S(800), y: S(198) },
    { x: S(832), y: S(486) },
    { x: S(610), y: S(846) },
    { x: S(210), y: S(824) },
    S(44),
    ink,
  );
  thickLine(img, S(188), S(834), S(782), S(230), S(42), ink);
  thickLine(img, S(412), S(628), S(642), S(628), S(34), ink);
  thickLine(img, S(500), S(526), S(706), S(448), S(28), inkSoft);
  thickLine(img, S(284), S(756), S(492), S(710), S(28), inkSoft);
}

(async () => {
  const large = new Jimp(SIZE * SCALE, SIZE * SCALE, transparent);
  drawIcon(large);
  large.resize(SIZE, SIZE, Jimp.RESIZE_BICUBIC);
  await large.writeAsync(DEST);
  console.log(`[brand-icon] gerado: ${DEST}`);
})();
