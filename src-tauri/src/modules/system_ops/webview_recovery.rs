// WebView2 프로필 손상으로 인한 "흰 화면" 자동 복구.
//
// 배경: WebView2 런타임이 자동 업데이트되거나 앱 번들 해시가 바뀌는 시점에
// `EBWebView` 프로필의 V8 code cache / HTTP cache 가 무효 상태로 남으면
// 스크립트가 아예 실행되지 않아 창은 뜨지만 내용이 흰 화면으로 남는다.
// 이 경우 Rust 측에는 아무 에러도 남지 않아 사용자는 원인을 알 수 없다.
//
// 복구 전략:
//   1. 프론트엔드가 마운트되면 `mark_frontend_ready` 를 호출한다.
//   2. 워치독이 제한 시간 안에 그 신호를 못 받으면 복구 요청 마커를 남기고 재시작한다.
//   3. 다음 부팅 최초 시점(웹뷰 생성 전)에 마커를 발견하면 캐시 폴더만 지우고 진행한다.
//
// 캐시 폴더는 웹뷰가 살아 있는 동안 잠겨 있어 삭제할 수 없다. 그래서 삭제는
// 반드시 `run()` 최상단, 즉 Tauri 가 창·웹뷰를 만들기 전에 수행해야 한다(회귀 주의).
//
// `Local Storage` 등 사용자 데이터는 어떤 경우에도 건드리지 않는다.
// 카테고리·탭·창 상태·테마가 전부 localStorage 에 저장되기 때문이다.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// `tauri.conf.json` 의 identifier. 앱 데이터 경로 계산에 사용한다.
const APP_IDENTIFIER: &str = "com.quickfolder.widget";

/// WebView2 사용자 데이터 폴더 이름 (Tauri 가 고정으로 사용).
const WEBVIEW_PROFILE_DIR: &str = "EBWebView";

/// 다음 부팅에서 캐시를 정리하라는 요청 마커.
const PENDING_MARKER: &str = ".webview-recovery-pending";

/// 이번 부팅이 이미 복구를 수행했음을 나타내는 마커. 재시작 루프를 막는다.
const DONE_MARKER: &str = ".webview-recovery-done";

/// 프론트엔드 준비 신호를 기다리는 시간. React 마운트만 확인하므로 넉넉한 값이다.
const WATCHDOG_TIMEOUT: Duration = Duration::from_secs(15);

/// 프론트엔드가 실제로 마운트됐는지 여부.
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

/// 삭제 대상 캐시 폴더 (프로필 루트 기준 상대 경로).
/// 스크립트 실행·렌더링에만 쓰이는 파생 데이터라 지워도 재생성된다.
const CACHE_RELATIVE_PATHS: &[&str] = &[
    "Default/Cache",
    "Default/Code Cache",
    "Default/GPUCache",
    "Default/DawnGraphiteCache",
    "Default/DawnWebGPUCache",
    "GPUPersistentCache",
    "GraphiteDawnCache",
    "GrShaderCache",
    "ShaderCache",
];

/// 어떤 경우에도 삭제하면 안 되는 사용자 데이터 (프로필 루트 기준 상대 경로).
/// 테스트가 `CACHE_RELATIVE_PATHS` 와의 교집합이 없음을 보장한다.
#[cfg(test)]
const PROTECTED_RELATIVE_PATHS: &[&str] = &[
    "Default/Local Storage",
    "Default/Session Storage",
    "Default/IndexedDB",
    "Default/WebStorage",
    "Default/Preferences",
    "Local State",
];

/// 복구 이력 기록 파일. 릴리스 빌드에는 로그 플러그인이 없어 `log::` 매크로가 무음이므로
/// 나중에 원인을 되짚을 수 있도록 별도로 남긴다.
const HISTORY_FILE: &str = "webview-recovery.log";

/// 복구 이력을 한 줄 덧붙인다. 실패해도 기동에 영향을 주지 않는다.
///
/// Windows 기본 도구(메모장, PowerShell 5.1 `Get-Content`)는 BOM 이 없으면 UTF-8 을
/// 시스템 코드페이지로 읽어 한글이 깨진다. 사람이 열어볼 진단 파일이므로 BOM 을 붙인다.
fn append_history(root: &Path, message: &str) {
    use std::io::Write;

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");

    let _ = fs::create_dir_all(root);
    let path = root.join(HISTORY_FILE);
    let needs_bom = !path.exists();

    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| {
            if needs_bom {
                file.write_all(b"\xEF\xBB\xBF")?;
            }
            writeln!(file, "[{timestamp}] {message}")
        });
}

/// 앱 로컬 데이터 루트(`%LOCALAPPDATA%\com.quickfolder.widget`).
/// Tauri `AppHandle` 이 아직 없는 시점에도 계산할 수 있어야 하므로 `dirs` 로 직접 구한다.
fn app_data_root() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join(APP_IDENTIFIER))
}

/// 정리 대상 캐시 폴더의 절대 경로 목록.
pub fn webview_cache_targets(profile_root: &Path) -> Vec<PathBuf> {
    CACHE_RELATIVE_PATHS
        .iter()
        .map(|relative| {
            let mut path = profile_root.to_path_buf();
            for segment in relative.split('/') {
                path.push(segment);
            }
            path
        })
        .collect()
}

/// 캐시 폴더를 삭제한다. 잠겨 있거나 없는 폴더는 조용히 건너뛴다.
/// 반환값은 실제로 삭제된 폴더 수.
fn purge_webview_cache(profile_root: &Path) -> usize {
    webview_cache_targets(profile_root)
        .into_iter()
        .filter(|target| target.exists() && fs::remove_dir_all(target).is_ok())
        .count()
}

/// 복구 요청 마커가 있으면 소비하고 `true` 를 반환한다.
/// 소비 시 완료 마커로 바꿔 이번 부팅이 복구 시도였음을 남긴다.
pub fn consume_pending_recovery_in(root: &Path) -> bool {
    let pending = root.join(PENDING_MARKER);
    if !pending.exists() {
        return false;
    }

    let _ = fs::remove_file(&pending);
    let _ = fs::write(root.join(DONE_MARKER), b"");
    true
}

/// 이번 부팅이 이미 복구를 시도했는지 여부. 재시작 루프 방지에 쓴다.
pub fn recovery_already_attempted_in(root: &Path) -> bool {
    root.join(DONE_MARKER).exists()
}

/// 다음 부팅에서 캐시를 정리하도록 요청한다.
pub fn request_recovery_in(root: &Path) -> io::Result<()> {
    fs::create_dir_all(root)?;
    fs::write(root.join(PENDING_MARKER), b"")
}

/// 복구 상태를 초기화한다. 정상 기동이 확인되면 호출해 다음 장애에 다시 대비한다.
pub fn clear_recovery_state_in(root: &Path) {
    let _ = fs::remove_file(root.join(PENDING_MARKER));
    let _ = fs::remove_file(root.join(DONE_MARKER));
}

/// `run()` 최상단에서 호출한다. 이전 실행이 흰 화면으로 판정됐으면
/// 웹뷰가 만들어지기 전에 캐시를 정리한다.
pub fn purge_stale_webview_cache_if_pending() {
    let Some(root) = app_data_root() else {
        return;
    };

    if !consume_pending_recovery_in(&root) {
        return;
    }

    let removed = purge_webview_cache(&root.join(WEBVIEW_PROFILE_DIR));
    log::warn!("흰 화면 복구: WebView2 캐시 폴더 {removed}개를 정리하고 재기동합니다.");
    append_history(&root, &format!("캐시 폴더 {removed}개 정리 후 재기동"));
}

/// 프론트엔드 마운트 신호. `index.tsx` 가 렌더 직후 호출한다.
#[tauri::command]
pub fn mark_frontend_ready() {
    if FRONTEND_READY.swap(true, Ordering::SeqCst) {
        return;
    }

    if let Some(root) = app_data_root() {
        clear_recovery_state_in(&root);
    }
}

/// 흰 화면 워치독을 띄운다. 제한 시간 안에 준비 신호가 없으면 1회만 재시작한다.
///
/// - Windows 전용: 정리 대상인 `EBWebView` 프로필은 WebView2 에만 존재한다.
/// - 디버그 빌드 제외: dev 서버가 늦게 뜨는 상황을 장애로 오인하지 않도록 한다.
pub fn spawn_white_screen_watchdog(app: &tauri::AppHandle) {
    if !cfg!(windows) || cfg!(debug_assertions) {
        return;
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(WATCHDOG_TIMEOUT);

        if FRONTEND_READY.load(Ordering::SeqCst) {
            return;
        }

        let Some(root) = app_data_root() else {
            return;
        };

        // 직전 부팅에서 이미 캐시를 정리했는데도 실패했다면 원인이 다른 곳에 있다.
        // 무한 재시작을 막기 위해 로그만 남기고 멈춘다.
        if recovery_already_attempted_in(&root) {
            log::error!(
                "흰 화면 복구 실패: 캐시 정리 후에도 프론트엔드가 응답하지 않아 재시작을 중단합니다."
            );
            append_history(&root, "캐시 정리 후에도 흰 화면 — 재시작 중단");
            return;
        }

        if let Err(error) = request_recovery_in(&root) {
            log::error!("흰 화면 복구 요청 기록 실패: {error}");
            return;
        }

        // 마커를 쓰는 사이에 준비 신호가 도착했을 수 있다. 멀쩡한 앱을 재시작하지 않도록
        // 마지막으로 한 번 더 확인하고, 늦게 온 신호였다면 남긴 마커를 되돌린다.
        if FRONTEND_READY.load(Ordering::SeqCst) {
            clear_recovery_state_in(&root);
            return;
        }

        log::warn!("흰 화면 감지: WebView2 캐시를 정리하기 위해 앱을 재시작합니다.");
        append_history(
            &root,
            &format!(
                "{}초 안에 프론트엔드 준비 신호 없음 — 재시작 요청",
                WATCHDOG_TIMEOUT.as_secs()
            ),
        );

        let restart_handle = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            restart_handle.restart();
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempRoot {
        path: PathBuf,
    }

    impl TempRoot {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "quickfolder_webview_recovery_{}_{}_{}",
                name,
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("시스템 시간 오류")
                    .as_nanos()
            ));
            fs::create_dir_all(&path).expect("임시 디렉토리 생성 실패");
            Self { path }
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn 캐시_대상에는_사용자_데이터가_포함되지_않는다() {
        let root = Path::new("profile");
        let targets = webview_cache_targets(root);

        for protected in PROTECTED_RELATIVE_PATHS {
            let mut forbidden = root.to_path_buf();
            for segment in protected.split('/') {
                forbidden.push(segment);
            }
            assert!(
                !targets.contains(&forbidden),
                "사용자 데이터가 삭제 대상에 포함됨: {protected}"
            );
        }
    }

    #[test]
    fn 캐시_대상은_모두_프로필_하위_경로다() {
        let root = Path::new("profile");
        for target in webview_cache_targets(root) {
            assert!(
                target.starts_with(root),
                "프로필 밖 경로가 대상에 포함됨: {}",
                target.display()
            );
        }
    }

    #[test]
    fn 요청_마커가_없으면_복구하지_않는다() {
        let root = TempRoot::new("no_marker");
        assert!(!consume_pending_recovery_in(&root.path));
        assert!(!recovery_already_attempted_in(&root.path));
    }

    #[test]
    fn 요청_마커는_한_번만_소비된다() {
        let root = TempRoot::new("consume_once");
        request_recovery_in(&root.path).expect("복구 요청 기록 실패");

        assert!(consume_pending_recovery_in(&root.path), "첫 소비는 성공해야 함");
        assert!(
            recovery_already_attempted_in(&root.path),
            "소비 후에는 완료 마커가 남아야 함"
        );
        assert!(
            !consume_pending_recovery_in(&root.path),
            "같은 요청이 두 번 소비되면 재시작 루프가 생김"
        );
    }

    #[test]
    fn 정상_기동이_확인되면_복구_상태가_초기화된다() {
        let root = TempRoot::new("clear_state");
        request_recovery_in(&root.path).expect("복구 요청 기록 실패");
        consume_pending_recovery_in(&root.path);

        clear_recovery_state_in(&root.path);

        assert!(
            !recovery_already_attempted_in(&root.path),
            "초기화 후에는 다음 장애에 다시 복구할 수 있어야 함"
        );
    }

    #[test]
    fn 캐시_폴더만_삭제하고_사용자_데이터는_남긴다() {
        let root = TempRoot::new("purge");
        let profile = root.path.join(WEBVIEW_PROFILE_DIR);

        let code_cache = profile.join("Default").join("Code Cache");
        let local_storage = profile.join("Default").join("Local Storage");
        fs::create_dir_all(&code_cache).expect("캐시 폴더 생성 실패");
        fs::create_dir_all(&local_storage).expect("사용자 데이터 폴더 생성 실패");
        fs::write(code_cache.join("compiled.bin"), b"stale").expect("캐시 파일 생성 실패");
        fs::write(local_storage.join("data.ldb"), b"keep").expect("사용자 데이터 생성 실패");

        let removed = purge_webview_cache(&profile);

        assert_eq!(removed, 1, "존재하는 캐시 폴더 1개만 삭제돼야 함");
        assert!(!code_cache.exists(), "캐시 폴더가 삭제돼야 함");
        assert!(
            local_storage.join("data.ldb").exists(),
            "사용자 데이터는 보존돼야 함"
        );
    }
}
