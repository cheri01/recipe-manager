#!/usr/bin/env bash
set -euo pipefail

input_dir="${1:-assets/processed-images}"
output_dir="${2:-assets/page-images}"
max_size="${3:-1400}"
quality="${4:-55}"

mkdir -p "$output_dir"

for input in "$input_dir"/*.png; do
  [ -e "$input" ] || continue
  base="$(basename "$input" .HEIC.png)"
  sips -s format jpeg -s formatOptions "$quality" -Z "$max_size" "$input" --out "$output_dir/$base.jpg" >/dev/null
done

echo "Generated page images in $output_dir"
