//! QuickFolder 배치 CLI (`qf`)
//!
//! GUI 앱과 같은 코어(quickfolder-core)를 쓰되, 지킬 UI가 없으므로 동시성을
//! 논리 코어 수까지 연다. 캐시 경로도 앱과 공유하므로 이미 내려받은
//! ffmpeg·썸네일 캐시를 그대로 재사용한다.

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use clap::{Parser, Subcommand};
use quickfolder_core::batch::{collect_files, default_jobs, summarize, BatchOutcome, BatchProgress};
use quickfolder_core::image_ops::{run_image_batch, set_heavy_op_limit, ImageBatchOp};
use quickfolder_core::paths::AppPaths;
use quickfolder_core::progress::{null_sink, Progress, ProgressSink};

/// GUI 앱과 캐시를 공유하기 위한 번들 식별자
const BUNDLE_IDENTIFIER: &str = "com.quickfolder.widget";

#[derive(Parser)]
#[command(name = "qf", version, about = "QuickFolder 배치 CLI", long_about = None)]
struct Cli {
    /// 동시 처리 수 (0이면 논리 코어 수)
    #[arg(short, long, global = true, default_value_t = 0)]
    jobs: usize,

    /// 하위 폴더까지 훑는다
    #[arg(short, long, global = true)]
    recursive: bool,

    /// 결과를 JSON으로 출력한다 (stdout)
    #[arg(long, global = true)]
    json: bool,

    /// 실제로 처리하지 않고 대상 목록만 보여준다
    #[arg(long, global = true)]
    dry_run: bool,

    /// 진행률 출력을 끈다
    #[arg(short, long, global = true)]
    quiet: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// 이미지 일괄 처리
    Image {
        #[command(subcommand)]
        op: ImageCommand,
    },
    /// 파일 이름 검색
    Search {
        root: PathBuf,
        query: String,
        #[arg(short, long, default_value_t = 100)]
        limit: usize,
    },
    /// 내용이 같은 중복 파일 탐색
    Duplicates { root: PathBuf },
    /// 최근 수정된 파일
    Recent {
        roots: Vec<PathBuf>,
        #[arg(short, long, default_value_t = 7)]
        days: u32,
    },
    /// 환경 진단 (캐시 경로, 동시성, ffmpeg)
    Info,
    /// MCP 서버를 AI 클라이언트에 등록·해제한다 (앱 설정 팝업과 같은 로직)
    Mcp {
        #[command(subcommand)]
        action: McpCommand,
    },
}

#[derive(Subcommand)]
enum McpCommand {
    /// 클라이언트별 등록 상태 조회 (읽기 전용)
    Status,
    /// 등록. 허용 폴더를 하나 이상 지정해야 한다.
    Install {
        /// claude-code | claude-desktop | cursor | gemini-cli | codex-cli
        #[arg(long)]
        client: String,
        /// 에이전트가 접근할 수 있는 폴더 (반복 지정 가능)
        #[arg(long = "root", required = true)]
        roots: Vec<PathBuf>,
    },
    /// 등록 해제
    Uninstall {
        #[arg(long)]
        client: String,
    },
}

#[derive(Subcommand)]
enum ImageCommand {
    /// 픽셀화 (+ 선택적 컬러 양자화)
    Pixelate {
        paths: Vec<PathBuf>,
        #[arg(long, default_value_t = 8)]
        pixel_size: u32,
        /// 출력 최대 변 길이 (0이면 원본 크기 유지)
        #[arg(long, default_value_t = 0)]
        scale: u32,
        /// 팔레트 색상 수 (0이면 양자화 안 함)
        #[arg(long, default_value_t = 0)]
        max_colors: u32,
    },
    /// 크기 변경
    Resize {
        paths: Vec<PathBuf>,
        #[arg(long)]
        width: u32,
        #[arg(long)]
        height: u32,
    },
    /// 품질 프리셋 압축
    Compress {
        paths: Vec<PathBuf>,
        #[arg(long, default_value = "medium", value_parser = ["low", "medium", "high"])]
        quality: String,
    },
    /// 영역 잘라내기
    Crop {
        paths: Vec<PathBuf>,
        #[arg(long)]
        x: u32,
        #[arg(long)]
        y: u32,
        #[arg(long)]
        width: u32,
        #[arg(long)]
        height: u32,
    },
    /// ICO 변환
    ToIco { paths: Vec<PathBuf> },
    /// ICNS 변환
    ToIcns { paths: Vec<PathBuf> },
    /// 흰 배경 제거
    RemoveBg {
        paths: Vec<PathBuf>,
        #[arg(long, default_value_t = 240)]
        threshold: u8,
        #[arg(long, default_value_t = 0)]
        feather: u8,
        #[arg(long)]
        trim: bool,
    },
}

impl ImageCommand {
    fn into_parts(self) -> (Vec<PathBuf>, ImageBatchOp) {
        match self {
            Self::Pixelate {
                paths,
                pixel_size,
                scale,
                max_colors,
            } => (
                paths,
                ImageBatchOp::Pixelate {
                    pixel_size,
                    scale,
                    max_colors,
                },
            ),
            Self::Resize {
                paths,
                width,
                height,
            } => (paths, ImageBatchOp::Resize { width, height }),
            Self::Compress { paths, quality } => (paths, ImageBatchOp::Compress { quality }),
            Self::Crop {
                paths,
                x,
                y,
                width,
                height,
            } => (
                paths,
                ImageBatchOp::Crop {
                    x,
                    y,
                    width,
                    height,
                },
            ),
            Self::ToIco { paths } => (paths, ImageBatchOp::ToIco),
            Self::ToIcns { paths } => (paths, ImageBatchOp::ToIcns),
            Self::RemoveBg {
                paths,
                threshold,
                feather,
                trim,
            } => (
                paths,
                ImageBatchOp::RemoveWhiteBg {
                    threshold,
                    feather,
                    trim,
                },
            ),
        }
    }
}

/// 진행률을 stderr로 흘려 stdout(결과)을 파싱 가능하게 유지한다.
struct StderrProgress;

impl ProgressSink<BatchProgress> for StderrProgress {
    fn send(&self, p: BatchProgress) -> bool {
        eprintln!(
            "[{}/{}] {} {}",
            p.done,
            p.total,
            if p.ok { "ok  " } else { "실패" },
            p.current
        );
        true
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    // 지킬 UI가 없으므로 무거운 이미지 연산 한도를 코어 수까지 연다.
    let jobs = if cli.jobs == 0 { default_jobs() } else { cli.jobs };
    set_heavy_op_limit(jobs);

    let progress: Progress<BatchProgress> = if cli.quiet || cli.json {
        null_sink()
    } else {
        Arc::new(StderrProgress)
    };

    match cli.command {
        Command::Image { op } => {
            let (roots, op) = op.into_parts();
            if roots.is_empty() {
                eprintln!("처리할 경로를 하나 이상 지정해야 합니다.");
                return ExitCode::from(2);
            }
            if cli.dry_run {
                return dry_run(&roots, cli.recursive, &op, cli.json);
            }
            let outcomes = quickfolder_core::runtime::block_on(run_image_batch(
                roots,
                cli.recursive,
                op,
                jobs,
                progress,
            ));
            report_batch(&outcomes, cli.json)
        }
        Command::Search { root, query, limit } => {
            let result = quickfolder_core::runtime::block_on(quickfolder_core::search_files(
                root.to_string_lossy().to_string(),
                query,
                limit,
            ));
            print_query_result(result)
        }
        Command::Duplicates { root } => {
            let result = quickfolder_core::runtime::block_on(
                quickfolder_core::find_duplicate_files(root.to_string_lossy().to_string()),
            );
            print_query_result(result)
        }
        Command::Recent { roots, days } => {
            if roots.is_empty() {
                eprintln!("경로를 하나 이상 지정해야 합니다.");
                return ExitCode::from(2);
            }
            let roots = roots.iter().map(|p| p.to_string_lossy().to_string()).collect();
            let result =
                quickfolder_core::runtime::block_on(quickfolder_core::get_recent_files(roots, days));
            print_query_result(result)
        }
        Command::Info => print_info(jobs, cli.json),
        Command::Mcp { action } => run_mcp(action, cli.json),
    }
}

fn dry_run(roots: &[PathBuf], recursive: bool, op: &ImageBatchOp, json: bool) -> ExitCode {
    let inputs = collect_files(roots, recursive, &op.input_extensions());
    if json {
        let payload = serde_json::json!({
            "dry_run": true,
            "op": op,
            "total": inputs.len(),
            "inputs": inputs,
        });
        println!("{}", serde_json::to_string_pretty(&payload).unwrap());
    } else {
        for input in &inputs {
            println!("{}", input.display());
        }
        eprintln!("대상 {}건 (dry-run — 아무것도 바꾸지 않았습니다)", inputs.len());
    }
    ExitCode::SUCCESS
}

fn report_batch(outcomes: &[BatchOutcome<String>], json: bool) -> ExitCode {
    let summary = summarize(outcomes);
    if json {
        let items: Vec<serde_json::Value> = outcomes
            .iter()
            .map(|o| match &o.result {
                Ok(output) => serde_json::json!({ "input": o.input, "output": output }),
                Err(e) => serde_json::json!({ "input": o.input, "error": e.to_string() }),
            })
            .collect();
        let payload = serde_json::json!({
            "total": summary.total,
            "succeeded": summary.succeeded,
            "failed": summary.failed,
            "items": items,
        });
        println!("{}", serde_json::to_string_pretty(&payload).unwrap());
    } else {
        for outcome in outcomes {
            match &outcome.result {
                Ok(output) => println!("{}", output),
                Err(e) => eprintln!("실패 {}: {}", outcome.input.display(), e),
            }
        }
        eprintln!(
            "완료 {}건 / 실패 {}건 (총 {}건)",
            summary.succeeded, summary.failed, summary.total
        );
    }
    if summary.failed > 0 {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

/// 조회 계열 결과 출력. 구조체가 중첩이라 표 형태로 줄이면 정보가 깎이므로
/// `--json` 여부와 무관하게 JSON으로 낸다.
fn print_query_result<T: serde::Serialize>(result: Result<T, String>) -> ExitCode {
    match result {
        Ok(value) => match serde_json::to_string_pretty(&value) {
            Ok(text) => {
                println!("{}", text);
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("결과 직렬화 실패: {}", e);
                ExitCode::FAILURE
            }
        },
        Err(e) => {
            eprintln!("{}", e);
            ExitCode::FAILURE
        }
    }
}

fn run_mcp(action: McpCommand, json: bool) -> ExitCode {
    use quickfolder_core::mcp_setup;

    let server = mcp_setup::find_qf_mcp_path();
    match action {
        McpCommand::Status => {
            let reference = server.clone().unwrap_or_default();
            let statuses = mcp_setup::client_statuses(&reference);
            if json {
                let payload = serde_json::json!({
                    "server_path": server.as_ref().map(|p| p.display().to_string()),
                    "clients": statuses,
                });
                println!("{}", serde_json::to_string_pretty(&payload).unwrap());
            } else {
                match &server {
                    Some(p) => println!("MCP 서버 : {}", p.display()),
                    None => println!("MCP 서버 : 찾을 수 없음"),
                }
                println!();
                for s in &statuses {
                    let mark = match s.state {
                        mcp_setup::RegistrationState::Registered => "등록됨",
                        mcp_setup::RegistrationState::Outdated => "경로 불일치",
                        mcp_setup::RegistrationState::NotRegistered => "미등록",
                    };
                    let exists = if s.config_exists { "" } else { " (설정 파일 없음)" };
                    println!("{:<16} {:<10} {}{}", s.label, mark, s.config_path, exists);
                }
            }
            ExitCode::SUCCESS
        }
        McpCommand::Install { client, roots } => {
            let Some(command) = server else {
                eprintln!("qf-mcp 실행 파일을 찾을 수 없습니다.");
                return ExitCode::FAILURE;
            };
            match mcp_setup::register(&client, &command, &roots) {
                Ok(outcome) => {
                    println!("등록 완료: {}", outcome.config_path);
                    if let Some(backup) = outcome.backup_path {
                        println!("백업      : {}", backup);
                    }
                    println!("적용하려면 해당 클라이언트를 재시작하세요.");
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("{}", e);
                    ExitCode::FAILURE
                }
            }
        }
        McpCommand::Uninstall { client } => match mcp_setup::unregister(&client) {
            Ok(outcome) => {
                println!("해제 완료: {}", outcome.config_path);
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("{}", e);
                ExitCode::FAILURE
            }
        },
    }
}

fn print_info(jobs: usize, json: bool) -> ExitCode {
    let cache = AppPaths::from_bundle_identifier(BUNDLE_IDENTIFIER)
        .map(|p| p.cache_dir().to_path_buf())
        .unwrap_or_default();
    let ffmpeg = quickfolder_core::runtime::block_on(quickfolder_core::check_ffmpeg())
        .unwrap_or(false);

    if json {
        let payload = serde_json::json!({
            "cache_dir": cache,
            "cache_exists": cache.exists(),
            "jobs": jobs,
            "logical_cores": default_jobs(),
            "heavy_op_limit": quickfolder_core::image_ops::heavy_op_limit(),
            "ffmpeg": ffmpeg,
        });
        println!("{}", serde_json::to_string_pretty(&payload).unwrap());
    } else {
        println!("캐시 경로     : {} ({})", cache.display(), if cache.exists() { "있음" } else { "없음" });
        println!("동시 처리 수  : {} (논리 코어 {})", jobs, default_jobs());
        println!("heavy-op 한도 : {}", quickfolder_core::image_ops::heavy_op_limit());
        println!("ffmpeg        : {}", if ffmpeg { "사용 가능" } else { "없음" });
    }
    ExitCode::SUCCESS
}
