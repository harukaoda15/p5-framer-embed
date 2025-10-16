let sourceImage = null;
let resultImage = null;
let seed = 1;
let lastRegenMs = 0;
let regenIntervalMs = 140; // アニメーションの再生成間隔(ms)
let tMotion = 0; // パラメータ揺らぎ用の時間
let wobbleEnabled = true; // 揺らぎON/OFF（既定はON）
let debugEnabled = false; // デバッグオーバレイ
let debugDiv = null; // DOMオーバレイ（p5非依存）
let fixedCanvasSize = null; // {w,h} 指定時に固定
const SETTINGS_KEY = "p5glitch-settings-v1";
const ASSETS_DIR = "assets/inputs/"; // 外部読み込みディレクトリ
let preBlurBase = 0.90; // スライダ基準値（揺らぎの中心）
const LAST_IMG_KEY = "p5glitch-last-img";
// ぼかし揺れの強さ・速度（URLで上書き可）
let WOBBLE_BLUR_AMP = 1.2;   // 振幅（派手め）
let WOBBLE_BLUR_SPEED = 1.5; // 速度（やや速め）

const params = {
  blockCount: 260,     // (グリッド塗りでは未使用)
  gridSize: 4,         // グリッドの一辺サイズ(px)
  gridGap: 2,          // グリッドの隙間(px)
  preBlur: 0.90,       // サンプリング前のぼかし強度(0で無効)
  streakCount: 80,     // 速度線(横長の細い線)の本数（控えめ）
  streakMaxLen: 0.65,  // 速度線の最大長さ(幅に対する比率)
  streakThickness: 20  // 速度線の太さ(px) 最大
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
  const initialW = fixedCanvasSize ? fixedCanvasSize.w : Math.min(window.innerWidth - 16, 1280);
  const initialH = fixedCanvasSize ? fixedCanvasSize.h : Math.min(window.innerHeight - 80, 800);
  const c = createCanvas(initialW, initialH);
  c.parent(parent);
  pixelDensity(1);
  frameRate(60);
  background(20); // #141414 背景
  drawHint();

  // UIは非表示化。保存済み設定の適用は残す（URL上書きや起動体験のため）
  applySavedSettings();

  // URLパラメータ処理（?img=, ?wobble=1）
  const qs = new URLSearchParams(window.location.search);
  const qsImg = qs.get('img');
  const qsWobble = qs.get('wobble');
  debugEnabled = qs.has('debug');
  const qsCW = qs.get('cw');
  const qsCH = qs.get('ch');
  if (qsCW && qsCH) {
    const w = Math.max(1, Math.floor(Number(qsCW)));
    const h = Math.max(1, Math.floor(Number(qsCH)));
    fixedCanvasSize = { w, h };
  }
  // パラメータ上書き（スライダ同名キー）
  const qsOverrides = {
    blocks: qs.get('blocks'),
    streaks: qs.get('streaks'),
    streakLen: qs.get('streakLen'),
    streakThick: qs.get('streakThick'),
    blockMax: qs.get('blockMax'),
    gridGap: qs.get('gridGap'),
    preBlur: qs.get('preBlur'),
    bias: qs.get('bias')
  };
  // ぼかし揺れのURL指定
  const qsBlurAmp = qs.get('blurAmp');
  const qsBlurSpeed = qs.get('blurSpeed');
  if (qsBlurAmp !== null && qsBlurAmp !== undefined) WOBBLE_BLUR_AMP = Number(qsBlurAmp);
  if (qsBlurSpeed !== null && qsBlurSpeed !== undefined) WOBBLE_BLUR_SPEED = Number(qsBlurSpeed);
  Object.entries(qsOverrides).forEach(([id, val]) => {
    if (val === null || val === undefined) return;
    const strVal = String(val);
    // まず内部パラメータに適用
    switch (id) {
      case 'blocks': params.blockCount = Number(strVal); break;
      case 'streaks': params.streakCount = Number(strVal); break;
      case 'streakLen': params.streakMaxLen = Number(strVal); break;
      case 'streakThick': params.streakThickness = Number(strVal); break;
      case 'blockMax': params.gridSize = Number(strVal); break;
      case 'gridGap': params.gridGap = Number(strVal); break;
      case 'preBlur': params.preBlur = Number(strVal); preBlurBase = params.preBlur; break;
      case 'bias': LUMA_GAMMA = Number(strVal); break;
    }
    // UIが存在する場合のみ同期（埋め込みでは通常存在しない）
    const el = document.getElementById(id);
    if (el) el.value = strVal;
    const valEl = document.getElementById(id + "Val");
    if (valEl) valEl.textContent = strVal;
  });
  if (qsWobble !== null) {
    wobbleEnabled = qsWobble === '1' || qsWobble === 'true';
  }

  const reseedEl = document.getElementById("reseed");
  if (reseedEl) {
    reseedEl.addEventListener("click", () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      if (sourceImage) generateBlocks(), redraw();
    });
  }

  const downloadEl = document.getElementById("download");
  if (downloadEl) {
    downloadEl.addEventListener("click", () => {
      if (!resultImage) return;
      image(resultImage, (width - resultImage.width) / 2, (height - resultImage.height) / 2);
      saveCanvas("glitch-6colors", "png");
      if (sourceImage) redraw();
    });
  }

  // UIトグルは削除（Framer表示用）

  // 開始直後にプレースホルダー画像を生成して表示（ファイル未選択でも動く）
  if (!sourceImage) {
    sourceImage = createPlaceholderImage(Math.max(640, width), Math.max(360, height));
    fitCanvasToImage(sourceImage);
    generateBlocks();
  }

  // 外部画像読み込み（assets/inputs 配下）: 候補を順に試行（非同期失敗時は次へ）
  const loadFromCandidates = (names) => {
    const list = names.filter(Boolean);
    const attempt = (idx) => {
      if (idx >= list.length) return;
      const name = list[idx];
      const path = ASSETS_DIR + name + "?v=" + Date.now();
      console.log("try load:", path);
      loadImage(path, img => {
        sourceImage = img;
        fitCanvasToImage(img);
        generateBlocks();
        saveSetting(LAST_IMG_KEY, name);
      }, (err) => {
        console.warn('Failed to load image:', path, err);
        attempt(idx + 1);
      });
    };
    attempt(0);
  };

  if (qsImg) {
    loadFromCandidates([qsImg]);
  } else {
    const last = loadSetting(LAST_IMG_KEY);
    loadFromCandidates([
      last,
      "kv.png", "kv.jpg", "kv.jpeg", "kv.webp",
      "default.png", "default.jpg", "default.jpeg", "default.webp"
    ]);
  }

  // キー操作で揺らぎON/OFF（Wキ－）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') {
      wobbleEnabled = !wobbleEnabled;
      if (!wobbleEnabled) {
        params.preBlur = preBlurBase;
        if (sourceImage) { generateBlocks(); }
      }
    }
  });

  // デバッグDOMオーバレイ（生DOMで確実に表示）
  if (debugEnabled) {
    debugDiv = document.createElement('div');
    debugDiv.id = 'debugOverlay';
    Object.assign(debugDiv.style, {
      position: 'fixed', top: '8px', left: '8px', padding: '8px 10px',
      background: 'rgba(0,0,0,0.75)', color: '#fff',
      font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
      zIndex: '9999', pointerEvents: 'none', whiteSpace: 'pre-line',
      borderRadius: '6px'
    });
    document.body.appendChild(debugDiv);
  }
}

function bindSlider(id, onChange) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(id + "Val");
  if (valEl) valEl.textContent = String(el.value);
  el.addEventListener("input", () => {
    onChange(el.value);
    if (valEl) valEl.textContent = String(el.value);
    if (sourceImage) generateBlocks(), redraw();
    saveSetting(id, el.value);
  });
}

function windowResized() {
  if (!sourceImage) return;
  if (fixedCanvasSize) {
    resizeCanvas(fixedCanvasSize.w, fixedCanvasSize.h);
  } else {
    fitCanvasToImage(sourceImage);
  }
  generateBlocks();
  redraw();
}

function draw() {
  background(20); // #141414
  maybeRegenerate();
  applyMotionWobble();
  if (resultImage) {
    const x = (width - resultImage.width) / 2;
    const y = (height - resultImage.height) / 2;
    image(resultImage, x, y);
  } else {
    drawHint();
  }
  if (debugEnabled) drawDebug();
  if (debugEnabled && debugDiv) {
    const lines = [
      `canvas: ${width}x${height}`,
      `gridSize(px): ${Math.floor(params.gridSize)} / gap: ${Math.floor(params.gridGap)}`,
      `preBlur(base): ${preBlurBase.toFixed(2)} wobble: ${wobbleEnabled ? 'on' : 'off'}`,
    ];
    debugDiv.innerHTML = lines.join('<br/>');
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

function drawDebug() {
  push();
  noStroke();
  fill(0, 180);
  rect(8, 8, 280, 70, 6);
  fill(255);
  textAlign(LEFT, TOP);
  textSize(12);
  const lines = [
    `canvas: ${width}x${height}`,
    `gridSize(px): ${Math.floor(params.gridSize)} / gap: ${Math.floor(params.gridGap)}`,
    `preBlur(base): ${preBlurBase.toFixed(2)} wobble: ${wobbleEnabled ? 'on' : 'off'}`,
  ];
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], 16, 14 + i * 18);
  }
  pop();
}

function fitCanvasToImage(img) {
  // 画面を優先してキャンバスサイズを決定（画像比率に縛られない）
  if (fixedCanvasSize) {
    resizeCanvas(fixedCanvasSize.w, fixedCanvasSize.h);
  } else {
    const maxW = Math.max(1, Math.floor(window.innerWidth));
    const maxH = Math.max(1, Math.floor(window.innerHeight));
    resizeCanvas(maxW, maxH);
  }
}

// 画像の色味から: 長方形/正方形ブロック + 横長の速度線（6色量子化 + 灰抑制）
function generateBlocks() {
  if (!sourceImage) return;

  // cover描画（中央トリミング）でベース画像を生成
  const base = createGraphics(width, height);
  base.pixelDensity(1);
  const imgW = sourceImage.width;
  const imgH = sourceImage.height;
  const scale = Math.max(width / imgW, height / imgH);
  const srcW = Math.floor(width / scale);
  const srcH = Math.floor(height / scale);
  const srcX = Math.floor((imgW - srcW) / 2);
  const srcY = Math.floor((imgH - srcH) / 2);
  base.image(sourceImage, 0, 0, width, height, srcX, srcY, srcW, srcH);
  if (params.preBlur > 0) {
    base.filter(BLUR, params.preBlur);
  }

  const pg = createGraphics(base.width, base.height);
  pg.pixelDensity(1);
  pg.background(20); // #141414 背景

  randomSeed(seed);

  // 2) グリッドに揃えた正方形（平均サンプリング + 隙間）
  let topmostRect = null;
  const gs = Math.max(2, Math.floor(params.gridSize));
  const gap = Math.max(0, Math.floor(params.gridGap));
  const cols = Math.ceil(pg.width / gs);
  const rows = Math.ceil(pg.height / gs);

  // 低解像度へ縮小して平均色を取得
  const sampler = createGraphics(cols, rows);
  sampler.pixelDensity(1);
  sampler.image(base, 0, 0, cols, rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * gs;
      const y0 = row * gs;

      const rx = x0 + Math.floor(gap / 2);
      const ry = y0 + Math.floor(gap / 2);
      const rw = Math.max(1, Math.min(gs - gap, pg.width - rx));
      const rh = Math.max(1, Math.min(gs - gap, pg.height - ry));

      const col4 = sampler.get(col, row);
      const tone = quantizeToSix(col4);

      pg.noStroke();
      pg.fill(tone[0], tone[1], tone[2], 255);
      pg.rect(rx, ry, rw, rh);

      if (!topmostRect || ry < topmostRect.y) {
        topmostRect = { x: rx, y: ry, w: rw, h: rh };
      }
    }
  }

  // 3) 一番上の四角は必ず純白（従来通り）
  if (topmostRect) {
    pg.noStroke();
    pg.fill(COL_FFFFFF);
    pg.rect(topmostRect.x, topmostRect.y, topmostRect.w, topmostRect.h);
  }

  // 4) 速度線（従来順に戻す: 先に線→後でグリッドだった状態へ）
  //    ただし見た目再現のため、ここでは最初期の描画順に戻します
  for (let i = 0; i < params.streakCount; i++) {
    const y = Math.floor(random(pg.height));
    const len = Math.floor(random(pg.width * 0.1, pg.width * params.streakMaxLen));
    const x = Math.floor(random(-Math.floor(len * 0.1), pg.width - Math.floor(len * 0.9)));
    const h = Math.max(1, Math.floor(params.streakThickness));

    const sx = constrain(x + Math.floor(len * random(0.15, 0.85)), 0, pg.width - 1);
    const sy = constrain(y, 0, pg.height - 1);
    const col = quantizeToSix(base.get(sx, sy));

    pg.noStroke();
    pg.fill(col[0], col[1], col[2], 255);
    pg.rect(x, y, len, h);
  }

  resultImage = pg.get();
}

function maybeRegenerate() {
  if (!sourceImage) return;
  const now = millis();
  if (!resultImage) {
    generateBlocks();
    lastRegenMs = now;
    return;
  }
  if (now - lastRegenMs >= regenIntervalMs) {
    // ぼかし値の変化のみで再描画
    generateBlocks();
    lastRegenMs = now;
  }
}

function applyMotionWobble() {
  if (!sourceImage) return;
  if (!wobbleEnabled) return;
  // 経過時間（秒）をベースに、ぼかしのみを微小に上下させる
  tMotion += deltaTime / 1000;
  const amp = WOBBLE_BLUR_AMP;       // 上下幅
  const speed = WOBBLE_BLUR_SPEED;   // 速度
  const v = preBlurBase + amp * sin(tMotion * speed);
  params.preBlur = constrain(v, 0, 4);
}

function createPlaceholderImage(w, h) {
  const pg = createGraphics(w, h);
  pg.pixelDensity(1);
  // ベース: ダーク背景 + 斜めグラデーション
  pg.background(24);
  pg.noStroke();
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const g = 40 + Math.floor(160 * t);
    pg.fill(g);
    pg.rect(-w * 0.2 + i * (w / 16), -h * 0.1 + i * 4, w / 16 + 8, h * 1.2);
  }

  // ノイズ矩形を散らす
  for (let i = 0; i < 280; i++) {
    const rw = Math.floor(random(8, 64));
    const rh = Math.floor(random(2, 24));
    const x = Math.floor(random(-16, w + 16));
    const y = Math.floor(random(-16, h + 16));
    const g = Math.floor(random(80, 230));
    pg.fill(g, 200);
    pg.rect(x, y, rw, rh);
  }

  // 明部のアクセント
  for (let i = 0; i < 5; i++) {
    const x = random(w);
    const y = random(h);
    const r = random(60, 180);
    pg.fill(255, 30);
    pg.ellipse(x, y, r, r);
  }
  return pg.get();
}

function applySavedSettings() {
  const s = loadSettings();
  const setIf = (id, applyFn) => {
    if (s[id] !== undefined) {
      const el = document.getElementById(id);
      if (el) el.value = String(s[id]);
      applyFn(String(s[id]));
    }
  };
  setIf("blocks", v => (params.blockCount = Number(v)));
  setIf("streaks", v => (params.streakCount = Number(v)));
  setIf("streakLen", v => (params.streakMaxLen = Number(v)));
  setIf("streakThick", v => (params.streakThickness = Number(v)));
  setIf("blockMax", v => (params.gridSize = Number(v)));
  setIf("gridGap", v => (params.gridGap = Number(v)));
  setIf("preBlur", v => { params.preBlur = Number(v); preBlurBase = params.preBlur; });
  setIf("bias", v => (LUMA_GAMMA = Number(v)));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveSetting(key, value) {
  try {
    const s = loadSettings();
    s[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {
    // ignore
  }
}

function loadSetting(key) {
  try {
    const s = loadSettings();
    return s[key];
  } catch (_) {
    return undefined;
  }
}
