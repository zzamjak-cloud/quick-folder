# 빌드 & 설정 파일

## 개발 명령
```bash
npm run tauri dev     # 개발 모드 (hot reload)
npm run tauri build   # 프로덕션 빌드
npm run build         # 프론트엔드만
npm run preview       # 웹 미리보기
```

## 설정 파일 위치

| 파일 | 역할 |
|------|------|
| `src-tauri/tauri.conf.json` | 앱 설정 (윈도우, 번들, 업데이터) |
| `src-tauri/capabilities/default.json` | 플러그인 권한 (28개 항목) |
| `src-tauri/Cargo.toml` | Rust 의존성 |
| `vite.config.ts` | Vite 빌드 설정 |
| `tsconfig.json` | TypeScript 설정 |
| `package.json` | npm 설정·버전 |

## 빌드 산출물

| 플랫폼 | 위치 | 크기 |
|--------|------|------|
| macOS DMG | `src-tauri/target/release/bundle/dmg/` | ~3.7 MB |
| Windows NSIS | `src-tauri/target/release/bundle/nsis/` | ~4-5 MB |
| 업데이터 (macOS) | `.app.tar.gz` + `.app.tar.gz.sig` | — |

## tauri.conf.json 핵심 항목

```json
{
  "bundle": {
    "targets": ["app", "dmg", "nsis"],
    "createUpdaterArtifacts": true,
    "externalBin": ["binaries/ffmpeg", "binaries/gs"],
    "resources": ["binaries/python-fonttools-*"]
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/zzamjak-cloud/quick-folder/releases/latest/download/latest.json"],
      "pubkey": "..."
    }
  }
}
```

## tsconfig.json 주의사항
```json
"exclude": ["node_modules", "src-tauri/target", "dist"]
```
`src-tauri/target` 누락 시 Rust 빌드 아티팩트를 TypeScript가 스캔하여 빌드 오류 발생.

## Tauri 플러그인 (Cargo.toml)
`tauri-plugin-opener`, `clipboard-manager`, `dialog`, `drag`, `updater`, `process`, `log`

## capabilities/default.json 주요 권한
윈도우 제어 (close, minimize, set-size 등 11개), opener, clipboard-manager, dialog, updater, drag, process

## 관련 위키
- [release.md](release.md)
- [../i18n/overview.md](../i18n/overview.md)
