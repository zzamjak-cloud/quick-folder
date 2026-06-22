// OS 네이티브 파일 아이콘 캐시 (확장자별)
pub(super) fn icon_cache() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}
