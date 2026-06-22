# 외부 도구 통합

## FFmpeg

### 위치
`binaries/ffmpeg` — 앱 번들 사이드카 바이너리  
`src-tauri/src/modules/tool_ops/ffmpeg.rs`

### 의존 기능
비디오 압축·자르기·이어붙이기, 비디오↔GIF 변환, 비디오 썸네일 추출

### 설치 확인 흐름
```typescript
invoke('check_ffmpeg')     // → 미설치 시 UI에서 설치 유도
invoke('download_ffmpeg')
invoke('install_ffmpeg')
```

### tauri.conf.json 설정
```json
"externalBin": ["binaries/ffmpeg"]
```

---

## Ghostscript

### 위치
`binaries/gs` — 사이드카 바이너리  
`src-tauri/src/modules/tool_ops/ghostscript.rs` — command facade
`src-tauri/src/modules/tool_ops/ghostscript/{download,install,path,pdf,macos,windows}.rs`

### 의존 기능
PDF 압축 (`compress_pdf`), GIF 압축 (`compress_gif`)

### 설치 확인 흐름
```typescript
invoke('check_gs') / invoke('download_gs') / invoke('install_gs')
```

---

## FontTools (Python)

### 위치
`binaries/python-fonttools-*` — 플랫폼별 Python 번들  
`src-tauri/src/modules/tool_ops/fonttools.rs` — command facade
`src-tauri/src/modules/tool_ops/fonttools/{archive,install,merge,paths,python}.rs`

### 의존 기능
폰트 병합 (`merge_fonts`)

### 설치 확인 흐름
```typescript
invoke('check_fonttools') / invoke('download_fonttools') / invoke('install_fonttools')
```

### tauri.conf.json 설정
```json
"resources": ["binaries/python-fonttools-*"]
```

---

## 라이브러리 기반 처리 (외부 바이너리 불필요)

| 기능 | 라이브러리 |
|------|-----------|
| 이미지 처리 | `image` crate |
| PSD | `psd` crate |
| 폰트 파싱 | `ttf-parser` crate |
| HWP | `hwarang` crate |
| ZIP | `zip` crate |
| 휴지통 | `trash` crate |
| 클립보드 | `arboard` crate |

## 주의사항
- 외부 도구 사용 전 반드시 `check_*` 명령으로 설치 여부 확인
- 미설치 시 기능 실행 대신 설치 안내 UI 표시
