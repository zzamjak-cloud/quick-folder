//! AI 배경 제거 런타임 관리
//!
//! ONNX Runtime 라이브러리와 모델 파일의 설치·검증·로드를 맡는다.
//!
//! 배포 정책: 설치 파일 크기를 늘리지 않도록 아무것도 번들하지 않는다. 최초 사용 시
//! Microsoft 공식 릴리스(ONNX Runtime, MIT)와 rembg 릴리스(모델)에서 사용자 기기로 직접
//! 내려받고, 고정해 둔 sha256 과 대조한 뒤에만 사용한다.
//!
//! 저장 위치는 GUI·CLI·MCP 가 함께 쓰도록 ffmpeg 와 같은 데이터 폴더 아래에 둔다.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use sha2::{Digest, Sha256};

use super::models::AiBgModel;
use super::AiBgDownloadProgress;
use crate::error::{AppError, Result};
use crate::progress::Progress;

const TOOL_NAME: &str = "AI 배경 제거";

/// 내려받는 ONNX Runtime 버전. `ort` crate 의 `api-31` feature 와 맞춰야 한다
/// (그보다 낮은 버전 런타임은 `ort` 가 로드를 거부한다).
const ORT_VERSION: &str = "1.31.0";

/// 플랫폼별 ONNX Runtime 배포 자산
struct RuntimeAsset {
    url: &'static str,
    sha256: &'static str,
    size_bytes: u64,
    /// 압축 파일 안의 라이브러리 경로 (최상위 폴더 이름 제외)
    entry: &'static str,
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const RUNTIME_ASSET: Option<RuntimeAsset> = Some(RuntimeAsset {
    url: "https://github.com/microsoft/onnxruntime/releases/download/v1.31.0/onnxruntime-win-x64-1.31.0.zip",
    sha256: "3958d8a44984160692c1b4ffd0de3cb48f8c39f9d34bb31e433db06e30b82195",
    size_bytes: 82_887_349,
    entry: "lib/onnxruntime.dll",
});

#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
const RUNTIME_ASSET: Option<RuntimeAsset> = Some(RuntimeAsset {
    url: "https://github.com/microsoft/onnxruntime/releases/download/v1.31.0/onnxruntime-win-arm64-1.31.0.zip",
    sha256: "ef6206fa8d6975878d93a97035d280240ce5764c126a7430e5427e18923316d5",
    size_bytes: 85_806_468,
    entry: "lib/onnxruntime.dll",
});

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const RUNTIME_ASSET: Option<RuntimeAsset> = Some(RuntimeAsset {
    url: "https://github.com/microsoft/onnxruntime/releases/download/v1.31.0/onnxruntime-osx-arm64-1.31.0.tgz",
    sha256: "1031b36dd3bdaa8d976a6130d9cf2a05e9be320b93ae804f8427b91dc3432afc",
    size_bytes: 36_549_009,
    entry: "lib/libonnxruntime.dylib",
});

// Microsoft 는 1.2x 이후 Intel Mac(osx-x86_64) 빌드를 배포하지 않는다
#[cfg(not(any(
    all(target_os = "windows", any(target_arch = "x86_64", target_arch = "aarch64")),
    all(target_os = "macos", target_arch = "aarch64")
)))]
const RUNTIME_ASSET: Option<RuntimeAsset> = None;

/// 이 플랫폼에서 쓸 수 없으면 그 이유
pub fn unsupported_reason() -> Option<String> {
    if RUNTIME_ASSET.is_some() {
        return None;
    }
    if cfg!(target_os = "macos") {
        Some("Intel Mac 은 ONNX Runtime 공식 배포본이 없어 지원하지 않습니다.".to_string())
    } else {
        Some("이 플랫폼은 AI 배경 제거를 지원하지 않습니다.".to_string())
    }
}

/// 런타임 압축 파일 크기 (UI 의 다운로드 용량 안내용)
pub fn runtime_download_size() -> u64 {
    RUNTIME_ASSET.as_ref().map_or(0, |a| a.size_bytes)
}

// ─── 경로 ─────────────────────────────────────────────────────────────────

fn ai_root() -> Result<PathBuf> {
    dirs::data_dir()
        .map(|d| d.join("QuickFolder Widget").join("ai_bg"))
        .ok_or_else(|| AppError::Internal("애플리케이션 데이터 경로를 찾을 수 없습니다.".to_string()))
}

fn runtime_lib_path() -> Result<PathBuf> {
    let file = if cfg!(target_os = "windows") {
        "onnxruntime.dll"
    } else {
        "libonnxruntime.dylib"
    };
    Ok(ai_root()?.join(format!("runtime-{ORT_VERSION}")).join(file))
}

pub fn model_path(model: &AiBgModel) -> Result<PathBuf> {
    Ok(ai_root()?.join("models").join(model.file_name))
}

pub fn is_runtime_installed() -> bool {
    runtime_lib_path().map(|p| p.is_file()).unwrap_or(false)
}

/// 모델 파일 존재 여부. 내려받기는 `.part` 에 쓴 뒤 해시 검증을 통과해야 이 이름으로
/// 옮기므로, 이름이 있으면 검증된 파일이다.
pub fn is_model_installed(model: &AiBgModel) -> bool {
    model_path(model).map(|p| p.is_file()).unwrap_or(false)
}

// ─── 내려받기 ─────────────────────────────────────────────────────────────

/// 설치가 겹치지 않게 막는다 (같은 `.part` 파일에 두 스트림이 쓰는 것 방지)
static INSTALL_LOCK: Mutex<()> = Mutex::new(());

/// 런타임과 모델을 필요한 것만 내려받는다.
pub fn install(model: &AiBgModel, progress: &Progress<AiBgDownloadProgress>) -> Result<()> {
    let _guard = INSTALL_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    if !is_runtime_installed() {
        install_runtime(progress)?;
    }
    if !is_model_installed(model) {
        let dest = model_path(model)?;
        download_verified(
            model.url,
            &dest,
            model.sha256,
            model.size_bytes,
            "model",
            progress,
        )?;
    }
    Ok(())
}

fn install_runtime(progress: &Progress<AiBgDownloadProgress>) -> Result<()> {
    let asset = RUNTIME_ASSET.as_ref().ok_or_else(|| {
        AppError::UnsupportedPlatform(unsupported_reason().unwrap_or_default())
    })?;
    let lib_path = runtime_lib_path()?;
    let dir = lib_path
        .parent()
        .ok_or_else(|| AppError::Internal("런타임 경로가 올바르지 않습니다.".to_string()))?;
    std::fs::create_dir_all(dir)?;

    let archive = dir.join(if asset.url.ends_with(".zip") {
        "runtime.zip"
    } else {
        "runtime.tgz"
    });
    download_verified(
        asset.url,
        &archive,
        asset.sha256,
        asset.size_bytes,
        "runtime",
        progress,
    )?;

    let extracted = extract_runtime_lib(&archive, asset.entry, &lib_path);
    let _ = std::fs::remove_file(&archive);
    extracted
}

/// 압축 파일에서 라이브러리 한 개만 꺼낸다.
/// 최상위 폴더 이름(`onnxruntime-win-x64-1.31.0/`)은 버전마다 달라서 뒷부분으로 찾는다.
fn extract_runtime_lib(archive: &Path, entry: &str, dest: &Path) -> Result<()> {
    let tmp = dest.with_extension("part");
    let found = if archive.extension().is_some_and(|e| e == "zip") {
        extract_from_zip(archive, entry, &tmp)?
    } else {
        extract_from_tgz(archive, entry, &tmp)?
    };
    if !found {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::ToolInstallation {
            tool: TOOL_NAME.to_string(),
            reason: format!("내려받은 런타임에서 {entry} 를 찾지 못했습니다."),
        });
    }
    std::fs::rename(&tmp, dest)?;
    Ok(())
}

fn extract_from_zip(archive: &Path, entry: &str, out: &Path) -> Result<bool> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?)?;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        if file.is_file() && file.name().ends_with(&format!("/{entry}")) {
            let mut target = std::fs::File::create(out)?;
            std::io::copy(&mut file, &mut target)?;
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(target_os = "macos")]
fn extract_from_tgz(archive: &Path, entry: &str, out: &Path) -> Result<bool> {
    let gz = flate2::read::GzDecoder::new(std::fs::File::open(archive)?);
    let mut tar = tar::Archive::new(gz);
    for item in tar.entries()? {
        let mut item = item?;
        // 심볼릭 링크(libonnxruntime.1.dylib 등)는 건너뛰고 실제 파일만 꺼낸다
        if !item.header().entry_type().is_file() {
            continue;
        }
        let matches = item
            .path()?
            .to_string_lossy()
            .replace('\\', "/")
            .ends_with(&format!("/{entry}"));
        if matches {
            let mut target = std::fs::File::create(out)?;
            std::io::copy(&mut item, &mut target)?;
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(out, std::fs::Permissions::from_mode(0o755));
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
fn extract_from_tgz(_archive: &Path, _entry: &str, _out: &Path) -> Result<bool> {
    Ok(false)
}

fn download_error(reason: String) -> AppError {
    AppError::ToolDownload {
        tool: TOOL_NAME.to_string(),
        reason,
    }
}

/// `url` 을 `dest` 로 내려받으며 sha256 을 검증한다.
///
/// `.part` 에 쓴 뒤 검증을 통과해야 `dest` 로 옮긴다 — 중간에 끊기거나 변조된 파일이
/// 설치된 것으로 보이지 않게 하기 위함이다. 진행률 수신자가 사라지면(모달 닫힘) 중단한다.
fn download_verified(
    url: &str,
    dest: &Path,
    expected_sha256: &str,
    expected_size: u64,
    stage: &str,
    progress: &Progress<AiBgDownloadProgress>,
) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let part = dest.with_extension("part");

    let result = (|| -> Result<()> {
        let mut response = ureq::get(url)
            .call()
            .map_err(|e| download_error(format!("HTTP GET 실패 ({url}): {e}")))?;
        // 예상 크기보다 조금 넉넉하게만 허용 — 엉뚱한 응답이 디스크를 채우지 않도록
        let mut reader = response
            .body_mut()
            .with_config()
            .limit(expected_size + 1024 * 1024)
            .reader();
        let mut file = std::fs::File::create(&part)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let mut downloaded: u64 = 0;
        let mut last_reported: u64 = 0;

        let report = |downloaded: u64| {
            progress.send(AiBgDownloadProgress {
                stage: stage.to_string(),
                downloaded,
                total: expected_size,
            })
        };
        if !report(0) {
            return Err(AppError::Cancelled("다운로드가 취소되었습니다.".to_string()));
        }

        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| download_error(format!("본문 읽기 실패: {e}")))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])?;
            hasher.update(&buf[..n]);
            downloaded += n as u64;
            // 1MB 마다 보고 — Channel 메시지 폭주 방지
            if downloaded - last_reported >= 1024 * 1024 {
                last_reported = downloaded;
                if !report(downloaded) {
                    return Err(AppError::Cancelled("다운로드가 취소되었습니다.".to_string()));
                }
            }
        }
        file.flush()?;
        drop(file);
        report(downloaded);

        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_sha256) {
            return Err(download_error(format!(
                "파일 검증 실패 (sha256 불일치): {url}"
            )));
        }
        std::fs::rename(&part, dest)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result
}

// ─── 추론 세션 ─────────────────────────────────────────────────────────────

struct EngineState {
    env: Option<ort::environment::Environment>,
    /// 마지막으로 쓴 모델의 세션. 모델 로드(수백 MB)가 1초 안팎 걸려 재사용한다.
    session: Option<(&'static str, ort::session::Session)>,
}

static ENGINE: Mutex<EngineState> = Mutex::new(EngineState {
    env: None,
    session: None,
});

/// 모델 입력 텐서(NCHW f32)로 추론해 1채널 확률 마스크(입력 크기 그대로)를 돌려준다.
/// 세션은 하나뿐이라 호출은 직렬화된다 — ONNX Runtime 이 내부에서 코어를 모두 쓰므로
/// 동시에 돌려도 빨라지지 않고 메모리만 늘어난다.
pub fn run_model(model: &'static AiBgModel, input: Vec<f32>) -> Result<Vec<f32>> {
    if !is_runtime_installed() || !is_model_installed(model) {
        return Err(AppError::ToolNotFound {
            tool: format!(
                "{TOOL_NAME} 모델({}) — 앱의 배경 제거 창에서 AI 모드를 선택해 먼저 내려받으세요",
                model.id
            ),
        });
    }

    let mut state = ENGINE.lock().unwrap_or_else(|e| e.into_inner());

    if state.env.is_none() {
        let lib = runtime_lib_path()?;
        let env = ort::init_from(&lib)
            .map_err(|e| ort_error("ONNX Runtime 로드 실패", e))?
            .with_name("quickfolder")
            .build()
            .map_err(|e| ort_error("ONNX Runtime 초기화 실패", e))?;
        state.env = Some(env);
    }

    if state.session.as_ref().map(|(id, _)| *id) != Some(model.id) {
        // 이전 모델 세션을 먼저 내려 메모리를 돌려준다
        state.session = None;
        let env = state.env.as_ref().expect("위에서 초기화됨");
        let session = ort::session::Session::builder(env)
            .map_err(|e| ort_error("세션 생성 실패", e))?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::All)
            .map_err(|e| ort_error("세션 옵션 설정 실패", e))?
            .commit_from_file(model_path(model)?)
            .map_err(|e| ort_error("모델 로드 실패", e))?;
        state.session = Some((model.id, session));
    }

    let (_, session) = state.session.as_mut().expect("위에서 생성됨");
    let size = model.input_size as usize;
    let tensor = ort::value::Tensor::from_array(([1usize, 3, size, size], input))
        .map_err(|e| ort_error("입력 텐서 생성 실패", e))?;
    let outputs = session
        .run(ort::inputs![tensor])
        .map_err(|e| ort_error("추론 실패", e))?;
    let (shape, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| ort_error("출력 해석 실패", e))?;

    // 출력은 [1, 1, H, W] — 첫 채널만 쓴다
    let plane = size * size;
    if data.len() < plane || shape.iter().rev().take(2).any(|&d| d as usize != size) {
        return Err(AppError::Internal(format!(
            "예상하지 못한 모델 출력 형태: {:?}",
            shape
        )));
    }
    Ok(data[..plane].to_vec())
}

fn ort_error(context: &str, e: impl std::fmt::Display) -> AppError {
    AppError::ToolExecution {
        tool: TOOL_NAME.to_string(),
        reason: format!("{context}: {e}"),
    }
}
