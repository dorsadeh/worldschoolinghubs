#!/usr/bin/env bash
# Rebuild the consolidated worldschooling hub directory + HTML report.
# Usage:  ./make.sh            (full: merge → fetch images → fill location photos → rebuild)
#         ./make.sh --no-fetch (just re-merge inputs & regenerate HTML; skip network)
#
# Inputs it reads:
#   ../hubs/*.json                       (the 46 PDF-sourced hubs)
#   candidate-hubs-2026-06-08.csv        (web-research candidates)
#   curated organic/Spanish/traveling entries (inside build_directory.py)
#   images-map.json + hub-images/        (downloaded photos, cached)
# Add a new input later (Facebook screenshots / user links): append rows to the CSV
#   or add to the EXTRA list in build_directory.py, then re-run this.
set -euo pipefail
cd "$(dirname "$0")"
PY=python3

echo "==> 1/4  merge inputs → JSON/CSV/HTML"
$PY build_directory.py

if [[ "${1:-}" != "--no-fetch" ]]; then
  echo "==> 2/4  fetch hub photos (og:image → favicon, cached)"
  $PY fetch_images.py || echo "   (fetch_images had errors — continuing)"
  echo "==> 3/4  fill generic location photos (Wikipedia) for anything still bare"
  $PY fetch_location_images.py || echo "   (fetch_location_images had errors — continuing)"
  echo "==> 4/4  rebuild HTML with the complete image set"
  $PY build_directory.py
else
  echo "==> skipping network fetch (--no-fetch)"
fi

echo
echo "DONE → open  data/research/hub-directory-report-2026-06-09.html"
