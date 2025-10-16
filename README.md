# p5-glitch

ローカルで開くだけで動く簡単な p5.js グリッチツールです。

## 使い方
1. `index.html` をブラウザで開く（Chrome 推奨）。
2. Framer 埋め込み用：`assets/inputs/` に画像ファイル（jpg/png）を置き、URL に `?img=ファイル名` を付けてアクセスします。
   - 例: `http://localhost:5173/?img=sample.jpg`
   - 揺らぎ（微小アニメ）は既定OFF。`?wobble=1` でON、`W` キーでトグル。
3. スライダーの位置はローカルに保存され、次回起動時の初期値になります。
4. 「ランダム化」でパターンを変更。「保存（PNG）」で書き出し。

インターネット接続が必要（p5.js を CDN から取得）。

## ファイル
- `index.html` … UI とスクリプト読み込み
- `style.css` … スタイル
- `sketch.js` … グリッチ処理
 - `assets/inputs/` … 外部読み込み用の画像置き場
