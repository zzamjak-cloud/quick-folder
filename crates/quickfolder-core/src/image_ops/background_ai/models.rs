//! AI 배경 제거 모델 카탈로그
//!
//! 모델 파일은 앱에 번들하지 않고 최초 사용 시 내려받는다. 파일은 rembg 프로젝트가
//! GitHub 릴리스로 배포하는 ONNX 변환본을 그대로 쓰며, 무결성은 sha256 으로 고정한다.
//!
//! 라이선스(상업 배포 가능한 것만 등록한다):
//! - ISNet general-use: xuebinqin/DIS — Apache-2.0
//! - ISNet anime: SkyTNT/anime-segmentation — Apache-2.0
//! - BiRefNet (swin tiny): ZhengPeng7/BiRefNet — MIT
//!
//! BRIA RMBG 계열은 CC BY-NC 4.0(비상업)이라 등록하지 않는다.

/// 모델 한 종의 배포·전처리 정보
#[derive(Debug)]
pub struct AiBgModel {
    /// 프론트엔드·MCP 가 쓰는 식별자
    pub id: &'static str,
    /// 로컬 저장 파일명
    pub file_name: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size_bytes: u64,
    /// 정사각 입력 한 변 길이
    pub input_size: u32,
    /// 채널별 정규화 평균·표준편차 (rembg 세션 구현과 동일)
    pub mean: [f32; 3],
    pub std: [f32; 3],
    /// 출력이 로짓이라 sigmoid 를 거쳐야 하는지
    pub sigmoid: bool,
}

/// rembg 릴리스 자산 URL (concat! 은 리터럴만 받으므로 매크로로 접두사를 붙인다)
macro_rules! rembg_url {
    ($file:literal) => {
        concat!("https://github.com/danielgatis/rembg/releases/download/v0.0.0/", $file)
    };
}

/// 기본 모델 — 품질·속도 균형
pub const DEFAULT_MODEL_ID: &str = "isnet-general";

pub const MODELS: &[AiBgModel] = &[
    AiBgModel {
        id: "isnet-general",
        file_name: "isnet-general-use.onnx",
        url: rembg_url!("isnet-general-use.onnx"),
        sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
        size_bytes: 178_648_008,
        input_size: 1024,
        mean: [0.5, 0.5, 0.5],
        std: [1.0, 1.0, 1.0],
        sigmoid: false,
    },
    AiBgModel {
        id: "isnet-anime",
        file_name: "isnet-anime.onnx",
        url: rembg_url!("isnet-anime.onnx"),
        sha256: "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99",
        size_bytes: 176_069_933,
        input_size: 1024,
        mean: [0.485, 0.456, 0.406],
        std: [1.0, 1.0, 1.0],
        sigmoid: false,
    },
    AiBgModel {
        id: "birefnet-lite",
        file_name: "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
        url: rembg_url!("BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx"),
        sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
        size_bytes: 224_005_088,
        input_size: 1024,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225],
        sigmoid: true,
    },
];

/// 식별자로 모델을 찾는다
pub fn find_model(id: &str) -> Option<&'static AiBgModel> {
    MODELS.iter().find(|m| m.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_ids_are_unique_and_urls_point_to_rembg_release() {
        for (i, m) in MODELS.iter().enumerate() {
            assert!(MODELS.iter().skip(i + 1).all(|o| o.id != m.id), "중복 id: {}", m.id);
            assert!(m.url.starts_with("https://github.com/danielgatis/rembg/releases/"));
            assert!(m.url.ends_with(m.file_name));
            assert_eq!(m.sha256.len(), 64);
        }
        assert!(find_model(DEFAULT_MODEL_ID).is_some());
    }
}
