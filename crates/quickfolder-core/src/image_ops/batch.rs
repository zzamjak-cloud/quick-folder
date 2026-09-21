//! 이미지 배치 연산
//!
//! 폴더 단위로 같은 이미지 연산을 적용한다. CLI·MCP가 이 진입점 하나만 호출하면 되도록
//! 연산 종류를 열거형으로 묶었다. 각 연산은 기존 단건 함수를 그대로 호출하므로
//! GUI에서 쓰는 결과와 동일하다.

use std::path::{Path, PathBuf};

use crate::batch::{collect_files, run_batch, BatchOutcome, BatchProgress};
use crate::error::{AppError, Result};
use crate::progress::Progress;

/// 이미지 배치 연산 종류
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ImageBatchOp {
    /// 픽셀화 (+ 선택적 컬러 양자화)
    Pixelate {
        pixel_size: u32,
        #[serde(default)]
        scale: u32,
        #[serde(default)]
        max_colors: u32,
    },
    /// 지정 크기로 리샘플링
    Resize { width: u32, height: u32 },
    /// 품질 프리셋 압축 (low | medium | high)
    Compress { quality: String },
    /// 영역 잘라내기
    Crop {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    /// ICO 변환
    ToIco,
    /// ICNS 변환
    ToIcns,
    /// 흰 배경 제거
    RemoveWhiteBg {
        threshold: u8,
        #[serde(default)]
        feather: u8,
        #[serde(default)]
        trim: bool,
    },
}

/// 배치 대상 기본 확장자
const DEFAULT_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];

impl ImageBatchOp {
    /// 이 연산이 입력으로 받을 확장자 목록
    pub fn input_extensions(&self) -> Vec<String> {
        DEFAULT_EXTS.iter().map(|e| e.to_string()).collect()
    }

    /// 이 연산이 붙이는 출력 파일 접미사.
    ///
    /// 폴더를 대상으로 두 번 실행했을 때 자기 출력물을 다시 입력으로 먹는 것을
    /// 막는 데 쓴다. 확장자만 바뀌는 연산(ICO/ICNS)은 대상 확장자 목록에
    /// 애초에 포함되지 않으므로 `None`이다.
    pub fn output_suffix(&self) -> Option<String> {
        match self {
            Self::Pixelate { .. } => Some("_pixel".to_string()),
            Self::Resize { width, height } => Some(format!("_{}x{}", width, height)),
            Self::Compress { .. } => Some("_compressed".to_string()),
            Self::Crop { .. } => Some("_crop".to_string()),
            Self::RemoveWhiteBg { .. } => Some("_nobg".to_string()),
            Self::ToIco | Self::ToIcns => None,
        }
    }

    /// 파일 한 건에 연산을 적용하고 출력 경로를 돌려준다.
    pub async fn apply(&self, input: PathBuf) -> Result<String> {
        let path = input
            .to_str()
            .ok_or_else(|| AppError::InvalidInput(format!("경로 변환 실패: {}", input.display())))?
            .to_string();

        match self.clone() {
            Self::Pixelate {
                pixel_size,
                scale,
                max_colors,
            } => super::pixelate_image(path, pixel_size, scale, max_colors).await,
            Self::Resize { width, height } => super::resize_image(path, width, height).await,
            Self::Compress { quality } => super::compress_image(path, quality).await,
            Self::Crop {
                x,
                y,
                width,
                height,
            } => super::crop_image(path, x, y, width, height).await,
            Self::ToIco => super::convert_to_ico(path).await,
            Self::ToIcns => super::convert_to_icns(path).await,
            Self::RemoveWhiteBg {
                threshold,
                feather,
                trim,
            } => {
                let outputs =
                    super::remove_white_bg_save(vec![path], threshold, feather, vec![], trim)
                        .await?;
                outputs
                    .into_iter()
                    .next()
                    .ok_or_else(|| AppError::Internal("배경 제거 결과가 비어 있습니다".to_string()))
            }
        }
    }
}

/// 이 파일이 해당 연산의 출력물인지 판별한다.
/// `name_pixel.png`, 충돌 시 붙는 `name_pixel_2.png` 형태를 모두 잡는다.
fn is_own_output(path: &Path, suffix: &str) -> bool {
    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    if stem.ends_with(suffix) {
        return true;
    }
    // {suffix}_{숫자} 로 끝나는 경우
    match stem.rsplit_once('_') {
        Some((head, tail)) => !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) && head.ends_with(suffix),
        None => false,
    }
}

/// 폴더·파일 목록에 이미지 연산을 일괄 적용한다.
///
/// `jobs`가 0이면 논리 코어 수를 쓴다. 한 파일의 실패는 그 항목만 실패로 남고
/// 나머지는 계속 처리된다.
///
/// 폴더를 훑어 찾은 파일 중 **이 연산이 이전에 만든 출력물은 건너뛴다**
/// (예: `a_pixel.png`). 같은 폴더에 두 번 실행해도 결과가 겹겹이 쌓이지 않는다.
/// 파일 경로를 직접 지정한 경우에는 의도적 재처리로 보고 그대로 처리한다.
pub async fn run_image_batch(
    roots: Vec<PathBuf>,
    recursive: bool,
    op: ImageBatchOp,
    jobs: usize,
    on_progress: Progress<BatchProgress>,
) -> Vec<BatchOutcome<String>> {
    let explicit: std::collections::HashSet<PathBuf> =
        roots.iter().filter(|r| r.is_file()).cloned().collect();
    let suffix = op.output_suffix();
    let inputs: Vec<PathBuf> = collect_files(&roots, recursive, &op.input_extensions())
        .into_iter()
        .filter(|path| match &suffix {
            Some(suffix) => explicit.contains(path) || !is_own_output(path, suffix),
            None => true,
        })
        .collect();
    let jobs = if jobs == 0 {
        crate::batch::default_jobs()
    } else {
        jobs
    };
    run_batch(inputs, jobs, on_progress, move |path| {
        let op = op.clone();
        async move { op.apply(path).await }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::batch::summarize;
    use crate::progress::null_sink;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_imgbatch_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_png(dir: &PathBuf, name: &str, size: u32) {
        let img = image::RgbaImage::from_fn(size, size, |x, y| {
            image::Rgba([(x * 3) as u8, (y * 3) as u8, 128, 255])
        });
        img.save_with_format(dir.join(name), image::ImageFormat::Png)
            .unwrap();
    }

    #[test]
    fn pixelate_batch_processes_every_image_and_isolates_a_broken_file() {
        let dir = temp_dir("pixelate");
        write_png(&dir, "a.png", 32);
        write_png(&dir, "b.png", 48);
        // 확장자만 이미지인 깨진 파일 — 이 건만 실패해야 한다
        std::fs::write(dir.join("broken.png"), b"not an image").unwrap();

        let outcomes = crate::runtime::block_on(run_image_batch(
            vec![dir.clone()],
            false,
            ImageBatchOp::Pixelate {
                pixel_size: 4,
                scale: 0,
                max_colors: 0,
            },
            4,
            null_sink(),
        ));

        let summary = summarize(&outcomes);
        assert_eq!(summary.total, 3, "png 3건이 수집돼야 한다");
        assert_eq!(summary.failed, 1, "깨진 파일만 실패");
        assert_eq!(summary.succeeded, 2);

        for outcome in outcomes.iter().filter(|o| o.is_ok()) {
            let out = outcome.result.as_ref().unwrap();
            assert!(out.ends_with("_pixel.png"), "출력 파일명 규칙: {}", out);
            assert!(std::path::Path::new(out).exists(), "출력 파일이 있어야 한다");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rerunning_a_folder_skips_its_own_outputs() {
        let dir = temp_dir("rerun");
        write_png(&dir, "a.png", 24);
        write_png(&dir, "b.png", 24);

        let op = ImageBatchOp::Pixelate {
            pixel_size: 4,
            scale: 0,
            max_colors: 0,
        };
        let first = crate::runtime::block_on(run_image_batch(
            vec![dir.clone()],
            false,
            op.clone(),
            2,
            null_sink(),
        ));
        assert_eq!(summarize(&first).succeeded, 2);

        // 두 번째 실행: 원본 2건만 다시 처리하고 1차 출력물(_pixel.png)은 건너뛴다
        let second = crate::runtime::block_on(run_image_batch(
            vec![dir.clone()],
            false,
            op.clone(),
            2,
            null_sink(),
        ));
        assert_eq!(summarize(&second).total, 2, "원본 2건만 대상이어야 한다");
        for outcome in &second {
            let stem = outcome.input.file_stem().unwrap().to_string_lossy().to_string();
            assert!(
                !stem.contains("_pixel"),
                "출력물이 입력으로 들어왔다: {}",
                outcome.input.display()
            );
        }

        // 3차 출력물이 2차 출력물을 먹지 않았는지 — _pixel_pixel 같은 파일이 없어야 한다
        for entry in std::fs::read_dir(&dir).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            assert!(!name.contains("_pixel_pixel"), "중첩 처리 발생: {}", name);
        }

        // 파일을 직접 지정하면 의도적 재처리로 보고 처리한다
        let explicit = crate::runtime::block_on(run_image_batch(
            vec![dir.join("a_pixel.png")],
            false,
            op,
            1,
            null_sink(),
        ));
        assert_eq!(summarize(&explicit).succeeded, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resize_batch_matches_single_call_result() {
        let dir = temp_dir("resize");
        write_png(&dir, "one.png", 40);

        let batch = crate::runtime::block_on(run_image_batch(
            vec![dir.clone()],
            false,
            ImageBatchOp::Resize {
                width: 16,
                height: 12,
            },
            1,
            null_sink(),
        ));
        assert_eq!(summarize(&batch).succeeded, 1);
        let out = batch[0].result.as_ref().unwrap();
        let img = image::open(out).unwrap();
        assert_eq!((img.width(), img.height()), (16, 12));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
