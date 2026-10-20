//! AI 배경 제거 실측 테스트
//!
//! ONNX Runtime 과 모델(수백 MB)을 실제로 내려받고 추론하므로 기본 실행에서 제외한다.
//! 받은 파일은 앱과 같은 데이터 폴더에 남아 이후 앱에서도 그대로 쓰인다.
//!
//! ```text
//! QF_AI_BG_SAMPLES=<이미지 폴더> cargo test -p quickfolder-core --test ai_bg -- --ignored --nocapture
//! ```
//!
//! 폴더 안 jpg/png 마다 모델별 `{stem}_nobg.png` 를 만든다. 품질은 결과 파일을 눈으로 확인한다.
//! 이 테스트가 자동으로 고정하는 것은 "설치·추론·합성 경로가 끝까지 돌고, 모델마다 투명 배경과
//! 불투명 전경이 함께 있는 결과가 하나 이상 나온다" 까지다. (애니 전용 모델에 실사 사진처럼
//! 모델과 맞지 않는 이미지는 전경을 못 잡는 게 정상이라 이미지별로는 단언하지 않는다.)

use quickfolder_core::progress::null_sink;
use quickfolder_core::runtime::block_on;
use quickfolder_core::{ai_bg_install, ai_bg_preview, ai_bg_save, ai_bg_status, AiBgOptions};

#[test]
#[ignore = "네트워크로 런타임·모델을 내려받는다"]
fn removes_background_from_samples() {
    let dir = std::env::var("QF_AI_BG_SAMPLES").expect("QF_AI_BG_SAMPLES 를 지정하세요");
    let status = block_on(ai_bg_status()).expect("상태 조회 실패");
    assert!(status.supported, "{:?}", status.unsupported_reason);

    let mut inputs: Vec<String> = std::fs::read_dir(&dir)
        .expect("샘플 폴더 읽기 실패")
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy().to_lowercase();
            (name.ends_with(".jpg") || name.ends_with(".png")) && !name.contains("_nobg")
        })
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    inputs.sort();
    assert!(!inputs.is_empty(), "샘플 이미지가 없습니다");

    for model in status.models.iter().map(|m| m.id.clone()) {
        let started = std::time::Instant::now();
        block_on(ai_bg_install(model.clone(), null_sink())).expect("설치 실패");
        eprintln!("[{model}] 설치 확인 {:?}", started.elapsed());
        let mut separated = 0;

        for input in &inputs {
            let started = std::time::Instant::now();
            let preview = block_on(ai_bg_preview(input.clone(), model.clone(), AiBgOptions::default()))
                .expect("미리보기 실패");
            let first = started.elapsed();
            // 두 번째 미리보기는 마스크 캐시를 타야 한다
            let started = std::time::Instant::now();
            block_on(ai_bg_preview(input.clone(), model.clone(), AiBgOptions::default()))
                .expect("미리보기 실패");
            let cached = started.elapsed();
            assert!(!preview.is_empty());

            let outputs = block_on(ai_bg_save(
                vec![input.clone()],
                model.clone(),
                AiBgOptions::default(),
                false,
            ))
            .expect("저장 실패");
            let out = &outputs[0];
            let renamed = out.replace("_nobg", &format!("_nobg_{model}"));
            std::fs::rename(out, &renamed).expect("결과 이름 변경 실패");

            let img = image::open(&renamed).expect("결과 열기 실패").to_rgba8();
            let total = img.pixels().len();
            let clear = img.pixels().filter(|p| p[3] == 0).count();
            let opaque = img.pixels().filter(|p| p[3] == 255).count();
            eprintln!(
                "[{model}] {} — 추론+합성 {:?}, 캐시 {:?}, 투명 {:.0}% / 불투명 {:.0}%",
                std::path::Path::new(input).file_name().unwrap().to_string_lossy(),
                first,
                cached,
                clear as f64 * 100.0 / total as f64,
                opaque as f64 * 100.0 / total as f64,
            );
            if clear > 0 && opaque > 0 {
                separated += 1;
            }
            assert!(cached < first, "마스크 캐시가 동작해야 한다");
        }
        assert!(separated > 0, "[{model}] 배경·전경을 분리한 결과가 하나도 없다");
    }
}

