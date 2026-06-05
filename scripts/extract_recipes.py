#!/usr/bin/env python3
"""Extract recipe records from source images with an LM Studio vision model."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import shutil
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "source-images"
DATA_PATH = ROOT / "data" / "recipes.json"
DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1"
DEFAULT_MODEL = "google/gemma-4-26b-a4b"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


SYSTEM_PROMPT = """あなたは料理レシピ画像のデータ化担当です。
画像内に複数のレシピがある場合は、必ずレシピごとに分割してください。
読み取れない箇所は推測しすぎず空文字または空配列にしてください。
返答はJSONオブジェクトのみで、説明文やMarkdownを含めないでください。"""

USER_PROMPT = """画像からレシピを抽出してください。
返すJSONオブジェクトの最上位キーは recipes のみです。
各レシピは title, category, tags, ingredients, steps, notes を持ちます。
画像に複数レシピがある場合は recipes 配列に複数入れてください。
画像に明記されていない分量、タグ、カテゴリは補完しないでください。
最大でも画像内で読めるレシピだけを短く返してください。
表、HTML、XML、Markdown、推測での長文補完は禁止です。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE_DIR, help="画像ファイルまたは画像ディレクトリ")
    parser.add_argument("--output", type=Path, default=DATA_PATH, help="出力するrecipes.json")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="LM Studio OpenAI互換APIの/v1 URL")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="使用するLM Studioモデル名")
    parser.add_argument("--copy-images", action="store_true", help="入力画像をassets/source-imagesへコピーする")
    parser.add_argument("--limit", type=int, default=0, help="処理枚数の上限。0は無制限")
    parser.add_argument("--timeout", type=int, default=600, help="LM Studio APIのタイムアウト秒数")
    parser.add_argument("--max-tokens", type=int, default=3000, help="モデル出力の最大トークン数")
    return parser.parse_args()


def image_paths(path: Path) -> list[Path]:
    if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
        return [path]
    if not path.exists():
        raise FileNotFoundError(path)
    return sorted(item for item in path.rglob("*") if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS)


def ensure_local_image(path: Path, copy_images: bool) -> Path:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    if path.resolve().is_relative_to(SOURCE_DIR.resolve()):
        return path
    if not copy_images:
        return path

    target = SOURCE_DIR / path.name
    if target.exists():
        target = SOURCE_DIR / f"{path.stem}-{uuid.uuid4().hex[:8]}{path.suffix.lower()}"
    shutil.copy2(path, target)
    return target


def public_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def call_lm_studio(base_url: str, model: str, path: Path, timeout: int, max_tokens: int) -> dict:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url(path)}},
                ],
            },
        ],
    }

    req = request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as res:
        raw = json.loads(res.read().decode("utf-8"))

    message = raw["choices"][0]["message"]
    content = message.get("content") or message.get("reasoning_content") or ""
    if not content:
        raise RuntimeError(json.dumps(raw, ensure_ascii=False)[:2000])
    return json.loads(extract_json(content))


def extract_json(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.startswith("json"):
            content = content[4:].strip()
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", content, 0)
    return content[start : end + 1]


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {"recipes": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_data(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_recipe(recipe: dict, source_image: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    title = str(recipe.get("title") or "").strip()
    return {
        "id": uuid.uuid4().hex,
        "title": title or "無題",
        "category": str(recipe.get("category") or "").strip(),
        "status": "review",
        "tags": list_or_empty(recipe.get("tags")),
        "sourceImage": source_image,
        "generatedImage": "",
        "ingredients": list_or_empty(recipe.get("ingredients")),
        "steps": list_or_empty(recipe.get("steps")),
        "notes": str(recipe.get("notes") or "").strip(),
        "createdAt": now,
        "updatedAt": now,
    }


def list_or_empty(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [line.strip() for line in value.splitlines() if line.strip()]
    return []


def main() -> int:
    args = parse_args()
    paths = image_paths(args.input)
    if args.limit:
        paths = paths[: args.limit]

    data = load_existing(args.output)
    recipes = data.setdefault("recipes", [])
    existing_sources = {recipe.get("sourceImage") for recipe in recipes}

    for index, original_path in enumerate(paths, start=1):
        local_path = ensure_local_image(original_path, args.copy_images)
        source_image = public_path(local_path)
        if source_image in existing_sources:
            print(f"[{index}/{len(paths)}] {local_path} skipped: already extracted", flush=True)
            continue

        print(f"[{index}/{len(paths)}] {local_path}", flush=True)
        try:
            result = call_lm_studio(args.base_url, args.model, local_path, args.timeout, args.max_tokens)
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            print(f"  failed: HTTP {exc.code}: {body}", file=sys.stderr)
            continue
        except json.JSONDecodeError as exc:
            print(f"  failed: {exc}", file=sys.stderr)
            if exc.doc:
                preview = exc.doc[:5000].replace("\n", "\\n")
                print(f"  raw preview: {preview}", file=sys.stderr)
            continue
        except (error.URLError, KeyError, TimeoutError, RuntimeError) as exc:
            print(f"  failed: {exc}", file=sys.stderr)
            continue

        extracted = result.get("recipes", [])
        for item in extracted if isinstance(extracted, list) else []:
            recipes.append(normalize_recipe(item, source_image))
        if extracted:
            existing_sources.add(source_image)
            save_data(args.output, data)
            print(f"  saved: {len(extracted)} recipes", flush=True)
        time.sleep(0.2)

    save_data(args.output, data)
    print(f"Wrote {len(recipes)} recipes to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
