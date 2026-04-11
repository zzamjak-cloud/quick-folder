// 공통 타입 정의

// 파일 타입 enum (프론트엔드 FileType 유니온과 1:1 매핑)
#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Image,
    Video,
    Document,
    Code,
    Archive,
    Font,
    Directory,
    Other,
}

// 파일 항목 구조체 (파일 탐색기용)
#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64, // epoch ms
    pub file_type: FileType,
}

// 파일 타입 분류 헬퍼
pub fn classify_file(name: &str) -> FileType {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "icns" | "psd" => {
            FileType::Image
        }
        "mp4" | "mov" | "avi" | "mkv" | "webm" => FileType::Video,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "gslides"
        | "gdoc" | "gsheet" => FileType::Document,
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h" | "css"
        | "html" | "json" | "toml" | "yaml" | "yml" => FileType::Code,
        "zip" | "tar" | "gz" | "7z" | "rar" | "dmg" | "pkg" | "unitypackage" => FileType::Archive,
        "ttf" | "otf" | "woff" | "woff2" | "ttc" => FileType::Font,
        _ => FileType::Other,
    }
}

// ===== 테스트 =====

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_file_images() {
        assert_eq!(matches!(classify_file("test.png"), FileType::Image), true);
        assert_eq!(matches!(classify_file("TEST.JPG"), FileType::Image), true);
        assert_eq!(matches!(classify_file("icon.svg"), FileType::Image), true);
        assert_eq!(matches!(classify_file("photo.webp"), FileType::Image), true);
        assert_eq!(matches!(classify_file("design.psd"), FileType::Image), true);
    }

    #[test]
    fn test_classify_file_videos() {
        assert_eq!(matches!(classify_file("movie.mp4"), FileType::Video), true);
        assert_eq!(matches!(classify_file("clip.mov"), FileType::Video), true);
        assert_eq!(matches!(classify_file("video.avi"), FileType::Video), true);
        assert_eq!(matches!(classify_file("animation.gif"), FileType::Image), true); // GIF는 Image
    }

    #[test]
    fn test_classify_file_documents() {
        assert_eq!(matches!(classify_file("report.pdf"), FileType::Document), true);
        assert_eq!(matches!(classify_file("note.txt"), FileType::Document), true);
        assert_eq!(matches!(classify_file("readme.md"), FileType::Document), true);
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
        assert_eq!(matches!(classify_file("archive.zip"), FileType::Archive), true);
        assert_eq!(matches!(classify_file("package.tar"), FileType::Archive), true);
        assert_eq!(matches!(classify_file("backup.7z"), FileType::Archive), true);
    }

    #[test]
    fn test_classify_file_fonts() {
        assert_eq!(matches!(classify_file("font.ttf"), FileType::Font), true);
        assert_eq!(matches!(classify_file("typeface.otf"), FileType::Font), true);
        assert_eq!(matches!(classify_file("webfont.woff2"), FileType::Font), true);
    }

    #[test]
    fn test_classify_file_other() {
        assert_eq!(matches!(classify_file("data.xyz"), FileType::Other), true);
        assert_eq!(matches!(classify_file("file.unknown"), FileType::Other), true);
        assert_eq!(matches!(classify_file("noextension"), FileType::Other), true);
    }

    #[test]
    fn test_classify_file_case_insensitive() {
        assert_eq!(matches!(classify_file("IMAGE.PNG"), FileType::Image), true);
        assert_eq!(matches!(classify_file("Video.MP4"), FileType::Video), true);
        assert_eq!(matches!(classify_file("Document.PDF"), FileType::Document), true);
    }
}
