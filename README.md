# p5-glitch

ローカルで開くだけで動く簡単な p5.js グリッチツールです。

## 使い方
1. `index.html` をブラウザで開く（Chrome 推奨）。
2. Framer 埋め込み用：`assets/inputs/` に画像ファイルを置き、URL に `?img=ファイル名` を付けてアクセスします。
   - PNG 優先（完全一致を重視）。WebPは任意
   - 例: `http://localhost:5173/?img=kv.png`
   - 揺らぎ（微小アニメ）は既定OFF。`?wobble=1` でON、`W` キーでトグル。
3. スライダーの位置はローカルに保存され、次回起動時の初期値になります。
4. 「ランダム化」でパターンを変更。「保存（PNG）」で書き出し。

インターネット接続が必要（p5.js を CDN から取得）。

## ファイル
- `index.html` … UI とスクリプト読み込み
- `style.css` … スタイル
- `sketch.js` … グリッチ処理
 - `assets/inputs/` … 外部読み込み用の画像置き場（`kv.webp` / `default.webp` を優先）

## アセットの推奨
- 解像度: 横長 1920x1080 以上（推奨: 2560x1440、見栄え重視: 3840x2160）
- 形式: PNG 推奨（完全一致）。サイズは 1 枚 2MB 前後を目安
- p5 側は cover 描画（中央トリミング）で表示します
- `pixelDensity(1)` でDPRの影響を抑制。解像感は素材側で担保

## 現在の確定パラメータ（ローカル正解）
- 画像: `assets/inputs/kv.webp`（未選択時自動ロード）
- アニメ: 既定OFF（`?wobble=1` でON）
- 速度線
  - 本数 `streakCount`: 80
  - 最大長 `streakMaxLen`: 0.65
  - 太さ `streakThickness`: 20（最大固定）
- グリッド
  - サイズ `gridSize`: 4
  - 間隔 `gridGap`: 2
- ぼかし
  - 基準 `preBlur`: 0.90
  - 揺れ幅 `blurAmp`(WOBBLE_BLUR_AMP): 2.0（URLで上書き可）
  - 揺れ速度 `blurSpeed`(WOBBLE_BLUR_SPEED): 1.5（URLで上書き可）

メモ: 完全再現用の例
```
http://localhost:5173/?img=kv.webp&wobble=1
```
