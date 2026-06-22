# 릴리스 절차

> 반복 실패 이력: 태그 force-push로 서명 불일치, 버전 파일 미동기화 다수 발생.
> 아래 순서를 건너뛰지 말 것.

## 전체 순서

```
현재 버전 확인 (package.json)
  ↓
버전 +1 결정 (patch 기본, minor/major는 명시 요청 시만)
  ↓
세 파일 병렬 Read → 병렬 Edit (package.json, Cargo.toml, tauri.conf.json)
  ↓
CHANGELOG.md 새 버전 섹션 추가 (한국어, Added/Changed/Fixed)
  ↓
git add — 버전 파일 + CHANGELOG + 변경 소스만
  ↓
git commit (HEREDOC, Co-Authored-By)
  ↓
git push origin main
  ↓
git tag -a v{version} → git push origin v{version}
```

## 버전 동기화 필수 파일

| 파일 | 키 |
|------|----|
| `package.json` | `"version"` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/tauri.conf.json` | `"version"` |

세 파일이 불일치하면 빌드 오류 또는 업데이터 오작동.

## STEP 1 — 버전 파일 수정
세 파일을 병렬 Read 후 병렬 Edit.  
`git add -A` / `git add .` 금지 — 버전 파일 + CHANGELOG + 변경 소스만 명시적으로 add.

## STEP 2 — CHANGELOG.md 업데이트
```
## [Unreleased]

## [1.27.33] - 2026-06-03
### Added
- ...
### Fixed
- ...
```
CHANGELOG 없이 태그 푸시 금지.

## STEP 3 — 태그 생성·푸시
```bash
git tag -a v{version} -m "v{version}: 요약"
git push origin v{version}
```

## 금지 사항

- **태그 force-push 절대 금지** — `tauri-action`이 에셋을 두 번 업로드하여 `.sig` 서명 불일치 발생 → 업데이터 파손
- 태그가 이미 존재하면 다음 patch 버전으로 새 태그 생성
- `git add -A` / `git add .` 금지 (`.omc/**` 등 세션 파일 포함될 수 있음)
- CHANGELOG 없이 태그 푸시 금지

## tauri.conf.json 업데이터 관련 설정

```json
"bundle": {
  "targets": ["app", "dmg", "nsis"],   // "app" 필수 — 없으면 .app.tar.gz 미생성
  "createUpdaterArtifacts": true        // 필수 — 없으면 .sig 미생성
}
```

## GitHub Actions (tauri-action@v0.5)
- `latest.json` 자동 생성·업로드
- `releaseDraft: false` 필수 (draft URL은 인증 필요)
- 환경변수: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## macOS Universal Binary 주의
`tauri-action`이 `darwin-aarch64` / `darwin-x86_64` 키로 `latest.json` 등록.  
`updater.target("darwin-universal")` 설정 시 키 불일치로 업데이트 감지 불가 → 사용 금지.

## 업데이터 테스트
`tests/ui/useAutoUpdate.test.tsx`에서 `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/api/app`을 mock 처리한다. 업데이트 감지 모달, `downloadAndInstall` progress/done 이벤트, `relaunch()`, `open_sac_settings` wrapper 경계를 검증한다.

## 릴리스 트리거 문구
**"버전 올리고 태그 푸시해줘"** / "릴리스해줘" / "태그 푸시해줘" → 위 절차를 중간 확인 없이 즉시 실행.

## 관련 위키
- [overview.md](overview.md)
