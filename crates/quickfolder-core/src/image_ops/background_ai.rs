//! AI 배경 제거
//!
//! 색상 기반 배경 제거(`background.rs`)는 단색 배경에서만 동작한다. 이 모듈은 세그멘테이션
//! 모델(ISNet·BiRefNet, ONNX)로 전경 마스크를 추론해 사진·복잡한 배경에서도 피사체를 분리한다.
//!
//! - `runtime`: ONNX Runtime·모델 내려받기, 검증, 세션 관리
//! - `models`: 모델 카탈로그(배포 URL, sha256, 전처리 규칙)
//! - `matte`: 전처리, 마스크 → 알파 합성(경계 정밀화·색 번짐 제거)
//!
//! 추론(1~수 초)은 파일·모델별로 한 번만 하고 마스크를 캐시한다. 미리보기 슬라이더를
//! 움직일 때는 합성만 다시 하므로 즉시 반영되고, 저장도 미리본 마스크를 그대로 쓴다.

mod matte;
mod models;
mod runtime;

use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, Result};
use crate::helpers::find_unique_path;
use crate::progress::Progress;

pub use models::DEFAULT_MODEL_ID;

/// 다운로드 진행률 (`stage`: "runtime" | "model")
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBgDownloadProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: u64,
}

/// 후처리 옵션
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiBgOptions {
    /// 잔여 반투명 제거 (0-100)
    pub cutoff: u8,
    /// 경계 선명도 (0-100, 높을수록 이진 마스크에 가까움)
    pub sharpness: u8,
    /// 원본 윤곽 기준 경계 정밀화
    pub refine_edges: bool,
    /// 경계 픽셀의 배경색 번짐 제거
    pub decontaminate: bool,
}

impl Default for AiBgOptions {
    fn default() -> Self {
        Self {
            cutoff: 5,
            sharpness: 0,
            // 실측상 효과가 작고 모델보다 작은 이미지에서는 쓰이지도 않아 선택 사항으로 둔다
            refine_edges: false,
            decontaminate: true,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBgModelStatus {
    pub id: String,
    pub size_bytes: u64,
    pub installed: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBgStatus {
    pub supported: bool,
    pub unsupported_reason: Option<String>,
    pub runtime_installed: bool,
    pub runtime_size_bytes: u64,
    pub default_model: String,
    pub models: Vec<AiBgModelStatus>,
}

fn resolve_model(id: &str) -> Result<&'static models::AiBgModel> {
    models::find_model(id)
        .ok_or_else(|| AppError::InvalidInput(format!("알 수 없는 AI 배경 제거 모델: {id}")))
}

/// 설치 상태 조회
pub async fn ai_bg_status() -> Result<AiBgStatus> {
    let unsupported_reason = runtime::unsupported_reason();
    Ok(AiBgStatus {
        supported: unsupported_reason.is_none(),
        unsupported_reason,
        runtime_installed: runtime::is_runtime_installed(),
        runtime_size_bytes: runtime::runtime_download_size(),
        default_model: DEFAULT_MODEL_ID.to_string(),
        models: models::MODELS
            .iter()
            .map(|m| AiBgModelStatus {
                id: m.id.to_string(),
                size_bytes: m.size_bytes,
                installed: runtime::is_model_installed(m),
            })
            .collect(),
    })
}

/// 런타임과 모델을 내려받는다 (이미 있으면 건너뜀)
pub async fn ai_bg_install(
    model: String,
    on_progress: Progress<AiBgDownloadProgress>,
) -> Result<()> {
    let model = resolve_model(&model)?;
    tokio::task::spawn_blocking(move || runtime::install(model, &on_progress))
        .await
        .map_err(|e| AppError::Internal(format!("AI 모델 설치 태스크 실패: {e}")))?
}

// ─── 마스크 캐시 ───────────────────────────────────────────────────────────

/// 파일 내용이 바뀌면 다시 추론하도록 크기·수정 시각까지 키에 넣는다
#[derive(Clone, PartialEq, Eq)]
struct MaskKey {
    path: String,
    len: u64,
    modified: Option<std::time::SystemTime>,
    model: &'static str,
}

/// 최근 마스크 몇 장만 보관 (1024² f32 = 4MB/장)
const MASK_CACHE_CAPACITY: usize = 6;
static MASK_CACHE: Mutex<Vec<(MaskKey, Arc<matte::Plane>)>> = Mutex::new(Vec::new());

fn mask_for(
    path: &str,
    img: &image::RgbaImage,
    model: &'static models::AiBgModel,
) -> Result<Arc<matte::Plane>> {
    let meta = std::fs::metadata(path)?;
    let key = MaskKey {
        path: path.to_string(),
        len: meta.len(),
        modified: meta.modified().ok(),
        model: model.id,
    };

    {
        let mut cache = MASK_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pos) = cache.iter().position(|(k, _)| *k == key) {
            // 최근 사용 항목을 뒤로 보내 LRU 순서를 유지
            let entry = cache.remove(pos);
            let mask = entry.1.clone();
            cache.push(entry);
            return Ok(mask);
        }
    }

    let input = matte::preprocess(img, model);
    let raw = runtime::run_model(model, input)?;
    let mask = Arc::new(matte::normalize_mask(raw, model));

    let mut cache = MASK_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if cache.len() >= MASK_CACHE_CAPACITY {
        cache.remove(0);
    }
    cache.push((key, mask.clone()));
    Ok(mask)
}

fn open_rgba(path: &str) -> Result<image::RgbaImage> {
    image::open(path)
        .map(|img| img.to_rgba8())
        .map_err(|e| AppError::ImageProcessing(format!("이미지 열기 실패 ({path}): {e}")))
}

// ─── 미리보기·저장 ─────────────────────────────────────────────────────────

/// 미리보기 긴 변 상한 — 경계 품질을 확대해서 볼 수 있게 색상 기반(600)보다 크게 둔다
const PREVIEW_MAX_SIDE: u32 = 1024;

/// 미리보기 (base64 PNG)
pub async fn ai_bg_preview(input: String, model: String, options: AiBgOptions) -> Result<String> {
    let model = resolve_model(&model)?;
    tokio::task::spawn_blocking(move || {
        let img = open_rgba(&input)?;
        let mask = mask_for(&input, &img, model)?;

        let (w, h) = img.dimensions();
        let preview = if w.max(h) > PREVIEW_MAX_SIDE {
            let s = PREVIEW_MAX_SIDE as f32 / w.max(h) as f32;
            image::imageops::resize(
                &img,
                ((w as f32 * s).round() as u32).max(1),
                ((h as f32 * s).round() as u32).max(1),
                image::imageops::FilterType::Triangle,
            )
        } else {
            img
        };
        let result = matte::compose(&preview, &mask, &options);

        let mut buf = vec![];
        image::DynamicImage::ImageRgba8(result)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| AppError::Internal(format!("AI 배경 제거 미리보기 실패: {e}")))?
}

/// 저장 (다중 파일). 결과는 원본 옆 `{stem}_nobg.png`.
pub async fn ai_bg_save(
    inputs: Vec<String>,
    model: String,
    options: AiBgOptions,
    trim: bool,
) -> Result<Vec<String>> {
    let model = resolve_model(&model)?;
    tokio::task::spawn_blocking(move || {
        let mut outputs = Vec::with_capacity(inputs.len());
        for input in &inputs {
            let img = open_rgba(input)?;
            let mask = mask_for(input, &img, model)?;
            let mut result = matte::compose(&img, &mask, &options);
            if trim {
                result = super::background::trim_transparent(result);
            }

            let input_path = Path::new(input);
            let parent = input_path.parent().unwrap_or(Path::new("."));
            let stem = input_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("image");
            let output_path = find_unique_path(parent, stem, "_nobg", ".png");
            image::DynamicImage::ImageRgba8(result)
                .save_with_format(&output_path, image::ImageFormat::Png)?;

            outputs.push(
                output_path
                    .to_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))?,
            );
        }
        Ok(outputs)
    })
    .await
    .map_err(|e| AppError::Internal(format!("AI 배경 제거 저장 실패: {e}")))?
}
