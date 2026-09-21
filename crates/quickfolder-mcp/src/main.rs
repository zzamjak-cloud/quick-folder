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

use quickfolder_core::batch::{default_jobs, summarize};
use quickfolder_core::image_ops::{run_image_batch, set_heavy_op_limit, ImageBatchOp};
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
    /// pixelate: 출력 최대 변 길이 (0이면 원본 유지)
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
    ) -> Result<Json<Vec<EntryOut>>, ErrorData> {
        let path = self.roots.check(&params.path).map_err(invalid)?;
        let entries = quickfolder_core::list_directory(
            self.app_paths.clone(),
            path.display().to_string(),
        )
        .await
        .map_err(|e| internal(e.to_string()))?;
        Ok(Json(entries.into_iter().map(EntryOut::from).collect()))
    }

    /// 파일 이름 검색
    #[tool(
        name = "qf_search_files",
        description = "디렉토리 하위에서 이름에 문자열이 포함된 파일을 찾는다. macOS에서는 Spotlight 인덱스를 우선 사용한다."
    )]
    pub async fn qf_search_files(
        &self,
        Parameters(params): Parameters<SearchParams>,
    ) -> Result<Json<Vec<EntryOut>>, ErrorData> {
        let root = self.roots.check(&params.root).map_err(invalid)?;
        let entries = quickfolder_core::search_files(
            root.display().to_string(),
            params.query,
            params.limit.unwrap_or(100),
        )
        .await
        .map_err(internal)?;
        Ok(Json(entries.into_iter().map(EntryOut::from).collect()))
    }

    /// 중복 파일 탐색
    #[tool(
        name = "qf_find_duplicates",
        description = "디렉토리 하위에서 내용이 동일한 파일 그룹을 찾는다. 크기로 후보를 좁힌 뒤 해시로 확인한다."
    )]
    pub async fn qf_find_duplicates(
        &self,
        Parameters(params): Parameters<RootParam>,
    ) -> Result<Json<Vec<DuplicateGroupOut>>, ErrorData> {
        let root = self.roots.check(&params.root).map_err(invalid)?;
        let groups = quickfolder_core::find_duplicate_files(root.display().to_string())
            .await
            .map_err(internal)?;
        Ok(Json(
            groups
                .into_iter()
                .map(|g| DuplicateGroupOut {
                    size: g.size,
                    files: g.files.into_iter().map(EntryOut::from).collect(),
                })
                .collect(),
        ))
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
