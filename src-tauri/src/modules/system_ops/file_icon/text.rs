#[cfg(target_os = "windows")]
pub(super) fn should_use_doc_assoc_icon(
    is_dir: bool,
    icon_index: i32,
    doc_no_assoc_index: Option<i32>,
) -> bool {
    !is_dir
        && doc_no_assoc_index
            .map(|index| index == icon_index)
            .unwrap_or(false)
}

pub(super) fn file_extension(path: &str) -> String {
    std::path::Path::new(path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

pub(super) fn should_use_text_document_icon(is_dir: bool, ext: &str) -> bool {
    if is_dir {
        return false;
    }

    // Shell이 빈 문서로 돌려주는 텍스트 기반 문서는 Windows의 .txt 문서 아이콘으로 맞춘다.
    matches!(
        ext,
        "md" | "markdown"
            | "json"
            | "jsonc"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "conf"
            | "config"
            | "lock"
            | "log"
            | "csv"
            | "tsx"
            | "css"
            | "plist"
            | "rs"
    )
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{should_use_doc_assoc_icon, should_use_text_document_icon};

    #[test]
    fn switches_to_doc_assoc_only_for_non_directory_doc_no_assoc_icon() {
        assert!(should_use_doc_assoc_icon(false, 12, Some(12)));
        assert!(!should_use_doc_assoc_icon(true, 12, Some(12)));
        assert!(!should_use_doc_assoc_icon(false, 12, Some(7)));
        assert!(!should_use_doc_assoc_icon(false, 12, None));
    }

    #[test]
    fn uses_text_document_icon_for_plain_text_document_extensions() {
        assert!(should_use_text_document_icon(false, "md"));
        assert!(should_use_text_document_icon(false, "json"));
        assert!(should_use_text_document_icon(false, "yaml"));
        assert!(should_use_text_document_icon(false, "toml"));
        assert!(should_use_text_document_icon(false, "tsx"));
        assert!(should_use_text_document_icon(false, "css"));
        assert!(should_use_text_document_icon(false, "plist"));
        assert!(should_use_text_document_icon(false, "rs"));
        assert!(!should_use_text_document_icon(true, "md"));
        assert!(!should_use_text_document_icon(false, "txt"));
        assert!(!should_use_text_document_icon(false, "js"));
        assert!(!should_use_text_document_icon(false, "html"));
    }
}
