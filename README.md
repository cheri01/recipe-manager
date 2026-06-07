# Recipe Manager

画像から読み取ったレシピを閲覧、検索、管理する GitHub Pages 向けの静的アプリです。

## 構成

- `index.html`, `styles.css`, `app.js`: GitHub Pages に置く静的アプリ
- `assets/source-images/`: 元画像。HEIC などの生データを置きます。Git 管理対象外です。
- `assets/processed-images/`: 読み取り用に変換した高解像度画像。Git 管理対象外です。
- `assets/page-images/`: GitHub Pages 公開用の軽量画像。Git 管理対象です。
- `assets/generated-images/`: 生成AIで作った公開用レシピ画像。JPG を Git 管理します。
- `data/recipes.json`: アプリが読むレシピデータ
- `scripts/extract_recipes.py`: LM Studio で画像からレシピを抽出
- `scripts/generate_page_images.sh`: `assets/processed-images/` から公開用軽量画像を生成

## 画面

- `閲覧`: メイン画面。検索、一覧、レシピ詳細を読み取り専用で表示します。
- `登録・編集`: レシピの手動追加、編集、削除、複数画像からの下書き作成を行います。

`登録・編集` はローカル作業専用です。GitHub Pages 上では画像ファイルや `data/recipes.json` へ直接保存できません。

登録・編集画面では画像を複数選択できます。選択した各画像ごとに下書きレシピが作られ、`sourceImage` には `assets/source-images/ファイル名` が入ります。

GitHub Pages はブラウザから画像ファイルを保存できないため、公開時はローカルで `data/recipes.json` と画像を更新してから Git に反映します。画面上の画像プレビューは選択直後の確認用です。

## 画像読み取り

LM Studio を起動し、OpenAI 互換 API サーバーを `http://127.0.0.1:1234/v1` で有効にしてください。
モデル名は既定で `google/gemma-4-26b-a4b` です。

```bash
cd recipe-manager
python3 scripts/extract_recipes.py --input assets/source-images
```

HEIC などを読み取りやすい PNG/JPEG に変換した場合は、変換後の画像を `assets/processed-images/` に置いてから実行します。

```bash
python3 scripts/extract_recipes.py --input assets/processed-images
```

読み取りは画像ごとに `data/recipes.json` へ逐次保存されます。途中で止まっても、次回実行時は既に `sourceImage` が登録済みの画像をスキップします。

タイムアウトを長くしたい場合:

```bash
python3 scripts/extract_recipes.py --input assets/processed-images --model qwen/qwen3.6-27b --timeout 900
```

別の場所にある画像をコピーしながら処理する場合:

```bash
python3 scripts/extract_recipes.py --input /path/to/images --copy-images
```

処理結果は `data/recipes.json` に追記されます。1枚の画像に複数レシピが含まれる場合は、モデルの出力に応じて複数レコードとして保存されます。

## 元画像からレシピを登録する

元画像は GitHub Pages には載せず、ローカル作業用として扱います。

1. HEIC/JPEG などの元画像を `assets/source-images/` に置きます。
2. 読み取りやすい PNG/JPEG に変換した画像を `assets/processed-images/` に置きます。
3. `scripts/extract_recipes.py` を実行して、画像から `data/recipes.json` にレシピを追加します。
4. 公開用の軽量画像が必要な場合は `scripts/generate_page_images.sh` を実行し、`assets/page-images/*.jpg` を生成します。
5. ローカルサーバーで表示を確認します。

```bash
cd recipe-manager
python3 scripts/extract_recipes.py --input assets/processed-images
scripts/generate_page_images.sh
python3 -m http.server 4174
```

ブラウザで `http://127.0.0.1:4174/` を開きます。

`data/recipes.json` では、読み取り元画像のパスを `sourceImage` に保持します。

```json
{
  "id": "manual-img-2071-green-curry",
  "title": "グリーンカレー",
  "sourceImage": "assets/processed-images/IMG_2071.HEIC.png",
  "generatedImage": ""
}
```

ブラウザ表示時は `sourceImage` が `assets/processed-images/IMG_xxxx.HEIC.png` の場合、自動で `assets/page-images/IMG_xxxx.jpg` を参照します。

## 公開用軽量画像

元画像と読み取り用 PNG は容量が大きいため、GitHub Pages には `assets/page-images/` の JPEG だけを載せます。

```bash
chmod +x scripts/generate_page_images.sh
scripts/generate_page_images.sh
```

既定では `assets/processed-images/*.png` から、長辺 1400px・JPEG 品質 55 の画像を `assets/page-images/*.jpg` として生成します。

アプリのデータ上は `sourceImage` に `assets/processed-images/IMG_xxxx.HEIC.png` を保持しますが、ブラウザ表示時は自動で `assets/page-images/IMG_xxxx.jpg` を参照します。これにより、ローカルの読み取り作業用データと GitHub Pages 用データを分けて管理できます。

## 生成画像を登録する

生成AIで作ったレシピ画像は、最終的に JPG として `assets/generated-images/` に保存します。PNG のまま置くとファイルサイズが大きくなりやすいため、GitHub Pages に載せる画像は JPG に統一します。

推奨ファイル名は、レシピIDと同じ名前にした JPG です。

```text
assets/generated-images/manual-img-2071-green-curry.jpg
```

`data/recipes.json` の該当レシピで `generatedImage` に保存先を入れます。

```json
{
  "id": "manual-img-2071-green-curry",
  "title": "グリーンカレー",
  "sourceImage": "assets/processed-images/IMG_2071.HEIC.png",
  "generatedImage": "assets/generated-images/manual-img-2071-green-curry.jpg"
}
```

アプリの閲覧画面では、`generatedImage` がある場合はサムネイルと詳細画像の初期表示に生成画像を優先します。生成画像がないレシピでは、従来どおり `sourceImage` 由来の `assets/page-images/*.jpg` を表示します。

生成画像を PNG から JPG に変換する例:

```bash
sips -s format jpeg -s formatOptions 82 -Z 1200 input.png --out assets/generated-images/manual-img-2071-green-curry.jpg
```

生成画像用プロンプトは `prompts/generated-image-prompts/*.jsonl` に保存します。各行は1レシピ分で、主な項目は以下です。

```json
{
  "id": "manual-img-2071-green-curry",
  "title": "グリーンカレー",
  "prompt_ja": "生成用の日本語プロンプト",
  "filename_jpg": "manual-img-2071-green-curry.jpg"
}
```

現在の生成画像トンマナは、少しポップで可愛い、写真とイラストの中間くらいのリアリティ、北欧系の食器、明るい家庭料理サムネイルで統一します。プロンプトには実レシピの材料を反映し、文字・ロゴ・人物・手・包装は入れないようにします。

## ローカル確認

```bash
python3 -m http.server 4174
```

ブラウザで `http://127.0.0.1:4174/` を開きます。

## GitHub Pages

このディレクトリをリポジトリに置き、GitHub Pages の公開対象にしてください。
GitHub Pages 上では LM Studio を直接呼び出しません。ローカルで `data/recipes.json` と必要な画像を更新してから公開します。

Git に含める主なファイル:

- `index.html`
- `styles.css`
- `app.js`
- `data/recipes.json`
- `assets/page-images/*.jpg`
- `assets/generated-images/*.jpg`
- `assets/generated-images/.gitkeep`
- `prompts/generated-image-prompts/*.jsonl`
- `scripts/*.py`
- `scripts/generate_page_images.sh`
- `README.md`
- `.gitignore`

Git に含めないファイル:

- `assets/source-images/`
- `assets/processed-images/`
- `assets/generated-images/` 内の作業用 PNG
- `.DS_Store`
- `__pycache__/`

VS Code で公開前に確認すること:

1. Source Control で `assets/source-images/` と `assets/processed-images/` が表示されていないことを確認します。
2. `assets/page-images/`、`assets/generated-images/*.jpg`、`data/recipes.json`、`prompts/generated-image-prompts/`、アプリ本体の変更だけをステージします。
3. コミット後、GitHub に push します。
4. GitHub の Settings > Pages で公開ブランチとフォルダを設定します。通常は `main` ブランチのルート、または `docs/` ではなくこのアプリの配置先を選びます。

## 画像表示の優先順位

画像表示は以下の順で決まります。

1. `generatedImage`: 生成AIで作った公開用 JPG
2. `sourceImage`: 元画像から作った公開用 `assets/page-images/*.jpg`
3. 画像なし表示

ブラウザにローカル下書きが残っている場合でも、サーバー上の `data/recipes.json` に入っている `generatedImage` はマージして表示されます。表示が古い場合は、ブラウザをリロードしてください。
