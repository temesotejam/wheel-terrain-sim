# wheel-terrain-sim

タイヤ／車輪と変形地盤の相互作用を、ブラウザ上で比較・可視化する軽量シミュレータです。

## 現在のモデル

初期版は、以下を組み合わせた簡易テラメカニクスモデルです。

- Bekker–Wong系 pressure–sinkage model
- Janosi–Hanamoto型 shear stress model
- 剛体車輪の接触弧を数値積分
- 荷重に釣り合う沈下量を数値的に探索
- ラグ付きタイヤは簡易的な shear gain と lug penetration で近似

これはDEMのように土粒子を一粒ずつ解くモデルではありません。絶対値の予測よりも、**同一条件でのタイヤ形状比較と現象の可視化**を主目的にしています。

## GitHub Pages UI

`index.html` を開くだけで動作し、GitHub Pagesでも配信できます。

表示内容:

- 回転するタイヤと地面のアニメーション
- 接触域の法線反力・せん断力ベクトル
- 沈下量
- 正味推進力
- 必要トルク
- 簡易効率指標
- スリップ率スイープ
- 標準 / 幅広 / 細幅 / ラグ付き / 大径タイヤの同条件比較
- Canvasアニメーションの8秒WebM保存

## GitHub Pagesの有効化

初回だけリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。

その後は `.github/workflows/pages.yml` が `feature/initial-terramechanics-sim` または `main` へのpushでサイトを公開します。

公開URLは通常:

`https://temesotejam.github.io/wheel-terrain-sim/`

## ローカルでの使い方

静的ファイルだけなので、`index.html` を直接開くか、任意のHTTPサーバーで配信できます。

例:

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 注意

地盤プリセットの値は、UIと相対比較を成立させるための暫定値です。実機予測に使う場合は対象地盤の pressure–sinkage / shear 特性を実験で同定してください。

## 今後の候補

1. 実測地盤パラメータ入力
2. タイヤ断面・ラグ形状の詳細化
3. 轍・再踏破の履歴モデル
4. RFTモデルとの比較
5. DEM / MPM結果とのクロスチェック
6. CSV出力・比較レポート生成
