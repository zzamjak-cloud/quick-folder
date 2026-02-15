#!/bin/bash
# Tauri 자동 업데이트 설정 스크립트 (다른 프로젝트에서 재사용 가능)

set -e

PROJECT_NAME="${1:-my-tauri-app}"
GITHUB_USERNAME="${2:-YOUR_USERNAME}"
GITHUB_REPO="${3:-$PROJECT_NAME}"

echo "🚀 Tauri 자동 업데이트 시스템 설정 시작..."
echo "   프로젝트: $PROJECT_NAME"
echo "   저장소: $GITHUB_USERNAME/$GITHUB_REPO"
echo ""

# 프로젝트 루트 확인
if [ ! -f "package.json" ] || [ ! -d "src-tauri" ]; then
  echo "❌ 오류: Tauri 프로젝트 루트 디렉토리에서 실행하세요"
  exit 1
fi

# 1. 플러그인 설치
echo "📦 플러그인 설치 중..."
npm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
cd src-tauri && cargo add tauri-plugin-updater@2 && cd ..

# 2. 서명 키 생성 안내
echo ""
echo "🔐 서명 키 생성 필요"
echo "   다음 명령어를 실행하세요:"
echo ""
echo "   npm run tauri signer generate -- -w ~/.tauri/${PROJECT_NAME}-update.key"
echo ""
echo "   비밀번호를 입력하거나 Enter로 건너뛸 수 있습니다."
echo "   출력된 공개키를 복사하세요."
echo ""
read -p "키를 생성했습니까? (y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
  echo "⚠️  키 생성을 건너뛰었습니다. 나중에 수동으로 생성하세요."
fi

# 3. tauri.conf.json 업데이트 안내
echo ""
echo "⚙️  tauri.conf.json 설정 필요"
echo "   다음 설정을 추가하세요:"
echo ""
cat <<'EOF'
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/GITHUB_USERNAME/REPO_NAME/releases/latest/download/latest.json"
    ],
    "pubkey": "GENERATED_PUBLIC_KEY",
    "windows": {
      "installMode": "passive"
    }
  }
}
EOF
echo ""

# 4. capabilities 권한 추가 안내
echo "🔑 src-tauri/capabilities/default.json 권한 추가 필요"
echo "   permissions 배열에 다음을 추가하세요:"
echo ""
echo '    "updater:default",'
echo '    "updater:allow-check",'
echo '    "updater:allow-download",'
echo '    "updater:allow-install"'
echo ""

# 5. lib.rs 업데이트 안내
echo "⚠️  src-tauri/src/lib.rs에 다음 코드 추가 필요"
echo "   .plugin(tauri_plugin_updater::Builder::new().build())"
echo ""

# 6. 프론트엔드 파일 생성 안내
echo "📁 프론트엔드 파일 생성 필요"
echo "   QuickFolder 프로젝트의 다음 파일을 참고하세요:"
echo "   - hooks/useAutoUpdate.ts"
echo "   - components/UpdateModal.tsx"
echo "   - types.ts (UpdateInfo, UpdateStatus 타입 추가)"
echo "   - App.tsx (훅 통합 및 모달 렌더링)"
echo ""

# 7. GitHub Actions 워크플로우 안내
echo "🔧 .github/workflows/release.yml 설정 필요"
echo "   tauri-apps/tauri-action@v0 사용"
echo "   includeUpdaterJson: true 설정"
echo ""

echo "✅ 설정 안내 완료!"
echo ""
echo "다음 단계:"
echo "1. GitHub Secrets 설정:"
echo "   - Repository Settings → Secrets and variables → Actions"
echo "   - TAURI_SIGNING_PRIVATE_KEY: 생성한 private key 내용"
echo "   - TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 키 비밀번호 (선택)"
echo ""
echo "2. 위에서 안내한 파일들을 수정"
echo ""
echo "3. 첫 릴리스 테스트:"
echo "   git tag v0.1.0 && git push origin v0.1.0"
echo ""
echo "상세한 가이드: docs/AUTO_UPDATE_GUIDE.md"
