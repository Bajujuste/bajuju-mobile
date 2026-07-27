#!/usr/bin/env bash
set -euo pipefail
mkdir -p assets/fonts
base64 -d .preview-fonts/Fredoka-400.ttf.b64 > assets/fonts/Fredoka-400.ttf
base64 -d .preview-fonts/Fredoka-500.ttf.b64 > assets/fonts/Fredoka-500.ttf
base64 -d .preview-fonts/Fredoka-600.ttf.b64 > assets/fonts/Fredoka-600.ttf
base64 -d .preview-fonts/Fredoka-700.ttf.b64 > assets/fonts/Fredoka-700.ttf
echo "Font Bajuju pronti."
