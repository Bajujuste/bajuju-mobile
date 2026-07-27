#!/usr/bin/env bash
set -euo pipefail
mkdir -p assets/fonts
base64 -d .preview-fonts/Fredoka-400.ttf.b64 > assets/fonts/Fredoka-400.ttf
base64 -d .preview-fonts/Fredoka-500.ttf.b64 > assets/fonts/Fredoka-500.ttf
base64 -d .preview-fonts/Fredoka-600.ttf.b64 > assets/fonts/Fredoka-600.ttf
base64 -d .preview-fonts/Fredoka-700.ttf.b64 > assets/fonts/Fredoka-700.ttf
cp node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf assets/fonts/Ionicons.ttf
cp node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf assets/fonts/MaterialCommunityIcons.ttf
echo "Font Bajuju pronti."
