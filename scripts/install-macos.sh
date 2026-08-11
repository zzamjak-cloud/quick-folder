#!/bin/sh
# QuickFolder macOS 원라인 설치 스크립트
# 사용법: curl -fsSL https://github.com/zzamjak-cloud/quick-folder/releases/latest/download/install.sh | sh
#
# curl로 내려받은 파일에는 quarantine 속성이 붙지 않으므로
# Gatekeeper "확인되지 않은 개발자" 경고 없이 바로 설치·실행된다.
set -eu

REPO="zzamjak-cloud/quick-folder"
ASSET="QuickFolder.Widget_universal.app.tar.gz"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

# 설치 위치: /Applications 쓰기 불가(비관리자 계정) 시 ~/Applications 로 폴백
DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "▶ QuickFolder 최신 버전 다운로드 중... (Downloading the latest QuickFolder...)"
curl -fL --progress-bar "$URL" -o "$TMP/$ASSET"

echo "▶ 설치 중... (Installing to $DEST...)"
# 실행 중이면 종료 후 교체
osascript -e 'tell application "QuickFolder Widget" to quit' >/dev/null 2>&1 || true
rm -rf "$DEST/QuickFolder Widget.app"
tar -xzf "$TMP/$ASSET" -C "$DEST"

# 브라우저로 스크립트를 저장해 실행한 경우 등을 대비해 quarantine 흔적 제거
xattr -cr "$DEST/QuickFolder Widget.app" 2>/dev/null || true

echo "✅ 설치 완료! QuickFolder를 실행합니다. (Installed! Launching QuickFolder.)"
open "$DEST/QuickFolder Widget.app"
