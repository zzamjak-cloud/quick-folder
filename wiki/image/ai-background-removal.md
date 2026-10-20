# AI 배경 제거

배경 제거 모달(`RemoveWhiteBgModal.tsx`)의 **AI** 모드. 색상 기반 모드는 단색 배경에서만
동작하므로, 사진·복잡한 배경은 세그멘테이션 모델(ONNX)로 전경 마스크를 추론한다.

| 모드 | 잘 맞는 이미지 | 약점 |
|------|---------------|------|
| 색상 기반 (`background.rs`) | 단색 배경의 게임 에셋·아이콘·픽셀아트 | 사진·그라데이션 배경, 배경과 같은 색의 피사체 |
| AI (`background_ai.rs`) | 사진, 복잡한 배경, 일러스트 | 모델이 1024² 로 추론해 **픽셀 단위 정확도는 색상 기반보다 낮다** |

픽셀아트·단색 아이콘은 색상 기반이 더 정확하다. AI 모드가 기존 모드를 대체하지 않는다.

## 코드 위치

```
crates/quickfolder-core/src/image_ops/
├── background_ai.rs           ← 공개 API + 마스크 캐시
└── background_ai/
    ├── models.rs              ← 모델 카탈로그 (URL, sha256, 전처리 규칙)
    ├── runtime.rs             ← ONNX Runtime·모델 다운로드, 세션
    └── matte.rs               ← 전처리, 마스크 → 알파 합성
crates/quickfolder-core/tests/ai_bg.rs   ← 실측 테스트 (#[ignore], 네트워크 필요)
```

Tauri 명령: `ai_bg_status` / `ai_bg_install` / `ai_bg_preview` / `ai_bg_save`.
배치·MCP·CLI: `ImageBatchOp::RemoveBgAi` (`qf_image_batch op=remove_bg_ai`, `qf image remove-bg-ai`).

## 배포 — 아무것도 번들하지 않는다

설치 파일 크기를 늘리지 않으려고 런타임·모델을 **최초 사용 시** 원 배포처에서 받는다.

| 구성 요소 | 출처 | 크기 |
|-----------|------|------|
| ONNX Runtime 1.31.0 | Microsoft 공식 GitHub 릴리스 (MIT) | win-x64 zip 83MB → dll 17MB만 추출 |
| ISNet general | rembg 릴리스 (Apache-2.0) | 179MB |
| ISNet anime | rembg 릴리스 (Apache-2.0) | 176MB |
| BiRefNet lite | rembg 릴리스 (MIT) | 224MB |

- 저장 위치: `dirs::data_dir()/QuickFolder Widget/ai_bg/` (`runtime-1.31.0/`, `models/`) —
  ffmpeg 와 같이 GUI·CLI·MCP 가 공유한다.
- 모든 파일은 `.part` 에 받은 뒤 **고정 sha256** 과 일치해야 최종 이름으로 옮긴다. 이름이 있으면 검증된 파일이다.
- `ort` crate 는 `load-dynamic` 으로 쓴다(링크 안 함). `ort::init_from(<dll 절대경로>)` 로 로드하므로
  Windows `System32\onnxruntime.dll`(구버전)과 섞이지 않는다.
- **`ort` 의 `api-31` feature 와 내려받는 ORT 버전(1.31)을 같이 올려야 한다.** 런타임이 더 낮으면 `ort` 가 로드를 거부한다.
- MCP·CLI 는 모델을 자동으로 받지 않는다(수백 MB 무단 다운로드 방지). 없으면 앱에서 받으라는 오류를 낸다.

### 플랫폼

| 플랫폼 | 지원 |
|--------|------|
| Windows x64 / ARM64 | ✅ |
| macOS Apple Silicon | ✅ — `entitlements.plist` 의 `disable-library-validation` 필요 (ad-hoc 서명 앱이 외부 dylib 를 dlopen) |
| macOS Intel | ❌ — Microsoft 가 osx-x86_64 빌드를 더 이상 배포하지 않음. `ai_bg_status.supported=false` |

> macOS 경로는 Windows 에서만 실측했다. macOS 릴리스 후 첫 확인 대상이다.

## 모델 선택 (실측, Windows CPU)

| id | 추론 시간 | 특징 |
|----|-----------|------|
| `isnet-general` (기본) | ~1초 | 품질·속도 균형 |
| `birefnet-lite` | 6~10초 | 가장 깔끔 (잔디·거품 같은 잔여물 적음) |
| `isnet-anime` | ~1초 | 일러스트 전용. **실사 사진에서는 전경을 거의 못 잡는다** |

라이선스 때문에 BRIA RMBG(CC BY-NC, 비상업)는 등록하지 않는다.

## 처리 흐름

```
이미지 ─ preprocess(1024² 리사이즈, rembg normalize 규칙) ─ ORT 추론 ─ normalize_mask(sigmoid?, min-max)
      └──────────────── 마스크 캐시 (경로+크기+mtime+모델, 최근 6장) ────────────────┘
                                         │
compose(원본, 마스크, 옵션) ─ 알파 업샘플 → [경계 정밀화] → 컷오프·선명도 → [색 번짐 제거] → RGBA
```

추론은 파일·모델별 1회. 슬라이더를 움직이면 `compose` 만 다시 돌아 즉시 반영되고(캐시 50~180ms),
저장도 미리본 마스크를 그대로 쓴다. 세션은 하나(`Mutex`)라 추론은 직렬화된다 — ORT 가 내부에서
코어를 다 쓰므로 병렬로 돌려도 빨라지지 않는다.

## 후처리 옵션과 기본값의 근거

| 옵션 | 기본 | 근거 |
|------|------|------|
| 색 번짐 제거 (`decontaminate`) | **켬** | 경계의 배경색 테두리(하늘색·흰 헤일로)가 확연히 사라진다. 실측에서 효과가 가장 컸다 |
| 경계 정밀화 (`refineEdges`) | **끔** | Fast Guided Filter. 효과가 작고, 모델보다 작은 이미지에선 오히려 흐려서 그때는 아예 건너뛴다 |
| 잔여 반투명 제거 (`cutoff`) | 5 | 배경 쪽 옅은 잔여 알파 제거 |
| 경계 선명도 (`sharpness`) | 0 | 올리면 이진 마스크에 가까워짐 (하드 엣지가 필요한 에셋용) |

- 알파 0.98 이상은 완전 불투명으로 올린다(`OPAQUE_SNAP`). 필터·확대로 균일한 전경 내부가 0.98 언저리로
  깎여 미세하게 비쳐 보이던 것을 막는다.
- guided filter `eps` 는 1e-4. 1e-3 은 피부·털처럼 배경과 밝기 차가 작은 경계에서 사실상 블러가 됐다.
- 계수는 작업 해상도(긴 변 ≤ 2048)에서 구하고 원본 해상도에서 `A·I + B` 로 합성해, 메모리를 원본 크기와 무관하게 묶는다.

## 프론트엔드

- 모드·모델·옵션은 `qf_remove_bg_settings` 에 저장. 이전 버전 저장값엔 AI 필드가 없어 기본값 위에 덮는다.
- AI 미리보기는 긴 변 1024 로 원본 미리보기(600)보다 크다 → 결과 `<img>` 를 원본 미리보기의 natural 크기로 그려 좌우를 맞춘다.
- 미리보기 응답은 요청 번호로 걸러 늦게 온 이전 응답이 최신 결과를 덮지 않게 한다(추론이 수 초라 실제로 겹친다).
- 모델이 없으면 결과 패널에 다운로드 버튼(받을 용량 합산)과 진행률(Channel)이 뜬다.

## 실측 테스트

```bash
QF_AI_BG_SAMPLES=<이미지 폴더> cargo test -p quickfolder-core --test ai_bg -- --ignored --nocapture
```

실제 다운로드 → 검증 → 추론 → 저장까지 돌리고 모델별 `{stem}_nobg_{model}.png` 를 남긴다.
품질은 결과를 눈으로 본다. 테스트 샘플로는 rembg 저장소 `examples/` 를 쓰면 된다.
