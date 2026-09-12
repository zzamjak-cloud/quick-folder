// 공통 타입 정의

// 파일 타입 enum (프론트엔드 FileType 유니온과 1:1 매핑)
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Image,
    Video,
    Document,
    Code,
    Archive,
    Font,
    Directory,
    App,
    Other,
}

// 파일 항목 구조체 (파일 탐색기용)
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64, // epoch ms
    pub identity: String,
    pub file_type: FileType,
}

pub fn file_identity(meta: &std::fs::Metadata) -> String {
    let created = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        // ctime은 rename·xattr 등 내용과 무관한 메타데이터 변경만으로 바뀌어
        // 썸네일 캐시가 불필요하게 무효화되므로 제외한다(클라우드 materialize 노이즈도 동일).
        // 내용 변경 감지는 ino+mtime+len으로 충분하다.
        return format!(
            "unix:{}:{}:{}:{}:{}",
            meta.dev(),
            meta.ino(),
            created,
            modified,
            meta.len()
        );
    }

    #[cfg(not(unix))]
    {
        format!("portable:{}:{}:{}", created, modified, meta.len())
    }
}

// macOS 번들 확장자 — 파일시스템상 디렉토리지만 Finder는 단일 항목(앱·패키지)으로 다룬다.
// 여기에 없는 확장자는 평범한 폴더로 취급된다.
#[cfg(target_os = "macos")]
const MACOS_BUNDLE_EXTS: &[&str] = &[
    "app",
    "appex",
    "bundle",
    "framework",
    "kext",
    "plugin",
    "component",
    "qlgenerator",
    "mdimporter",
    "prefpane",
    "saver",
    "wdgt",
    "workflow",
    "xpc",
    "rtfd",
    "scptd",
    "download",
    "docset",
    "dsym",
    "sparsebundle",
    "photoslibrary",
    "imovielibrary",
    "tvlibrary",
    "aplibrary",
    "fcpbundle",
    "band",
    "logicx",
    "xcodeproj",
    "xcworkspace",
    "playground",
];

// 경로가 macOS 번들(.app 등)인지 판정한다. 다른 OS에서는 항상 false.
#[cfg(target_os = "macos")]
pub fn is_package_bundle(path: &std::path::Path) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .map(|ext| MACOS_BUNDLE_EXTS.contains(&ext.as_str()))
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
pub fn is_package_bundle(_path: &std::path::Path) -> bool {
    false
}

// 표시용 (is_dir, FileType) 결정.
// macOS 번들은 실제로 디렉토리여도 폴더 진입 대신 단일 앱/패키지로 노출한다.
pub fn entry_kind(path: &std::path::Path, name: &str, meta_is_dir: bool) -> (bool, FileType) {
    if !meta_is_dir {
        return (false, classify_file(name));
    }
    if is_package_bundle(path) {
        return (false, FileType::App);
    }
    (true, FileType::Directory)
}

// 파일 타입 분류 헬퍼
pub fn classify_file(name: &str) -> FileType {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "icns" | "psd"
        | "psb" => FileType::Image,
        "mp4" | "mov" | "avi" | "mkv" | "webm" => FileType::Video,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "gslides"
        | "gdoc" | "gsheet" | "gmap" => FileType::Document,
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h" | "css"
        | "html" | "json" | "toml" | "yaml" | "yml" | "cs" | "shader" | "glsl" | "hlsl" | "lua"
        | "rb" | "php" | "swift" | "kt" | "sh" | "bat" | "ps1" | "r" | "sql" | "scala" | "dart"
        | "zig" | "xml" | "csv" | "log" => FileType::Code,
        "zip" | "tar" | "gz" | "7z" | "rar" | "dmg" | "pkg" | "unitypackage" => FileType::Archive,
        "ttf" | "otf" | "woff" | "woff2" | "ttc" => FileType::Font,
        _ => {
            // 확장자 없는 알려진 텍스트 파일 감지
            let lower_name = name
                .rsplit('/')
                .next()
                .unwrap_or(name)
                .rsplit('\\')
                .next()
                .unwrap_or(name)
                .to_lowercase();
            match lower_name.as_str() {
                "license" | "licence" | "readme" | "makefile" | "dockerfile" | "gemfile"
                | "rakefile" | "procfile" | "vagrantfile" | ".gitignore" | ".gitattributes"
                | ".editorconfig" | ".env" | ".npmrc" | ".prettierrc" | ".eslintrc"
                | ".dockerignore" => FileType::Document,
                _ => FileType::Other,
            }
        }
    }
}

// ===== 테스트 =====

#[cfg(test)]
mod tests {
    use super::*;

    // macOS 번들(.app)은 디렉토리여도 단일 앱 항목으로 노출돼야 한다 (폴더 진입 회귀 방지)
    #[cfg(target_os = "macos")]
    #[test]
    fn test_macos_bundle_is_treated_as_app() {
        use std::path::Path;

        let (is_dir, file_type) = entry_kind(Path::new("/Applications/Godot.app"), "Godot.app", true);
        assert!(!is_dir);
        assert!(matches!(file_type, FileType::App));

        let (is_dir, file_type) = entry_kind(Path::new("/Users/me/Documents"), "Documents", true);
        assert!(is_dir);
        assert!(matches!(file_type, FileType::Directory));

        // 확장자만 같고 실제로는 파일이면 번들이 아니다
        let (is_dir, file_type) = entry_kind(Path::new("/tmp/note.app"), "note.app", false);
        assert!(!is_dir);
        assert!(matches!(file_type, FileType::Other));
    }

    // macOS 외 플랫폼에서는 .app 디렉토리를 평범한 폴더로 유지한다
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn test_bundle_is_plain_directory_off_macos() {
        use std::path::Path;

        let (is_dir, file_type) = entry_kind(Path::new("C:/Tools/Godot.app"), "Godot.app", true);
        assert!(is_dir);
        assert!(matches!(file_type, FileType::Directory));
    }

    #[test]
    fn test_classify_file_images() {
        assert_eq!(matches!(classify_file("test.png"), FileType::Image), true);
        assert_eq!(matches!(classify_file("TEST.JPG"), FileType::Image), true);
        assert_eq!(matches!(classify_file("icon.svg"), FileType::Image), true);
        assert_eq!(matches!(classify_file("photo.webp"), FileType::Image), true);
        assert_eq!(matches!(classify_file("design.psd"), FileType::Image), true);
        assert_eq!(matches!(classify_file("large.psb"), FileType::Image), true);
    }

    #[test]
    fn test_classify_file_videos() {
        assert_eq!(matches!(classify_file("movie.mp4"), FileType::Video), true);
        assert_eq!(matches!(classify_file("clip.mov"), FileType::Video), true);
        assert_eq!(matches!(classify_file("video.avi"), FileType::Video), true);
        assert_eq!(
            matches!(classify_file("animation.gif"), FileType::Image),
            true
        ); // GIF는 Image
    }

    #[test]
    fn test_classify_file_documents() {
        assert_eq!(
            matches!(classify_file("report.pdf"), FileType::Document),
            true
        );
        assert_eq!(
            matches!(classify_file("note.txt"), FileType::Document),
            true
        );
        assert_eq!(
            matches!(classify_file("readme.md"), FileType::Document),
            true
        );
        assert_eq!(matches!(classify_file("data.json"), FileType::Code), true); // JSON은 Code
    }

    #[test]
    fn test_classify_file_code() {
        assert_eq!(matches!(classify_file("main.rs"), FileType::Code), true);
        assert_eq!(matches!(classify_file("app.js"), FileType::Code), true);
        assert_eq!(matches!(classify_file("style.css"), FileType::Code), true);
        assert_eq!(matches!(classify_file("config.yaml"), FileType::Code), true);
    }

    #[test]
    fn test_classify_file_archives() {
        assert_eq!(
            matches!(classify_file("archive.zip"), FileType::Archive),
            true
        );
        assert_eq!(
            matches!(classify_file("package.tar"), FileType::Archive),
            true
        );
        assert_eq!(
            matches!(classify_file("backup.7z"), FileType::Archive),
            true
        );
    }

    #[test]
    fn test_classify_file_fonts() {
        assert_eq!(matches!(classify_file("font.ttf"), FileType::Font), true);
        assert_eq!(
            matches!(classify_file("typeface.otf"), FileType::Font),
            true
        );
        assert_eq!(
            matches!(classify_file("webfont.woff2"), FileType::Font),
            true
        );
    }

    #[test]
    fn test_classify_file_other() {
        assert_eq!(matches!(classify_file("data.xyz"), FileType::Other), true);
        assert_eq!(
            matches!(classify_file("file.unknown"), FileType::Other),
            true
        );
        assert_eq!(
            matches!(classify_file("noextension"), FileType::Other),
            true
        );
    }

    #[test]
    fn test_classify_file_case_insensitive() {
        assert_eq!(matches!(classify_file("IMAGE.PNG"), FileType::Image), true);
        assert_eq!(matches!(classify_file("Video.MP4"), FileType::Video), true);
        assert_eq!(
            matches!(classify_file("Document.PDF"), FileType::Document),
            true
        );
    }
}
