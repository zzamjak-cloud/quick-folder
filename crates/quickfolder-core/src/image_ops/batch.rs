//! 이미지 배치 연산
//!
//! 폴더 단위로 같은 이미지 연산을 적용한다. CLI·MCP가 이 진입점 하나만 호출하면 되도록
//! 연산 종류를 열거형으로 묶었다. 각 연산은 기존 단건 함수를 그대로 호출하므로
//! GUI에서 쓰는 결과와 동일하다.

use std::path::PathBuf;

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

/// 폴더·파일 목록에 이미지 연산을 일괄 적용한다.
///
/// `jobs`가 0이면 논리 코어 수를 쓴다. 한 파일의 실패는 그 항목만 실패로 남고
/// 나머지는 계속 처리된다.
pub async fn run_image_batch(
    roots: Vec<PathBuf>,
    recursive: bool,
    op: ImageBatchOp,
    jobs: usize,
    on_progress: Progress<BatchProgress>,
) -> Vec<BatchOutcome<String>> {
    let inputs = collect_files(&roots, recursive, &op.input_extensions());
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
