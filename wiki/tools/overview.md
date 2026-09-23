# 외부 도구 통합

> **정책**: QuickFolder는 무료 배포이므로 FFmpeg는 공개 배포 빌드(gyan.dev / evermeet.cx)를 그대로 번들한다.
> Ghostscript(AGPL)는 번들·다운로드 모두 제거됨 — PDF 압축은 Rust 자체 구현(`media_ops/pdf.rs`).
> H.264/HEVC 인코딩은 OS 인코더(VideoToolbox / MediaFoundation)를 1순위로 사용해 어떤 ffmpeg 빌드에서도 동작한다.

## FFmpeg (공개 빌드 번들 + 런타임 다운로드 폴백)

### 위치
`src-tauri/src/modules/tool_ops/ffmpeg.rs`  
번들 경로: `binaries/ffmpeg-dist/ffmpeg(.exe)` → 앱 리소스 (macOS: `Contents/Resources/binaries/ffmpeg-dist/`)  
번들 준비: `release.yml`이 다운로드해 `ffmpeg-dist/`에 배치.
- macOS: arm64 네이티브(martin-riedl.de) + x86_64(evermeet.cx)를 `lipo`로 universal 결합 — x86_64 단독이면 Apple Silicon에서 Rosetta 에뮬레이션으로 압축이 크게 느려진다. arm64 확보 실패 시 x86_64 단독 폴백.
- Windows: gyan.dev essentials (네이티브 x64).

런타임 다운로드 폴백(번들 손상 등 예외 상황, 사용자 동의 필요):
`dirs::data_dir()/QuickFolder Widget/ffmpeg_portable`, URL 상수 `constants.rs` — 폴백 체인:
- Windows: gyan.dev → BtbN GitHub 미러
- macOS x86_64: evermeet.cx → martin-riedl.de
- macOS arm64: martin-riedl.de(네이티브) → evermeet.cx(x86_64, Rosetta 필요)

다운로드 후 실행 검증(`is_runnable_ffmpeg`)에 실패하면 다음 출처로 자동 재시도.

### 인코더 정책 (`media_ops/video/compress.rs`)
LGPL 빌드(libx264 없음)에서도 동작하도록 인코더 후보 체인으로 동작 (번들 GPL 빌드에서는 libx264 폴백도 사용 가능):

동영상 압축은 디코딩도 하드웨어를 사용한다(macOS `-hwaccel videotoolbox`, Windows `-hwaccel d3d11va`) —
HW 디코드 초기화 실패 환경을 위해 각 인코더 후보를 HW → SW 디코드 순으로 재시도한다.
- macOS: `hevc_videotoolbox` → `h264_videotoolbox` → `libx265`(GPL ffmpeg 폴백)
- Windows: `h264_mf` → `libx264`(GPL ffmpeg 폴백) → `mpeg4`

### 의존 기능
비디오 압축·자르기·이어붙이기, 비디오↔GIF 변환, 비디오 썸네일 추출, GIF 압축

### 설치 확인 흐름
```typescript
// 프론트엔드는 반드시 utils/ffmpegSetup.ts의 ensureFfmpeg(t, onStatus) 사용
// (check_ffmpeg → 미설치 시 사용자 동의 다이얼로그 → download_ffmpeg)
const ready = await ensureFfmpeg(t, setStatusText);
```

바이너리 탐색 우선순위(`find_ffmpeg_path`): 번들 → 다운로드본 → 설치된 앱 → 패키지 관리자 절대 경로(Homebrew/choco/winget — GUI 앱 PATH 미반영 대응) → 시스템 PATH.

#### 번들 탐색은 호출자가 둘이다 (`bundled_ffmpeg_candidates`)

`find_ffmpeg_path`는 **GUI 앱과 `qf-mcp` 양쪽에서 호출된다.** 설치 폴더 안 깊이가 달라서
`current_exe()` 옆만 보면 qf-mcp 쪽이 통째로 빗나간다.

```text
Windows  <install>/app.exe                                ← GUI
         <install>/binaries/qf-mcp.exe                    ← MCP 서버
         <install>/binaries/ffmpeg-dist/ffmpeg.exe        ← 실물

macOS    <app>/Contents/MacOS/QuickFolder                 ← GUI
         <app>/Contents/Resources/binaries/qf-mcp         ← MCP 서버
         <app>/Contents/Resources/binaries/ffmpeg-dist/ffmpeg  ← 실물
```

GUI 기준이면 `binaries/ffmpeg-dist/`로 내려가야 하고, qf-mcp 기준이면 이미 `binaries/` 안이라
`ffmpeg-dist/`만 붙이면 된다. **둘 다 후보에 넣는다.** 한쪽만 보던 시절에는 설치된 qf-mcp가
바로 옆 번들 ffmpeg를 못 찾아 `qf_info`가 `ffmpeg_available: false`를 돌려주고,
에이전트 쪽 비디오 기능이 통째로 죽었다. `bundled_candidates_cover_both_gui_and_qf_mcp_layouts`
테스트가 이걸 고정한다.

새 외부 도구를 번들할 때도 같은 함정을 확인할 것 — **qf-mcp에서도 찾아지는지** 별도로 봐야 한다.

---

## Ghostscript — 제거됨 (2026-07-17)

Ghostscript(AGPL) 의존을 완전히 제거했다. PDF 압축은 순수 Rust 구현으로 대체되었다.

### 대체 위치
`src-tauri/src/modules/media_ops/pdf.rs` — `compress_pdf` 자체 구현

### 압축 방식
lopdf + image 크레이트만 사용한다. 외부 실행 파일·다운로드·설치 흐름이 전부 사라졌으므로
`check_gs` / `download_gs` / `install_gs` 명령과 관련 토스트 키도 제거되었다.

- PDF 내 이미지 XObject를 재인코딩하여 용량을 줄인다.
  - DCTDecode(JPEG): 긴 변 1600px 초과 시 Lanczos 다운스케일 → 품질 75 재인코딩
  - FlateDecode 8bit DeviceRGB/DeviceGray 원시 비트맵: 동일 규칙으로 JPEG 전환
- 결과가 더 작을 때만 교체하고, 최종 산출물이 원본 이상이면 삭제 후 에러를 반환한다.
- CMYK/Indexed/ICC/CCITT/JBIG2/JPX 및 SMask 스트림은 건너뛴다(손상 방지).

---

## FontTools (Python)

### 위치
`src-tauri/binaries/python-fonttools-placeholder` — 빈 placeholder (실물 아님, 아래 참고)  
`src-tauri/src/modules/tool_ops/fonttools.rs` — command facade
`src-tauri/src/modules/tool_ops/fonttools/{archive,install,merge,paths,python}.rs`

### 의존 기능
폰트 병합 (`merge_fonts`)

### 설치 확인 흐름
```typescript
invoke('check_fonttools') / invoke('download_fonttools') / invoke('install_fonttools')
```

### 번들되지 않는다 — 최초 사용 시 다운로드

`tauri.conf.json`의 `resources`에 `binaries/python-fonttools-*`가 있지만, `release.yml`이
거기에 넣는 것은 `touch`로 만든 **빈 placeholder 파일**이다(`python-fonttools-placeholder`).
실제 Python+fonttools 포터블 패키지는 최초 사용 시 GitHub Releases(`portable-tools-v1`)에서
받아 `%LOCALAPPDATA%/QuickFolder/python_fonttools_embed`(macOS는
`~/Library/Application Support/QuickFolder/...`)에 푼다. **GUI든 qf-mcp든 마찬가지다.**

```json
"resources": ["binaries/python-fonttools-*"]   // placeholder 뿐 — 실물 아님
```

설치 경로가 실행 파일 상대가 아니라 사용자 디렉터리라서, 한 번 받아 두면 qf-mcp도 그대로 쓴다.
다만 **아직 받지 않은 상태에서 에이전트가 폰트 병합을 요청하면 다운로드 동의를 받을 GUI가 없다.**
MCP로 폰트 기능을 노출할 때 이 점을 설계에 반영할 것.

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
