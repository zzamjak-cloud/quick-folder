//! QuickFolder MCP 서버 (`qf-mcp`)
//!
//! AI 에이전트가 QuickFolder의 파일·이미지 기능을 쓰도록 MCP 도구로 노출한다.
//! GUI 앱을 띄우지 않고 quickfolder-core를 직접 링크하므로, 도구 호출이
//! 프로세스 스폰 없이 in-process 함수 호출로 처리된다.
//!
//! 안전장치
//! - `QF_MCP_ROOTS`에 나열한 디렉토리 밖은 전부 거부한다. 비어 있으면 아무것도 허용하지 않는다.
//! - 파괴적 도구(`qf_file_ops`, `qf_delete`)는 `confirm: true` 없이는 계획만 돌려준다.
//! - 삭제는 휴지통 경유만 지원한다. GUI의 실행취소 스택은 이 경로에 없다.

mod roots;

use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler, ServiceExt};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use quickfolder_core::batch::{collect_files, default_jobs, summarize};
use quickfolder_core::image_ops::{run_image_batch, set_heavy_op_limit, ImageBatchOp};
use quickfolder_core::file_ops::FolderMergeConflictMode;
use quickfolder_core::laigter_maps::LaigterExportOptions;
use quickfolder_core::paths::AppPaths;
use quickfolder_core::progress::null_sink;

use roots::Roots;

/// GUI 앱과 캐시를 공유하기 위한 번들 식별자
const BUNDLE_IDENTIFIER: &str = "com.quickfolder.widget";
/// 접근 허용 루트를 지정하는 환경변수
const ROOTS_ENV: &str = "QF_MCP_ROOTS";

fn invalid(message: impl Into<std::borrow::Cow<'static, str>>) -> ErrorData {
    ErrorData::invalid_params(message, None)
}

fn internal(message: impl Into<std::borrow::Cow<'static, str>>) -> ErrorData {
    ErrorData::internal_error(message, None)
}

// ───────────────────────── 파라미터 ─────────────────────────

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PathParam {
    /// 대상 디렉토리 경로
    pub path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchParams {
    /// 검색을 시작할 디렉토리
    pub root: String,
    /// 파일 이름에 포함될 문자열
    pub query: String,
    /// 최대 결과 수 (기본 100)
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RootParam {
    /// 대상 디렉토리
    pub root: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ImageBatchParams {
    /// 처리할 파일 또는 폴더 경로 목록
    pub paths: Vec<String>,
    /// 연산 종류: pixelate | resize | compress | crop | to_ico | to_icns | remove_white_bg
    pub op: String,
    /// 하위 폴더까지 훑을지 여부
    #[serde(default)]
    pub recursive: bool,
    /// 동시 처리 수 (생략 시 논리 코어 수)
    #[serde(default)]
    pub jobs: Option<usize>,
    /// pixelate: 픽셀 블록 크기
    #[serde(default)]
    pub pixel_size: Option<u32>,
    /// pixelate: 출력 최대 변 길이 (0이면 원본 크기 그대로 유지, 1이면 논리 해상도로 축소)
    #[serde(default)]
    pub scale: Option<u32>,
    /// pixelate: 팔레트 색상 수 (0이면 양자화 안 함)
    #[serde(default)]
    pub max_colors: Option<u32>,
    /// resize/crop: 너비
    #[serde(default)]
    pub width: Option<u32>,
    /// resize/crop: 높이
    #[serde(default)]
    pub height: Option<u32>,
    /// crop: 시작 x
    #[serde(default)]
    pub x: Option<u32>,
    /// crop: 시작 y
    #[serde(default)]
    pub y: Option<u32>,
    /// compress: low | medium | high
    #[serde(default)]
    pub quality: Option<String>,
    /// remove_white_bg: 흰색 판정 임계값 (0-255)
    #[serde(default)]
    pub threshold: Option<u8>,
    /// remove_white_bg: 경계 부드럽게 (0-255)
    #[serde(default)]
    pub feather: Option<u8>,
    /// remove_white_bg: 여백 잘라내기
    #[serde(default)]
    pub trim: bool,
    /// true면 실제로 처리하지 않고 대상 목록만 돌려준다
    #[serde(default)]
    pub dry_run: bool,
}

impl ImageBatchParams {
    fn to_op(&self) -> Result<ImageBatchOp, ErrorData> {
        let need = |value: Option<u32>, name: &str| -> Result<u32, ErrorData> {
            value.ok_or_else(|| invalid(format!("{} 연산에는 {} 값이 필요합니다", self.op, name)))
        };
        match self.op.as_str() {
            "pixelate" => Ok(ImageBatchOp::Pixelate {
                pixel_size: self.pixel_size.unwrap_or(8),
                scale: self.scale.unwrap_or(0),
                max_colors: self.max_colors.unwrap_or(0),
            }),
            "resize" => Ok(ImageBatchOp::Resize {
                width: need(self.width, "width")?,
                height: need(self.height, "height")?,
            }),
            "compress" => Ok(ImageBatchOp::Compress {
                quality: self.quality.clone().unwrap_or_else(|| "medium".to_string()),
            }),
            "crop" => Ok(ImageBatchOp::Crop {
                x: need(self.x, "x")?,
                y: need(self.y, "y")?,
                width: need(self.width, "width")?,
                height: need(self.height, "height")?,
            }),
            "to_ico" => Ok(ImageBatchOp::ToIco),
            "to_icns" => Ok(ImageBatchOp::ToIcns),
            "remove_white_bg" => Ok(ImageBatchOp::RemoveWhiteBg {
                threshold: self.threshold.unwrap_or(240),
                feather: self.feather.unwrap_or(0),
                trim: self.trim,
            }),
            other => Err(invalid(format!(
                "알 수 없는 연산입니다: {}. pixelate | resize | compress | crop | to_ico | to_icns | remove_white_bg 중 하나여야 합니다.",
                other
            ))),
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ArchiveParams {
    /// compress | extract
    pub action: String,
    /// compress: 압축할 파일·폴더 / extract: 압축 파일 1개
    pub paths: Vec<String>,
    /// compress: 만들 zip 경로 / extract: 풀어낼 디렉토리
    pub dest: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct FileOpsParams {
    /// move | copy | rename | mkdir
    pub action: String,
    /// move/copy: 원본 목록, rename: 기존 경로 1개, mkdir: 만들 경로 1개
    #[serde(default)]
    pub sources: Vec<String>,
    /// move/copy: 대상 디렉토리, rename: 새 경로. mkdir에서는 무시된다.
    #[serde(default)]
    pub dest: Option<String>,
    /// 기존 파일 덮어쓰기 (move/copy)
    #[serde(default)]
    pub overwrite: bool,
    /// true여야 실제로 실행된다. 없으면 계획만 돌려준다.
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DeleteParams {
    /// 휴지통으로 보낼 경로 목록
    pub paths: Vec<String>,
    /// true여야 실제로 실행된다. 없으면 계획만 돌려준다.
    #[serde(default)]
    pub confirm: bool,
}

// ───────────────────────── 응답 ─────────────────────────

#[derive(Debug, Serialize, JsonSchema)]
pub struct InfoOut {
    pub cache_dir: String,
    pub cache_exists: bool,
    pub allowed_roots: Vec<String>,
    pub logical_cores: usize,
    pub heavy_op_limit: usize,
    pub ffmpeg_available: bool,
}

/// 파일 항목. 코어의 `FileEntry`를 에이전트에게 필요한 필드만 추려 옮긴 것.
/// 내부 식별자(`identity`)처럼 도구 사용자에게 의미 없는 값은 노출하지 않는다.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EntryOut {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// 수정 시각 (epoch ms)
    pub modified: u64,
    /// image | video | document | code | archive | font | directory | app | other
    pub file_type: String,
}

impl From<quickfolder_core::types::FileEntry> for EntryOut {
    fn from(e: quickfolder_core::types::FileEntry) -> Self {
        let file_type = serde_json::to_value(e.file_type)
            .ok()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "other".to_string());
        Self {
            name: e.name,
            path: e.path,
            is_dir: e.is_dir,
            size: e.size,
            modified: e.modified,
            file_type,
        }
    }
}

/// 목록 응답 래퍼.
///
/// **최상위를 배열로 돌려주면 안 된다.** MCP 의 `structuredContent` 는 객체여야 해서
/// `Json<Vec<T>>` 는 클라이언트 스키마 검증에서 거부된다 (Claude Code 기준
/// `expected "record"`). 목록은 전부 이렇게 한 겹 감싼다.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EntriesOut {
    pub entries: Vec<EntryOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct DuplicateGroupsOut {
    pub groups: Vec<DuplicateGroupOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct DuplicateGroupOut {
    /// 그룹에 속한 파일 각각의 크기 (바이트)
    pub size: u64,
    pub files: Vec<EntryOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct BatchItemOut {
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct BatchOut {
    pub dry_run: bool,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub items: Vec<BatchItemOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct PlanOut {
    /// 실제로 실행됐는지 여부. false면 confirm 없이 계획만 낸 것이다.
    pub executed: bool,
    pub action: String,
    pub targets: Vec<String>,
    pub dest: Option<String>,
    pub note: String,
}

// ───────────────────────── 신규 파라미터 ─────────────────────────

#[derive(Debug, Deserialize, JsonSchema)]
pub struct VideoParams {
    /// compress | trim | cut | concat | to_gif | gif_to_mp4 | compress_gif
    pub op: String,
    /// 대상 파일 목록. concat 은 이 순서대로 이어 붙이고, 나머지는 파일마다 따로 처리한다.
    pub paths: Vec<String>,
    /// compress/compress_gif: low | medium | high (기본 medium)
    #[serde(default)]
    pub quality: Option<String>,
    /// compress: 해상도 축소 비율(%). 100 또는 생략이면 원본 유지.
    #[serde(default)]
    pub scale_percent: Option<u32>,
    /// trim/cut/to_gif: 구간 시작 (초)
    #[serde(default)]
    pub start_sec: Option<f64>,
    /// trim/cut/to_gif: 구간 끝 (초)
    #[serde(default)]
    pub end_sec: Option<f64>,
    /// trim/to_gif: 출력 가로 픽셀 (생략 시 원본 유지)
    #[serde(default)]
    pub scale_width: Option<i32>,
    /// trim/to_gif: 재생 속도 배율 (1.0 = 원본)
    #[serde(default)]
    pub speed: Option<f64>,
    /// compress_gif: 프레임 수·해상도까지 줄일지 여부
    #[serde(default)]
    pub reduce_size: bool,
    /// true면 실제로 처리하지 않고 대상 목록만 돌려준다
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct MapsParams {
    /// 맵을 생성할 이미지 파일 또는 폴더 경로 목록
    pub paths: Vec<String>,
    /// 하위 폴더까지 훑을지 여부
    #[serde(default)]
    pub recursive: bool,
    /// 노멀 범프 강도 (기본 2.5)
    #[serde(default)]
    pub bump_strength: Option<f32>,
    /// 높이맵 가우시안 블러 (기본 1.2, 0에 가까우면 스킵)
    #[serde(default)]
    pub blur_sigma: Option<f32>,
    /// 높이 반전
    #[serde(default)]
    pub height_invert: Option<bool>,
    /// 노멀 Y 뒤집기 (DirectX 스타일, 기본 true)
    #[serde(default)]
    pub normal_y_flip: Option<bool>,
    /// 스페큘러 지수 (기본 8.0)
    #[serde(default)]
    pub specular_exponent: Option<f32>,
    /// 0=원본 명도 위주, 1=높이 기울기 위주 (기본 0.45)
    #[serde(default)]
    pub specular_gradient_mix: Option<f32>,
    /// 스페큘러 게인 (기본 1.0)
    #[serde(default)]
    pub specular_gain: Option<f32>,
    /// 오클루전 강도 (기본 0.85)
    #[serde(default)]
    pub occlusion_strength: Option<f32>,
    /// 타일링 텍스처 — 켜면 경계를 wrap 샘플링해 이음새 없는 맵을 만든다 (기본 true)
    #[serde(default)]
    pub tile: Option<bool>,
    /// 노멀맵 저장 (기본 true)
    #[serde(default)]
    pub save_normal: Option<bool>,
    /// 패럴랙스(높이)맵 저장 (기본 false)
    #[serde(default)]
    pub save_parallax: Option<bool>,
    /// 스페큘러맵 저장 (기본 false)
    #[serde(default)]
    pub save_specular: Option<bool>,
    /// 오클루전맵 저장 (기본 false)
    #[serde(default)]
    pub save_occlusion: Option<bool>,
    /// true면 실제로 처리하지 않고 대상 목록만 돌려준다
    #[serde(default)]
    pub dry_run: bool,
}

impl MapsParams {
    fn to_core(&self) -> (quickfolder_core::laigter_maps::LaigterParams, LaigterExportOptions) {
        let defaults = quickfolder_core::laigter_maps::LaigterParams::default();
        let params = quickfolder_core::laigter_maps::LaigterParams {
            bump_strength: self.bump_strength.unwrap_or(defaults.bump_strength),
            blur_sigma: self.blur_sigma.unwrap_or(defaults.blur_sigma),
            height_invert: self.height_invert.unwrap_or(defaults.height_invert),
            normal_y_flip: self.normal_y_flip.unwrap_or(defaults.normal_y_flip),
            specular_exponent: self.specular_exponent.unwrap_or(defaults.specular_exponent),
            specular_gradient_mix: self
                .specular_gradient_mix
                .unwrap_or(defaults.specular_gradient_mix),
            specular_gain: self.specular_gain.unwrap_or(defaults.specular_gain),
            occlusion_strength: self.occlusion_strength.unwrap_or(defaults.occlusion_strength),
            tile: self.tile.unwrap_or(defaults.tile),
        };
        // 아무 맵도 고르지 않으면 노멀맵만 — 빈 출력으로 조용히 끝나는 것보다 낫다
        let any = self.save_normal.unwrap_or(false)
            || self.save_parallax.unwrap_or(false)
            || self.save_specular.unwrap_or(false)
            || self.save_occlusion.unwrap_or(false);
        let options = LaigterExportOptions {
            save_normal: if any { self.save_normal.unwrap_or(false) } else { true },
            save_parallax: self.save_parallax.unwrap_or(false),
            save_specular: self.save_specular.unwrap_or(false),
            save_occlusion: self.save_occlusion.unwrap_or(false),
        };
        (params, options)
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SpriteSheetParams {
    /// pack | split
    pub op: String,
    /// pack: 합칠 이미지 목록(순서 유지) / split: 분해할 시트 1개
    pub paths: Vec<String>,
    /// 격자 열 수
    pub cols: u32,
    /// 격자 행 수
    pub rows: u32,
    /// pack: 만들 시트의 기준 경로 (실제 파일명에는 _sheet 가 붙는다) / split: 조각을 넣을 디렉토리
    pub dest: String,
    /// pack: 칸 가로 픽셀 (생략 시 첫 이미지 크기)
    #[serde(default)]
    pub cell_width: Option<u32>,
    /// pack: 칸 세로 픽셀 (생략 시 첫 이미지 크기)
    #[serde(default)]
    pub cell_height: Option<u32>,
    /// split: 조각 파일 이름 앞부분 (기본: 원본 파일명)
    #[serde(default)]
    pub base_name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PathsParam {
    /// 대상 파일 경로 목록
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PathsDryRunParam {
    /// 대상 파일 또는 폴더 경로 목록
    pub paths: Vec<String>,
    /// 하위 폴더까지 훑을지 여부
    #[serde(default)]
    pub recursive: bool,
    /// true면 실제로 처리하지 않고 대상 목록만 돌려준다
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct FolderMergeParams {
    /// 옮길 원본 폴더
    pub source: String,
    /// 합쳐 넣을 상위 폴더
    pub dest_parent: String,
    /// 이름이 겹칠 때: rename | overwrite_newer | skip (기본 rename)
    #[serde(default)]
    pub conflict_mode: Option<String>,
    /// true면 원본을 옮기고, false면 복사한다 (기본 false)
    #[serde(default)]
    pub move_source: bool,
    /// true여야 실제로 실행된다. 없으면 분석 결과만 돌려준다.
    #[serde(default)]
    pub confirm: bool,
}

// ───────────────────────── 신규 응답 ─────────────────────────

#[derive(Debug, Serialize, JsonSchema)]
pub struct ImageInfoOut {
    pub items: Vec<ImageInfoItem>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ImageInfoItem {
    pub path: String,
    /// 크기를 읽지 못하면 null (이미지가 아니거나 손상)
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct FolderSizeOut {
    pub path: String,
    /// 하위 전체를 합친 바이트 수
    pub total_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    /// 직계 하위 항목을 용량 내림차순으로
    pub children: Vec<FolderSizeChild>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct FolderSizeChild {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TextOut {
    pub items: Vec<TextItem>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TextItem {
    pub path: String,
    pub text: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct FolderMergeOut {
    /// 실제로 실행됐는지 여부. false면 confirm 없이 분석만 낸 것이다.
    pub executed: bool,
    pub source: String,
    pub dest_parent: String,
    /// 합쳐질 대상 폴더가 이미 있는가
    pub dest_exists: bool,
    /// 이름이 겹치는 파일 수
    pub conflict_count: usize,
    /// 겹치는 파일 경로 (최대 50개까지만)
    pub conflicts: Vec<String>,
    pub note: String,
}

// ───────────────────────── 서버 ─────────────────────────

#[derive(Clone)]
pub struct QuickFolderServer {
    app_paths: AppPaths,
    roots: Arc<Roots>,
    tool_router: ToolRouter<Self>,
}

#[tool_router(router = tool_router)]
impl QuickFolderServer {
    pub fn new(app_paths: AppPaths, roots: Roots) -> Self {
        Self {
            app_paths,
            roots: Arc::new(roots),
            tool_router: Self::tool_router(),
        }
    }

    /// 환경 진단: 캐시 경로, 허용 루트, 동시성, ffmpeg 가용 여부
    #[tool(
        name = "qf_info",
        description = "QuickFolder MCP 서버 상태를 돌려준다. 접근이 허용된 루트 목록, GUI 앱과 공유하는 캐시 경로, 동시 처리 수, ffmpeg 가용 여부."
    )]
    pub async fn qf_info(&self) -> Result<Json<InfoOut>, ErrorData> {
        let cache = self.app_paths.cache_dir().to_path_buf();
        let ffmpeg = quickfolder_core::check_ffmpeg().await.unwrap_or(false);
        Ok(Json(InfoOut {
            cache_dir: cache.display().to_string(),
            cache_exists: cache.exists(),
            allowed_roots: self
                .roots
                .list()
                .iter()
                .map(|p| p.display().to_string())
                .collect(),
            logical_cores: default_jobs(),
            heavy_op_limit: quickfolder_core::image_ops::heavy_op_limit(),
            ffmpeg_available: ffmpeg,
        }))
    }

    /// 디렉토리 목록 조회
    #[tool(
        name = "qf_list_directory",
        description = "디렉토리의 항목 목록을 돌려준다. 압축 파일 내부 경로도 가상 경로로 조회할 수 있다."
    )]
    pub async fn qf_list_directory(
        &self,
        Parameters(params): Parameters<PathParam>,
    ) -> Result<Json<EntriesOut>, ErrorData> {
        let path = self.roots.check(&params.path).map_err(invalid)?;
        let entries = quickfolder_core::list_directory(
            self.app_paths.clone(),
            path.display().to_string(),
        )
        .await
        .map_err(|e| internal(e.to_string()))?;
        Ok(Json(EntriesOut {
            entries: entries.into_iter().map(EntryOut::from).collect(),
        }))
    }

    /// 파일 이름 검색
    #[tool(
        name = "qf_search_files",
        description = "디렉토리 하위에서 이름에 문자열이 포함된 파일을 찾는다. macOS에서는 Spotlight 인덱스를 우선 사용한다."
    )]
    pub async fn qf_search_files(
        &self,
        Parameters(params): Parameters<SearchParams>,
    ) -> Result<Json<EntriesOut>, ErrorData> {
        let root = self.roots.check(&params.root).map_err(invalid)?;
        let entries = quickfolder_core::search_files(
            root.display().to_string(),
            params.query,
            params.limit.unwrap_or(100),
        )
        .await
        .map_err(internal)?;
        Ok(Json(EntriesOut {
            entries: entries.into_iter().map(EntryOut::from).collect(),
        }))
    }

    /// 중복 파일 탐색
    #[tool(
        name = "qf_find_duplicates",
        description = "디렉토리 하위에서 내용이 동일한 파일 그룹을 찾는다. 크기로 후보를 좁힌 뒤 해시로 확인한다."
    )]
    pub async fn qf_find_duplicates(
        &self,
        Parameters(params): Parameters<RootParam>,
    ) -> Result<Json<DuplicateGroupsOut>, ErrorData> {
        let root = self.roots.check(&params.root).map_err(invalid)?;
        let groups = quickfolder_core::find_duplicate_files(root.display().to_string())
            .await
            .map_err(internal)?;
        Ok(Json(DuplicateGroupsOut {
            groups: groups
                .into_iter()
                .map(|g| DuplicateGroupOut {
                    size: g.size,
                    files: g.files.into_iter().map(EntryOut::from).collect(),
                })
                .collect(),
        }))
    }

    /// 이미지 일괄 처리
    #[tool(
        name = "qf_image_batch",
        description = "폴더나 파일 목록에 이미지 연산을 일괄 적용한다. op: pixelate, resize, compress, crop, to_ico, to_icns, remove_white_bg. 원본은 남고 새 파일이 생성된다. 한 파일이 실패해도 나머지는 계속 처리된다."
    )]
    pub async fn qf_image_batch(
        &self,
        Parameters(params): Parameters<ImageBatchParams>,
    ) -> Result<Json<BatchOut>, ErrorData> {
        if params.paths.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }
        let op = params.to_op()?;
        let checked = self.roots.check_all(&params.paths).map_err(invalid)?;

        if params.dry_run {
            let inputs =
                quickfolder_core::batch::collect_files(&checked, params.recursive, &op.input_extensions());
            return Ok(Json(BatchOut {
                dry_run: true,
                total: inputs.len(),
                succeeded: 0,
                failed: 0,
                items: inputs
                    .into_iter()
                    .map(|p| BatchItemOut {
                        input: p.display().to_string(),
                        output: None,
                        error: None,
                    })
                    .collect(),
            }));
        }

        let outcomes = run_image_batch(
            checked,
            params.recursive,
            op,
            params.jobs.unwrap_or(0),
            null_sink(),
        )
        .await;
        let summary = summarize(&outcomes);
        Ok(Json(BatchOut {
            dry_run: false,
            total: summary.total,
            succeeded: summary.succeeded,
            failed: summary.failed,
            items: outcomes
                .into_iter()
                .map(|o| {
                    let input = o.input.display().to_string();
                    match o.result {
                        Ok(output) => BatchItemOut {
                            input,
                            output: Some(output),
                            error: None,
                        },
                        Err(e) => BatchItemOut {
                            input,
                            output: None,
                            error: Some(e.to_string()),
                        },
                    }
                })
                .collect(),
        }))
    }

    /// 압축·해제
    #[tool(
        name = "qf_archive",
        description = "zip으로 압축하거나 압축 파일을 해제한다. action: compress | extract."
    )]
    pub async fn qf_archive(
        &self,
        Parameters(params): Parameters<ArchiveParams>,
    ) -> Result<Json<PlanOut>, ErrorData> {
        let sources = self.roots.check_all(&params.paths).map_err(invalid)?;
        let dest = self.roots.check(&params.dest).map_err(invalid)?;
        let source_strings: Vec<String> = sources.iter().map(|p| p.display().to_string()).collect();

        match params.action.as_str() {
            "compress" => {
                let out = quickfolder_core::compress_to_zip(source_strings.clone(), dest.display().to_string())
                    .await
                    .map_err(|e| internal(e.to_string()))?;
                Ok(Json(PlanOut {
                    executed: true,
                    action: "compress".to_string(),
                    targets: source_strings,
                    dest: Some(out),
                    note: "zip 생성 완료".to_string(),
                }))
            }
            "extract" => {
                let archive = source_strings
                    .first()
                    .ok_or_else(|| invalid("압축 파일 경로가 필요합니다."))?
                    .clone();
                let result =
                    quickfolder_core::extract_archive(archive.clone(), dest.display().to_string())
                        .await
                        .map_err(|e| internal(e.to_string()))?;
                Ok(Json(PlanOut {
                    executed: true,
                    action: "extract".to_string(),
                    targets: vec![archive],
                    dest: Some(dest.display().to_string()),
                    note: format!("해제 실패 항목 {}건", result.failed.len()),
                }))
            }
            other => Err(invalid(format!(
                "알 수 없는 action입니다: {}. compress | extract 중 하나여야 합니다.",
                other
            ))),
        }
    }

    /// 파일 이동·복사·이름변경·폴더 생성 (파괴적)
    #[tool(
        name = "qf_file_ops",
        description = "파일을 옮기거나 복사하거나 이름을 바꾸거나 폴더를 만든다. action: move | copy | rename | mkdir. confirm=true 없이는 실행하지 않고 계획만 돌려준다. 이 경로에는 GUI의 Ctrl+Z 실행취소가 없다."
    )]
    pub async fn qf_file_ops(
        &self,
        Parameters(params): Parameters<FileOpsParams>,
    ) -> Result<Json<PlanOut>, ErrorData> {
        let sources = self.roots.check_all(&params.sources).map_err(invalid)?;
        let source_strings: Vec<String> = sources.iter().map(|p| p.display().to_string()).collect();
        let dest = match &params.dest {
            Some(d) => Some(self.roots.check(d).map_err(invalid)?.display().to_string()),
            None => None,
        };

        if !matches!(params.action.as_str(), "move" | "copy" | "rename" | "mkdir") {
            return Err(invalid(format!(
                "알 수 없는 action입니다: {}. move | copy | rename | mkdir 중 하나여야 합니다.",
                params.action
            )));
        }

        if !params.confirm {
            return Ok(Json(PlanOut {
                executed: false,
                action: params.action,
                targets: source_strings,
                dest,
                note: "confirm=true 로 다시 호출하면 실행됩니다. 실행취소는 지원되지 않습니다."
                    .to_string(),
            }));
        }

        let need_dest = || -> Result<String, ErrorData> {
            dest.clone()
                .ok_or_else(|| invalid("dest 값이 필요합니다."))
        };

        match params.action.as_str() {
            "move" => quickfolder_core::move_items(
                self.app_paths.clone(),
                source_strings.clone(),
                need_dest()?,
                Some(params.overwrite),
            )
            .await
            .map_err(|e| internal(e.to_string()))?,
            "copy" => quickfolder_core::copy_items(
                self.app_paths.clone(),
                source_strings.clone(),
                need_dest()?,
                Some(params.overwrite),
            )
            .await
            .map_err(|e| internal(e.to_string()))?,
            "rename" => {
                let old = source_strings
                    .first()
                    .ok_or_else(|| invalid("이름을 바꿀 경로가 필요합니다."))?
                    .clone();
                quickfolder_core::rename_item(self.app_paths.clone(), old, need_dest()?)
                    .await
                    .map_err(|e| internal(e.to_string()))?
            }
            "mkdir" => {
                let target = source_strings
                    .first()
                    .cloned()
                    .or_else(|| dest.clone())
                    .ok_or_else(|| invalid("만들 폴더 경로가 필요합니다."))?;
                quickfolder_core::create_directory(target)
                    .await
                    .map_err(|e| internal(e.to_string()))?
            }
            _ => unreachable!("위에서 검증됨"),
        }

        Ok(Json(PlanOut {
            executed: true,
            action: params.action,
            targets: source_strings,
            dest,
            note: "완료".to_string(),
        }))
    }

    /// 휴지통으로 삭제 (파괴적)
    #[tool(
        name = "qf_delete",
        description = "파일·폴더를 휴지통으로 보낸다. 영구 삭제는 지원하지 않는다. confirm=true 없이는 실행하지 않고 대상만 돌려준다."
    )]
    pub async fn qf_delete(
        &self,
        Parameters(params): Parameters<DeleteParams>,
    ) -> Result<Json<PlanOut>, ErrorData> {
        let targets = self.roots.check_all(&params.paths).map_err(invalid)?;
        let target_strings: Vec<String> = targets.iter().map(|p| p.display().to_string()).collect();
        if target_strings.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }

        if !params.confirm {
            return Ok(Json(PlanOut {
                executed: false,
                action: "delete".to_string(),
                targets: target_strings,
                dest: None,
                note: "confirm=true 로 다시 호출하면 휴지통으로 보냅니다.".to_string(),
            }));
        }

        // use_trash=true 고정 — 영구 삭제는 노출하지 않는다
        quickfolder_core::delete_items(self.app_paths.clone(), target_strings.clone(), true)
            .await
            .map_err(|e| internal(e.to_string()))?;

        Ok(Json(PlanOut {
            executed: true,
            action: "delete".to_string(),
            targets: target_strings,
            dest: None,
            note: "휴지통으로 이동했습니다.".to_string(),
        }))
    }

    /// 이미지 크기 조회
    #[tool(
        name = "qf_image_info",
        description = "이미지의 가로·세로 픽셀 크기를 돌려준다. '절반 크기로 줄여줘'처럼 현재 크기를 알아야 하는 요청에서 resize 전에 쓴다."
    )]
    pub async fn qf_image_info(
        &self,
        Parameters(params): Parameters<PathsParam>,
    ) -> Result<Json<ImageInfoOut>, ErrorData> {
        let targets = self.roots.check_all(&params.paths).map_err(invalid)?;
        if targets.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }

        let mut items = Vec::with_capacity(targets.len());
        for path in targets {
            let path_string = path.display().to_string();
            match quickfolder_core::get_image_dimensions(self.app_paths.clone(), path_string.clone())
                .await
            {
                Ok(Some((width, height))) => items.push(ImageInfoItem {
                    path: path_string,
                    width: Some(width),
                    height: Some(height),
                    error: None,
                }),
                Ok(None) => items.push(ImageInfoItem {
                    path: path_string,
                    width: None,
                    height: None,
                    error: Some("이미지 크기를 읽을 수 없습니다.".to_string()),
                }),
                // 건별 실패 격리 — 한 파일 때문에 배치 전체를 죽이지 않는다
                Err(e) => items.push(ImageInfoItem {
                    path: path_string,
                    width: None,
                    height: None,
                    error: Some(e.to_string()),
                }),
            }
        }
        Ok(Json(ImageInfoOut { items }))
    }

    /// 폴더 용량
    #[tool(
        name = "qf_folder_size",
        description = "폴더의 전체 용량과 파일·폴더 개수를 돌려준다. 직계 하위 항목은 용량 내림차순으로 함께 준다 — 무엇이 용량을 차지하는지 찾을 때 쓴다."
    )]
    pub async fn qf_folder_size(
        &self,
        Parameters(params): Parameters<PathParam>,
    ) -> Result<Json<FolderSizeOut>, ErrorData> {
        let path = self.roots.check(&params.path).map_err(invalid)?;
        let info = quickfolder_core::calculate_folder_size(path.display().to_string())
            .await
            .map_err(|e| internal(e.to_string()))?;

        // 코어는 JS 정밀도 손실을 피하려고 바이트를 문자열로 준다. MCP 쪽은 수로 돌려준다.
        let parse = |text: &str| text.parse::<u64>().unwrap_or(0);

        Ok(Json(FolderSizeOut {
            path: path.display().to_string(),
            total_bytes: parse(&info.bytes),
            file_count: info.file_count,
            dir_count: info.folder_count,
            children: info
                .children
                .into_iter()
                .map(|child| FolderSizeChild {
                    name: child.name,
                    path: child.path,
                    is_dir: child.is_dir,
                    size: parse(&child.bytes),
                })
                .collect(),
        }))
    }

    /// HWP/HWPX 텍스트 추출
    #[tool(
        name = "qf_extract_text",
        description = "한글(HWP/HWPX) 문서에서 본문 텍스트를 뽑는다. 다른 형식은 일반 파일 읽기 도구로 읽으면 된다."
    )]
    pub async fn qf_extract_text(
        &self,
        Parameters(params): Parameters<PathsParam>,
    ) -> Result<Json<TextOut>, ErrorData> {
        let targets = self.roots.check_all(&params.paths).map_err(invalid)?;
        if targets.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }

        let mut items = Vec::with_capacity(targets.len());
        for path in targets {
            let path_string = path.display().to_string();
            match quickfolder_core::extract_hwp_text(path_string.clone()).await {
                Ok(text) => items.push(TextItem {
                    path: path_string,
                    text: Some(text),
                    error: None,
                }),
                Err(e) => items.push(TextItem {
                    path: path_string,
                    text: None,
                    error: Some(e),
                }),
            }
        }
        Ok(Json(TextOut { items }))
    }

    /// PDF 압축
    #[tool(
        name = "qf_pdf_compress",
        description = "PDF 안의 이미지를 다시 인코딩해 용량을 줄인다. 원본은 남고 _compressed 가 붙은 새 파일이 생긴다. 결과가 원본보다 크면 실패로 처리한다."
    )]
    pub async fn qf_pdf_compress(
        &self,
        Parameters(params): Parameters<PathsDryRunParam>,
    ) -> Result<Json<BatchOut>, ErrorData> {
        let inputs = self
            .collect_files(&params.paths, params.recursive, &["pdf"])
            .await?;
        self.run_simple_batch(inputs, params.dry_run, |input| async move {
            quickfolder_core::compress_pdf(input).await.map_err(|e| e.to_string())
        })
        .await
    }

    /// 노멀·패럴랙스·스페큘러·오클루전 맵 생성
    #[tool(
        name = "qf_maps",
        description = "이미지에서 노멀맵 등 머티리얼 맵을 만든다. 저장할 맵을 고르지 않으면 노멀맵만 만든다. 원본은 남고 _normal 같은 접미사가 붙은 새 파일이 생긴다. tile=true(기본)면 경계를 wrap 샘플링해 이음새 없는 맵이 된다."
    )]
    pub async fn qf_maps(
        &self,
        Parameters(params): Parameters<MapsParams>,
    ) -> Result<Json<BatchOut>, ErrorData> {
        let inputs = self
            .collect_files(
                &params.paths,
                params.recursive,
                &["png", "jpg", "jpeg", "webp", "bmp", "tga"],
            )
            .await?;
        let (core_params, options) = params.to_core();
        // LaigterExportOptions 는 Clone 이 없다. 필드가 전부 bool 이므로 값을 꺼내
        // 두고 호출마다 새로 만든다 — `{ ..options }` 로도 되지만 왜 되는지가 불분명하다.
        let (save_normal, save_parallax, save_specular, save_occlusion) = (
            options.save_normal,
            options.save_parallax,
            options.save_specular,
            options.save_occlusion,
        );

        self.run_simple_batch(inputs, params.dry_run, move |input| {
            let core_params = core_params.clone();
            let options = LaigterExportOptions {
                save_normal,
                save_parallax,
                save_specular,
                save_occlusion,
            };
            async move {
                quickfolder_core::laigter_maps_export(input, core_params, options)
                    .await
                    .map(|outputs| outputs.join(", "))
                    .map_err(|e| e.to_string())
            }
        })
        .await
    }

    /// 스프라이트 시트 묶기·분해
    #[tool(
        name = "qf_sprite_sheet",
        description = "op=pack 이면 이미지들을 격자로 묶어 시트 한 장을 만들고, op=split 이면 시트를 격자로 잘라 조각 파일들을 만든다. pack 의 실제 저장 이름에는 _sheet 가 붙고(이름이 겹치면 _sheet_2), 진짜 경로는 응답의 output 에 담겨 온다 — 이어서 split 할 때는 그 값을 그대로 쓸 것."
    )]
    pub async fn qf_sprite_sheet(
        &self,
        Parameters(params): Parameters<SpriteSheetParams>,
    ) -> Result<Json<BatchOut>, ErrorData> {
        if params.cols == 0 || params.rows == 0 {
            return Err(invalid("cols 와 rows 는 1 이상이어야 합니다."));
        }
        let sources = self.roots.check_all(&params.paths).map_err(invalid)?;
        let dest = self.roots.check(&params.dest).map_err(invalid)?;
        let dest_string = dest.display().to_string();

        match params.op.as_str() {
            "pack" => {
                if sources.is_empty() {
                    return Err(invalid("pack 에는 이미지가 한 장 이상 필요합니다."));
                }
                let images: Vec<String> =
                    sources.iter().map(|p| p.display().to_string()).collect();

                // 칸 크기를 안 주면 첫 이미지 크기를 기준으로 삼는다
                let (cell_width, cell_height) = match (params.cell_width, params.cell_height) {
                    (Some(w), Some(h)) => (w, h),
                    _ => {
                        let first = images[0].clone();
                        let dims =
                            quickfolder_core::get_image_dimensions(self.app_paths.clone(), first)
                                .await
                                .map_err(|e| internal(e.to_string()))?
                                .ok_or_else(|| {
                                    invalid(
                                        "첫 이미지의 크기를 읽지 못했습니다. cell_width·cell_height 를 직접 지정해 주세요.",
                                    )
                                })?;
                        (
                            params.cell_width.unwrap_or(dims.0),
                            params.cell_height.unwrap_or(dims.1),
                        )
                    }
                };

                let output = quickfolder_core::save_sprite_sheet(
                    images.clone(),
                    cell_width,
                    cell_height,
                    params.cols,
                    params.rows,
                    dest_string,
                )
                .await
                .map_err(|e| internal(e.to_string()))?;

                Ok(Json(BatchOut {
                    dry_run: false,
                    total: 1,
                    succeeded: 1,
                    failed: 0,
                    items: vec![BatchItemOut {
                        input: images.join(", "),
                        output: Some(output),
                        error: None,
                    }],
                }))
            }
            "split" => {
                let [source] = sources.as_slice() else {
                    return Err(invalid("split 에는 시트 파일 하나만 지정해야 합니다."));
                };
                // 조각을 넣을 디렉토리가 없으면 만든다. dest 는 이미 루트 검사를 통과했다.
                std::fs::create_dir_all(&dest).map_err(|e| {
                    internal(format!("출력 디렉토리를 만들지 못했습니다 {}: {}", dest.display(), e))
                })?;
                let base_name = params.base_name.clone().unwrap_or_else(|| {
                    source
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "sprite".to_string())
                });
                let outputs = quickfolder_core::split_sprite_sheet(
                    source.display().to_string(),
                    params.cols,
                    params.rows,
                    dest_string,
                    base_name,
                )
                .await
                .map_err(|e| internal(e.to_string()))?;

                let total = outputs.len();
                Ok(Json(BatchOut {
                    dry_run: false,
                    total,
                    succeeded: total,
                    failed: 0,
                    items: outputs
                        .into_iter()
                        .map(|output| BatchItemOut {
                            input: source.display().to_string(),
                            output: Some(output),
                            error: None,
                        })
                        .collect(),
                }))
            }
            other => Err(invalid(format!(
                "알 수 없는 연산입니다: {}. pack | split 중 하나여야 합니다.",
                other
            ))),
        }
    }

    /// 동영상·GIF 처리
    #[tool(
        name = "qf_video",
        description = "동영상과 GIF를 처리한다. op: compress(용량 줄이기) | trim(구간 남기기+크기·속도 조절) | cut(구간 잘라내기) | concat(paths 순서대로 이어 붙이기) | to_gif(동영상→GIF) | gif_to_mp4 | compress_gif. 원본은 남고 새 파일이 생긴다. concat 외에는 파일마다 따로 처리한다."
    )]
    pub async fn qf_video(
        &self,
        Parameters(params): Parameters<VideoParams>,
    ) -> Result<Json<BatchOut>, ErrorData> {
        let targets = self.roots.check_all(&params.paths).map_err(invalid)?;
        if targets.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }
        let inputs: Vec<String> = targets.iter().map(|p| p.display().to_string()).collect();

        // ffmpeg 는 앱에 번들돼 있다. 못 찾으면 설치가 손상된 것이므로 그대로 알린다.
        if !quickfolder_core::check_ffmpeg().await.unwrap_or(false) {
            return Err(internal(
                "FFmpeg를 찾을 수 없습니다. QuickFolder를 다시 설치해 주세요.",
            ));
        }

        let quality = params.quality.clone().unwrap_or_else(|| "medium".to_string());
        let start = params.start_sec.unwrap_or(0.0);

        // concat 만 여러 입력을 하나로 합친다
        if params.op == "concat" {
            if inputs.len() < 2 {
                return Err(invalid("concat 에는 동영상이 두 개 이상 필요합니다."));
            }
            if params.dry_run {
                return Ok(Json(dry_run_batch(&[inputs.join(" + ")])));
            }
            let output = quickfolder_core::concat_videos(inputs.clone(), null_sink())
                .await
                .map_err(|e| internal(e.to_string()))?;
            return Ok(Json(BatchOut {
                dry_run: false,
                total: 1,
                succeeded: 1,
                failed: 0,
                items: vec![BatchItemOut {
                    input: inputs.join(", "),
                    output: Some(output),
                    error: None,
                }],
            }));
        }

        // 구간을 다루는 연산은 end_sec 이 있어야 한다
        let needs_range = matches!(params.op.as_str(), "trim" | "cut" | "to_gif");
        if needs_range && params.end_sec.is_none() {
            return Err(invalid(format!(
                "{} 연산에는 end_sec 값이 필요합니다.",
                params.op
            )));
        }
        let end = params.end_sec.unwrap_or(0.0);
        if needs_range && end <= start {
            return Err(invalid("end_sec 은 start_sec 보다 커야 합니다."));
        }

        let op = params.op.clone();
        let scale_percent = params.scale_percent;
        let scale_width = params.scale_width;
        let speed = params.speed;
        let reduce_size = params.reduce_size;

        self.run_simple_batch(inputs, params.dry_run, move |input| {
            let op = op.clone();
            let quality = quality.clone();
            async move {
                let result = match op.as_str() {
                    "compress" => {
                        quickfolder_core::compress_video(input, quality, scale_percent, null_sink())
                            .await
                    }
                    "trim" => {
                        quickfolder_core::trim_video(
                            input, start, end, None, None, None, None, scale_width, speed,
                            null_sink(),
                        )
                        .await
                    }
                    "cut" => quickfolder_core::cut_video(input, start, end, null_sink()).await,
                    "to_gif" => {
                        quickfolder_core::video_to_gif(
                            input, start, end, None, None, None, None, scale_width, speed,
                            null_sink(),
                        )
                        .await
                    }
                    "gif_to_mp4" => quickfolder_core::gif_to_mp4(input).await,
                    "compress_gif" => {
                        quickfolder_core::compress_gif(input, quality, reduce_size).await
                    }
                    other => {
                        return Err(format!(
                            "알 수 없는 연산입니다: {}. compress | trim | cut | concat | to_gif | gif_to_mp4 | compress_gif 중 하나여야 합니다.",
                            other
                        ))
                    }
                };
                result.map_err(|e| e.to_string())
            }
        })
        .await
    }

    /// 스마트 폴더 병합
    #[tool(
        name = "qf_folder_merge",
        description = "폴더를 다른 폴더 아래로 합친다. 같은 이름의 하위 폴더가 있으면 내용을 섞는다. confirm=true 없이는 실행하지 않고 겹치는 파일 분석만 돌려준다. 이 경로에는 GUI의 Ctrl+Z 실행취소가 없다."
    )]
    pub async fn qf_folder_merge(
        &self,
        Parameters(params): Parameters<FolderMergeParams>,
    ) -> Result<Json<FolderMergeOut>, ErrorData> {
        let source = self.roots.check(&params.source).map_err(invalid)?;
        let dest_parent = self.roots.check(&params.dest_parent).map_err(invalid)?;
        let source_string = source.display().to_string();
        let dest_string = dest_parent.display().to_string();

        let analysis =
            quickfolder_core::analyze_folder_merge(source_string.clone(), dest_string.clone())
                .await
                .map_err(|e| internal(e.to_string()))?;

        let conflict_count = analysis.conflicts.len();
        // 겹치는 파일이 수천 개일 수 있다 — 응답을 터뜨리지 않게 앞쪽만 보여준다
        let conflicts: Vec<String> = analysis
            .conflicts
            .iter()
            .take(50)
            .map(|c| c.relative_path.clone())
            .collect();
        let dest_exists = std::path::Path::new(&analysis.dest_path).exists();

        if !params.confirm {
            return Ok(Json(FolderMergeOut {
                executed: false,
                source: source_string,
                dest_parent: dest_string,
                dest_exists,
                conflict_count,
                conflicts,
                note: format!(
                    "confirm=true 로 다시 호출하면 실행합니다. 겹치는 파일 {}개는 conflict_mode(rename | overwrite_newer | skip)에 따라 처리됩니다.",
                    conflict_count
                ),
            }));
        }

        let mode = match params.conflict_mode.as_deref().unwrap_or("rename") {
            "rename" => FolderMergeConflictMode::Rename,
            "overwrite_newer" => FolderMergeConflictMode::OverwriteNewer,
            "skip" => FolderMergeConflictMode::Skip,
            other => {
                return Err(invalid(format!(
                    "알 수 없는 conflict_mode 입니다: {}. rename | overwrite_newer | skip 중 하나여야 합니다.",
                    other
                )))
            }
        };

        quickfolder_core::merge_folders(
            self.app_paths.clone(),
            source_string.clone(),
            dest_string.clone(),
            mode,
            params.move_source,
        )
        .await
        .map_err(|e| internal(e.to_string()))?;

        Ok(Json(FolderMergeOut {
            executed: true,
            source: source_string,
            dest_parent: dest_string,
            dest_exists,
            conflict_count,
            conflicts,
            note: if params.move_source {
                "원본을 옮겨 합쳤습니다.".to_string()
            } else {
                "원본을 두고 복사해 합쳤습니다.".to_string()
            },
        }))
    }

    /// 휴지통 복원
    #[tool(
        name = "qf_restore_trash",
        description = "휴지통으로 보낸 파일·폴더를 원래 자리로 되돌린다. paths 는 삭제되기 전의 원래 경로다. confirm=true 없이는 실행하지 않고 대상만 돌려준다."
    )]
    pub async fn qf_restore_trash(
        &self,
        Parameters(params): Parameters<DeleteParams>,
    ) -> Result<Json<PlanOut>, ErrorData> {
        // 복원은 "원래 경로"에 쓰는 동작이다. 그 경로가 허용 루트 밖이면
        // 삭제 → 복원으로 루트 밖에 파일을 만들 수 있으므로 여기서도 검사한다.
        let targets = self.roots.check_all(&params.paths).map_err(invalid)?;
        let target_strings: Vec<String> = targets.iter().map(|p| p.display().to_string()).collect();
        if target_strings.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }

        if !params.confirm {
            return Ok(Json(PlanOut {
                executed: false,
                action: "restore_trash".to_string(),
                targets: target_strings,
                dest: None,
                note: "confirm=true 로 다시 호출하면 휴지통에서 되돌립니다.".to_string(),
            }));
        }

        quickfolder_core::restore_trash_items(target_strings.clone())
            .await
            .map_err(|e| internal(e.to_string()))?;

        Ok(Json(PlanOut {
            executed: true,
            action: "restore_trash".to_string(),
            targets: target_strings,
            dest: None,
            note: "원래 자리로 되돌렸습니다.".to_string(),
        }))
    }
}


// ───────────────────────── 배치 헬퍼 ─────────────────────────

/// 실제로 돌리지 않고 대상만 담은 결과
fn dry_run_batch(inputs: &[String]) -> BatchOut {
    BatchOut {
        dry_run: true,
        total: inputs.len(),
        succeeded: 0,
        failed: 0,
        items: inputs
            .iter()
            .map(|input| BatchItemOut {
                input: input.clone(),
                output: None,
                error: None,
            })
            .collect(),
    }
}

impl QuickFolderServer {
    /// 입력 경로를 루트 검사한 뒤 실제 파일 목록으로 펼친다.
    ///
    /// 폴더를 주면 그 안의 해당 확장자 파일들을 모은다. `qf_image_batch` 와 같은 규칙이다.
    async fn collect_files(
        &self,
        paths: &[String],
        recursive: bool,
        exts: &[&str],
    ) -> Result<Vec<String>, ErrorData> {
        let roots = self.roots.check_all(paths).map_err(invalid)?;
        if roots.is_empty() {
            return Err(invalid("paths가 비어 있습니다."));
        }
        let wanted: Vec<String> = exts.iter().map(|e| e.to_string()).collect();
        let files = collect_files(&roots, recursive, &wanted);
        if files.is_empty() {
            return Err(invalid(format!(
                "처리할 파일이 없습니다. 지원 확장자: {}",
                exts.join(", ")
            )));
        }
        Ok(files.iter().map(|p| p.display().to_string()).collect())
    }

    /// 건별 실패를 격리하며 순차 처리하고 요약을 돌려준다.
    ///
    /// **순차 처리다.** ffmpeg 처럼 이미 내부에서 코어를 다 쓰는 작업이 섞여 있어서,
    /// 여기서 또 병렬로 돌리면 서로 잡아먹는다. 결과는 입력 순서를 보존한다.
    async fn run_simple_batch<F, Fut>(
        &self,
        inputs: Vec<String>,
        dry_run: bool,
        run: F,
    ) -> Result<Json<BatchOut>, ErrorData>
    where
        F: Fn(String) -> Fut,
        Fut: std::future::Future<Output = Result<String, String>>,
    {
        if dry_run {
            return Ok(Json(dry_run_batch(&inputs)));
        }

        let mut items = Vec::with_capacity(inputs.len());
        for input in inputs {
            match run(input.clone()).await {
                Ok(output) => items.push(BatchItemOut {
                    input,
                    output: Some(output),
                    error: None,
                }),
                Err(error) => items.push(BatchItemOut {
                    input,
                    output: None,
                    error: Some(error),
                }),
            }
        }

        let succeeded = items.iter().filter(|i| i.error.is_none()).count();
        Ok(Json(BatchOut {
            dry_run: false,
            total: items.len(),
            succeeded,
            failed: items.len() - succeeded,
            items,
        }))
    }
}

#[tool_handler(
    router = self.tool_router,
    name = "quickfolder",
    instructions = "QuickFolder의 파일·이미지 기능을 제공한다. \
접근은 서버 실행 시 QF_MCP_ROOTS로 허용한 디렉토리로 제한되며, 그 밖의 경로는 거부된다. \
허용 루트는 qf_info로 확인할 수 있다. \
이미지 연산(qf_image_batch)은 원본을 남기고 접미사가 붙은 새 파일을 만든다(예: a.png → a_pixel.png). \
qf_file_ops와 qf_delete는 파괴적이라 confirm=true 없이는 실행되지 않고 계획만 돌려준다. \
삭제는 휴지통 경유만 지원하며, 앱의 Ctrl+Z 실행취소는 이 경로에 적용되지 않는다."
)]
impl ServerHandler for QuickFolderServer {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 지킬 UI가 없으므로 무거운 이미지 연산 한도를 코어 수까지 연다.
    set_heavy_op_limit(default_jobs());

    let app_paths = AppPaths::from_bundle_identifier(BUNDLE_IDENTIFIER)?;
    let roots = Roots::from_env(ROOTS_ENV);
    if roots.is_empty() {
        // stdout은 MCP 프로토콜 전용이므로 경고는 stderr로만 낸다.
        eprintln!(
            "경고: {} 가 비어 있어 모든 경로 접근이 거부됩니다. 예) {}=\"$HOME/Pictures:$HOME/Downloads\"",
            ROOTS_ENV, ROOTS_ENV
        );
    }

    let service = QuickFolderServer::new(app_paths, roots)
        .serve(rmcp::transport::io::stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod response_shape_tests {
    use super::*;

    /// MCP 의 `structuredContent` 는 객체여야 한다. 최상위가 배열이면 클라이언트가
    /// 스키마 검증에서 통째로 거부한다 (Claude Code: `expected "record"`).
    /// 목록 응답이 실수로 다시 `Vec` 로 돌아가는 것을 여기서 막는다.
    fn assert_object(value: serde_json::Value) {
        assert!(
            value.is_object(),
            "목록 응답 최상위는 객체여야 한다 (배열 금지): {}",
            value
        );
    }

    #[test]
    fn entries_response_is_an_object() {
        assert_object(serde_json::to_value(EntriesOut { entries: vec![] }).unwrap());
    }

    #[test]
    fn duplicate_groups_response_is_an_object() {
        assert_object(serde_json::to_value(DuplicateGroupsOut { groups: vec![] }).unwrap());
    }

    #[test]
    fn all_new_list_responses_are_objects_too() {
        // 목록을 돌려주는 신규 도구가 늘 때마다 여기 한 줄 추가할 것
        assert_object(serde_json::to_value(ImageInfoOut { items: vec![] }).unwrap());
        assert_object(serde_json::to_value(TextOut { items: vec![] }).unwrap());
        assert_object(
            serde_json::to_value(BatchOut {
                dry_run: false,
                total: 0,
                succeeded: 0,
                failed: 0,
                items: vec![],
            })
            .unwrap(),
        );
    }

    #[test]
    fn entries_key_is_stable() {
        // 프롬프트와 위키가 이 키 이름에 의존한다
        let value = serde_json::to_value(EntriesOut { entries: vec![] }).unwrap();
        assert!(value.get("entries").is_some(), "키 이름은 entries 로 고정");
    }
}
