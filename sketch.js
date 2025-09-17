let sourceImage = null;
let resultImage = null;
let seed = 1;

const params = {
  blockCount: 260,     // 長方形/正方形ブロックの数
  blockMax: 90,        // ブロックの最大サイズ(px)
  streakCount: 180,    // 速度線(横長の細い線)の本数
  streakMaxLen: 0.65,  // 速度線の最大長さ(幅に対する比率)
  streakThickness: 4   // 速度線の太さ(px)
};

// 6色パレット（暗→明）
const COL_141414 = [20, 20, 20, 255];      // #141414 (black)
const COL_4D4D4D = [77, 77, 77, 255];      // #4d4d4d
const COL_636363 = [99, 99, 99, 255];      // #636363
const COL_C0C0C0 = [192, 192, 192, 255];   // #c0c0c0
const COL_EAEAEA = [234, 234, 234, 255];   // #eaeaea
const COL_FFFFFF = [255, 255, 255, 255];   // #ffffff

// 白の割合をさらに増やす: ガンマを強め、グレー帯域を圧縮
let LUMA_GAMMA = 0.60; // 小さいほど白方向に寄る（UIスライダで変更可能）
// 0..255 輝度に対する境界（グレー狭め、白広め）
const THRESHOLDS = [22, 60, 90, 135, 195];

// グレー抑制: 灰を白/黒へ寄せる確率
const P_LIGHTGRAY_TO_WHITE = 0.80; // EAEAEA -> 白
const P_MIDGRAY_TO_WHITE   = 0.65; // C0C0C0 -> 白
const P_DARKGRAY_TO_BLACK  = 0.70; // 636363/4D4D4D -> 黒

function quantizeToSix(col) {
  const [r, g, b] = col;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
  const lb = Math.pow(l / 255, LUMA_GAMMA) * 255; // 白寄りにバイアス

  // まずは帯域で色を決定
  let tone;
  if (lb < THRESHOLDS[0]) tone = COL_141414;
  else if (lb < THRESHOLDS[1]) tone = COL_4D4D4D;
  else if (lb < THRESHOLDS[2]) tone = COL_636363;
  else if (lb < THRESHOLDS[3]) tone = COL_C0C0C0;
  else if (lb < THRESHOLDS[4]) tone = COL_EAEAEA;
  else tone = COL_FFFFFF;

  // 次にグレー抑制を適用（白/黒を増やす）
  if (tone === COL_EAEAEA && random() < P_LIGHTGRAY_TO_WHITE) return COL_FFFFFF;
  if (tone === COL_C0C0C0 && random() < P_MIDGRAY_TO_WHITE)   return COL_FFFFFF;
  if ((tone === COL_636363 || tone === COL_4D4D4D) && random() < P_DARKGRAY_TO_BLACK) return COL_141414;

  return tone;
}

function setup() {
  const parent = document.getElementById("stage");
  const w = Math.min(window.innerWidth - 16, 1280);
  const h = Math.min(window.innerHeight - 80, 800);
  const c = createCanvas(w, h);
  c.parent(parent);
  pixelDensity(1);
  noLoop();
  background(20); // #141414 背景
  drawHint();

  // UI
  document.getElementById("file").addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadImage(reader.result, img => {
        sourceImage = img;
        fitCanvasToImage(img);
        generateBlocks();
        redraw();
      });
    };
    reader.readAsDataURL(file);
  });

  bindSlider("blocks", v => (params.blockCount = Number(v)));
  bindSlider("streaks", v => (params.streakCount = Number(v)));
  bindSlider("streakLen", v => (params.streakMaxLen = Number(v)));
  bindSlider("streakThick", v => (params.streakThickness = Number(v)));
  bindSlider("blockMax", v => (params.blockMax = Number(v)));

  const biasEl = document.getElementById("bias");
  if (biasEl) {
    biasEl.value = String(LUMA_GAMMA);
    biasEl.addEventListener("input", () => {
      LUMA_GAMMA = Number(biasEl.value);
      if (sourceImage) { generateBlocks(); redraw(); }
    });
  }

  document.getElementById("reseed").addEventListener("click", () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    if (sourceImage) generateBlocks(), redraw();
  });

  document.getElementById("download").addEventListener("click", () => {
    if (!resultImage) return;
    image(resultImage, (width - resultImage.width) / 2, (height - resultImage.height) / 2);
    saveCanvas("glitch-6colors", "png");
    if (sourceImage) redraw();
  });
}

function bindSlider(id, onChange) {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    onChange(el.value);
    if (sourceImage) generateBlocks(), redraw();
  });
}

function windowResized() {
  if (!sourceImage) return;
  fitCanvasToImage(sourceImage);
  generateBlocks();
  redraw();
}

function draw() {
  background(20); // #141414
  if (resultImage) {
    const x = (width - resultImage.width) / 2;
    const y = (height - resultImage.height) / 2;
    image(resultImage, x, y);
  } else {
    drawHint();
  }
}

function drawHint() {
  push();
  noStroke();
  fill(234); // 明るめで見やすく
  textAlign(CENTER, CENTER);
  textSize(16);
  text("白と黒を優先。灰は自動で白/黒へ寄せます\n‘白寄せ’でさらに調整可", width / 2, height / 2);
  pop();
}

function fitCanvasToImage(img) {
  const maxW = Math.min(window.innerWidth - 16, 1600);
  const maxH = Math.min(window.innerHeight - 80, 1000);
  const scale = Math.min(maxW / img.width, maxH / img.height);
  resizeCanvas(Math.floor(img.width * scale), Math.floor(img.height * scale));
}

// 画像の色味から: 長方形/正方形ブロック + 横長の速度線（6色量子化 + 灰抑制）
function generateBlocks() {
  if (!sourceImage) return;

  const base = sourceImage.get();
  base.resize(width, height);

  const pg = createGraphics(base.width, base.height);
  pg.pixelDensity(1);
  pg.background(20); // #141414 背景

  randomSeed(seed);

  // 1) 速度線（横長、細い長方形）
  for (let i = 0; i < params.streakCount; i++) {
    const y = Math.floor(random(pg.height));
    const len = Math.floor(random(pg.width * 0.1, pg.width * params.streakMaxLen));
    const x = Math.floor(random(-Math.floor(len * 0.1), pg.width - Math.floor(len * 0.9)));
    const h = Math.max(1, Math.floor(random(params.streakThickness - 1, params.streakThickness + 2)));

    const sx = constrain(x + Math.floor(len * random(0.15, 0.85)), 0, pg.width - 1);
    const sy = constrain(y, 0, pg.height - 1);
    const col = quantizeToSix(base.get(sx, sy));

    pg.noStroke();
    pg.fill(col[0], col[1], col[2], 255);
    pg.rect(x, y, len, h);
  }

  // 2) ブロック（長方形／正方形）
  let topmostRect = null;
  for (let i = 0; i < params.blockCount; i++) {
    const bw = Math.floor(random(8, params.blockMax));
    const bh = Math.floor(random(8, params.blockMax));
    const x = Math.floor(random(0, pg.width - bw));
    const y = Math.floor(random(0, pg.height - bh));

    const sx = constrain(x + Math.floor(bw / 2), 0, pg.width - 1);
    const sy = constrain(y + Math.floor(bh / 2), 0, pg.height - 1);
    const col = quantizeToSix(base.get(sx, sy));

    pg.noStroke();
    pg.fill(col[0], col[1], col[2], 255);
    pg.rect(x, y, bw, bh);

    if (!topmostRect || y < topmostRect.y || (y === topmostRect.y && bh >= topmostRect.h)) {
      topmostRect = { x, y, w: bw, h: bh };
    }
  }

  // 一番上の四角は必ず純白
  if (topmostRect) {
    pg.noStroke();
    pg.fill(COL_FFFFFF);
    pg.rect(topmostRect.x, topmostRect.y, topmostRect.w, topmostRect.h);
  }

  resultImage = pg.get();
}
