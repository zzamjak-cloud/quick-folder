//! 배치 픽셀화 동시성 벤치마크
//!
//! 같은 입력을 서로 다른 동시성으로 처리해 비교한다. 3단계의 성능 가설 확인용.
//!
//! 기준선(baseline)은 GUI 경로의 실효 동시성이다. pixelate/resize/compress는
//! HeavyOpPermit(MAX_HEAVY_OPS=3)을 잡지 않으므로 GUI에서는 프론트 큐
//! (utils/tauriInvoke.ts MAX_CONCURRENT=6)가 상한이다. 썸네일 계열은 퍼밋이 걸려 3이다.
//!
//! 실행: cargo run --release -p quickfolder-core --example bench_pixelate -- [장수] [해상도] [기준동시성]

use std::path::PathBuf;
use std::time::Instant;

use quickfolder_core::batch::{default_jobs, summarize};
use quickfolder_core::image_ops::{run_image_batch, ImageBatchOp};
use quickfolder_core::progress::null_sink;

fn make_inputs(dir: &PathBuf, count: usize, size: u32) {
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir).expect("입력 디렉토리 생성 실패");
    for i in 0..count {
        let img = image::RgbaImage::from_fn(size, size, |x, y| {
            image::Rgba([
                ((x + i as u32) % 256) as u8,
                ((y * 3) % 256) as u8,
                ((x ^ y) % 256) as u8,
                255,
            ])
        });
        img.save_with_format(dir.join(format!("img{:03}.png", i)), image::ImageFormat::Png)
            .expect("입력 이미지 저장 실패");
    }
}

fn run(dir: &PathBuf, jobs: usize) -> (std::time::Duration, usize) {
    let started = Instant::now();
    let outcomes = quickfolder_core::runtime::block_on(run_image_batch(
        vec![dir.clone()],
        false,
        ImageBatchOp::Pixelate {
            pixel_size: 6,
            scale: 0,
            max_colors: 32,
        },
        jobs,
        null_sink(),
    ));
    let elapsed = started.elapsed();
    let summary = summarize(&outcomes);
    // 출력물(_pixel.png)을 지워 다음 회차 입력 집합을 동일하게 유지
    for outcome in outcomes.into_iter().filter_map(|o| o.result.ok()) {
        let _ = std::fs::remove_file(outcome);
    }
    assert_eq!(summary.failed, 0, "벤치 중 실패 {}건", summary.failed);
    (elapsed, summary.succeeded)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let count: usize = args.next().and_then(|v| v.parse().ok()).unwrap_or(120);
    let size: u32 = args.next().and_then(|v| v.parse().ok()).unwrap_or(512);
    let baseline: usize = args.next().and_then(|v| v.parse().ok()).unwrap_or(6);

    let dir = std::env::temp_dir().join("qf_bench_pixelate");
    println!("입력 생성: {}장 {}x{} → {}", count, size, size, dir.display());
    make_inputs(&dir, count, size);

    let cores = default_jobs();
    println!("논리 코어: {}", cores);

    // 캐시·페이지 워밍 (첫 회차가 불리해지지 않도록)
    let _ = run(&dir, cores);

    let (gui_time, n) = run(&dir, baseline);
    let (cli_time, _) = run(&dir, cores);

    println!();
    println!("처리 장수: {}", n);
    println!("GUI 경로 동시성({:<2}) : {:>8.2}초", baseline, gui_time.as_secs_f64());
    println!("CLI 경로 동시성({:<2}) : {:>8.2}초", cores, cli_time.as_secs_f64());
    println!("배율               : {:>8.2}x", gui_time.as_secs_f64() / cli_time.as_secs_f64());

    let _ = std::fs::remove_dir_all(&dir);
}
