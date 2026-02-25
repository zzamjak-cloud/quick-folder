// 파일 타입 enum (프론트엔드 FileType 유니온과 1:1 매핑)
#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum FileType {
    Image,
    Video,
    Document,
    Code,
    Archive,
    Directory,
    Other,
}

// 파일 항목 구조체 (파일 탐색기용)
#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: u64,      // epoch ms
    file_type: FileType,
}

// 파일 타입 분류 헬퍼
fn classify_file(name: &str) -> FileType {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" => FileType::Image,
        "mp4" | "mov" | "avi" | "mkv" | "webm" => FileType::Video,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" => FileType::Document,
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h"
        | "css" | "html" | "json" | "toml" | "yaml" | "yml" => FileType::Code,
        "zip" | "tar" | "gz" | "7z" | "rar" | "dmg" | "pkg" => FileType::Archive,
        _ => FileType::Other,
    }
}

// 디렉토리 목록 조회
#[tauri::command]
async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = vec![];
    for entry in entries.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();
        // 숨김 파일 제외 (점으로 시작하는 파일)
        if name.starts_with('.') {
            continue;
        }
        let file_type = if meta.is_dir() {
            FileType::Directory
        } else {
            classify_file(&name)
        };
        result.push(FileEntry {
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });
    }
    // 정렬은 프론트엔드에서 수행 (sortEntries)
    Ok(result)
}

// 이미지 규격 조회 (헤더만 읽어 빠르게 반환)
#[tauri::command]
fn get_image_dimensions(path: String) -> Result<Option<(u32, u32)>, String> {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "psd"];
    if !supported.contains(&ext.as_str()) {
        return Ok(None);
    }
    if ext == "psd" {
        // PSD는 image::image_dimensions 미지원 → 바이트 파싱
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() < 26 {
            return Ok(None);
        }
        // PSD 헤더: 시그니처(4) + 버전(2) + 예약(6) + 채널(2) + 높이(4) + 너비(4)
        let h = u32::from_be_bytes([bytes[14], bytes[15], bytes[16], bytes[17]]);
        let w = u32::from_be_bytes([bytes[18], bytes[19], bytes[20], bytes[21]]);
        return Ok(Some((w, h)));
    }
    match image::image_dimensions(&path) {
        Ok((w, h)) => Ok(Some((w, h))),
        Err(_) => Ok(None),
    }
}

// 이미지 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
#[tauri::command]
fn get_file_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use base64::Engine;
    use tauri::Manager;

    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
    if !supported.contains(&ext.as_str()) {
        return Ok(None);
    }

    // 파일 수정 시각 + 크기로 캐시 키 구성
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    let cache_key = format!("{:x}", hasher.finish());

    // 캐시 디렉토리 경로
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("img_thumbnails");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트
    if cache_file.exists() {
        let cached = std::fs::read(&cache_file).map_err(|e| e.to_string())?;
        return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&cached)));
    }

    // 썸네일 생성
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(size, size);
    let mut buf = vec![];
    thumb
        .write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;

    // 디스크 캐시 저장
    std::fs::write(&cache_file, &buf).ok();

    Ok(Some(
        base64::engine::general_purpose::STANDARD.encode(&buf),
    ))
}

// PSD 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
#[tauri::command]
fn get_psd_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use base64::Engine;
    use tauri::Manager;

    // 파일 수정 시각으로 캐시 키 구성
    let modified = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    let cache_key = format!("{:x}", hasher.finish());

    // 캐시 디렉토리 경로
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("psd_thumbnails");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트
    if cache_file.exists() {
        let cached = std::fs::read(&cache_file).map_err(|e| e.to_string())?;
        return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&cached)));
    }

    // PSD 파싱 → 합성 이미지 픽셀
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let psd = psd::Psd::from_bytes(&bytes).map_err(|e| format!("PSD 파싱 실패: {}", e))?;

    let rgba_pixels = psd.rgba();
    let width = psd.width();
    let height = psd.height();

    // image 크레이트로 리사이즈
    let img = image::RgbaImage::from_raw(width, height, rgba_pixels)
        .ok_or_else(|| "PSD 픽셀 변환 실패".to_string())?;
    let dynamic = image::DynamicImage::ImageRgba8(img);
    let thumb = dynamic.thumbnail(size, size);

    let mut buf = vec![];
    thumb
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    // 디스크 캐시 저장
    std::fs::write(&cache_file, &buf).ok();

    Ok(Some(base64::engine::general_purpose::STANDARD.encode(&buf)))
}

// 파일/폴더 복사 (재귀 지원)
#[tauri::command]
async fn copy_items(sources: Vec<String>, dest: String) -> Result<(), String> {
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| format!("잘못된 경로: {}", source))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);

        if src_path.is_dir() {
            copy_dir_recursive(src_path, &dest_path)?;
        } else {
            std::fs::copy(src_path, &dest_path)
                .map_err(|e| format!("복사 실패 {}: {}", source, e))?;
        }
    }
    Ok(())
}

// 재귀 디렉토리 복사 헬퍼
fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("디렉토리 생성 실패: {}", e))?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let dest_child = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)
                .map_err(|e| format!("복사 실패: {}", e))?;
        }
    }
    Ok(())
}

// 파일/폴더 복제 (같은 디렉토리에 " (복사)" 접미사)
#[tauri::command]
async fn duplicate_items(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut new_paths = vec![];
    for source in &paths {
        let src = std::path::Path::new(source);
        let parent = src.parent().ok_or_else(|| format!("상위 디렉토리 없음: {}", source))?;
        let stem = src.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        let is_dir = src.is_dir();

        // 충돌 방지: " (복사)", " (복사 2)", " (복사 3)" ...
        let mut dest_path;
        if is_dir {
            dest_path = parent.join(format!("{} (복사)", stem));
            let mut counter = 2u32;
            while dest_path.exists() {
                dest_path = parent.join(format!("{} (복사 {})", stem, counter));
                counter += 1;
            }
        } else {
            dest_path = parent.join(format!("{} (복사){}", stem, ext));
            let mut counter = 2u32;
            while dest_path.exists() {
                dest_path = parent.join(format!("{} (복사 {}){}", stem, counter, ext));
                counter += 1;
            }
        }

        if is_dir {
            copy_dir_recursive(src, &dest_path)?;
        } else {
            std::fs::copy(src, &dest_path)
                .map_err(|e| format!("복제 실패 {}: {}", source, e))?;
        }
        new_paths.push(dest_path.to_string_lossy().to_string());
    }
    Ok(new_paths)
}

// 파일/폴더 이동
#[tauri::command]
async fn move_items(sources: Vec<String>, dest: String) -> Result<(), String> {
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| format!("잘못된 경로: {}", source))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);

        // 같은 볼륨이면 rename, 다른 볼륨이면 복사 후 삭제
        if std::fs::rename(src_path, &dest_path).is_err() {
            if src_path.is_dir() {
                copy_dir_recursive(src_path, &dest_path)?;
                std::fs::remove_dir_all(src_path)
                    .map_err(|e| format!("원본 삭제 실패: {}", e))?;
            } else {
                std::fs::copy(src_path, &dest_path)
                    .map_err(|e| format!("이동 실패 {}: {}", source, e))?;
                std::fs::remove_file(src_path)
                    .map_err(|e| format!("원본 삭제 실패: {}", e))?;
            }
        }
    }
    Ok(())
}

// 파일/폴더 삭제 (use_trash=true면 휴지통)
#[tauri::command]
async fn delete_items(paths: Vec<String>, use_trash: bool) -> Result<(), String> {
    for path in &paths {
        let p = std::path::Path::new(path);
        if use_trash {
            trash::delete(p).map_err(|e| format!("휴지통 이동 실패 {}: {}", path, e))?;
        } else if p.is_dir() {
            std::fs::remove_dir_all(p)
                .map_err(|e| format!("삭제 실패 {}: {}", path, e))?;
        } else {
            std::fs::remove_file(p)
                .map_err(|e| format!("삭제 실패 {}: {}", path, e))?;
        }
    }
    Ok(())
}

// 새 폴더 생성
#[tauri::command]
async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("폴더 생성 실패: {}", e))
}

// 경로가 디렉토리인지 확인
#[tauri::command]
fn is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

// 이름 바꾸기
#[tauri::command]
async fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("이름 변경 실패: {}", e))
}

// macOS Quick Look 실행 (qlmanage -p <path>)
#[tauri::command]
async fn quick_look(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("qlmanage")
            .args(["-p", &path])
            .spawn()
            .map_err(|e| format!("Quick Look 실행 실패: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Quick Look은 macOS 전용 기능
        drop(path);
    }
    Ok(())
}

// --- OS 네이티브 파일 아이콘 (확장자별 캐시) ---
use std::sync::{OnceLock, Mutex};
use std::collections::HashMap;

fn icon_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
fn get_file_icon(path: String, size: u32) -> Result<Option<String>, String> {
    use base64::Engine;

    let p = std::path::Path::new(&path);
    let cache_key = if p.is_dir() {
        format!("__folder___{}", size)
    } else {
        let ext = p.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        format!("{}_{}", ext, size)
    };

    // 캐시 히트
    {
        let cache = icon_cache().lock().map_err(|e| e.to_string())?;
        if let Some(b64) = cache.get(&cache_key) {
            return Ok(Some(b64.clone()));
        }
    }

    // 플랫폼별 아이콘 추출
    if let Some(bytes) = get_native_icon_bytes(&path, size) {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
        cache.insert(cache_key, b64.clone());
        Ok(Some(b64))
    } else {
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    #[repr(C)]
    struct NSSize { width: f64, height: f64 }

    unsafe {
        let ws_class = Class::get("NSWorkspace")?;
        let workspace: *mut Object = msg_send![ws_class, sharedWorkspace];
        if workspace.is_null() { return None; }

        let str_class = Class::get("NSString")?;
        let c_path = CString::new(path).ok()?;
        let ns_path: *mut Object = msg_send![str_class, stringWithUTF8String: c_path.as_ptr()];
        if ns_path.is_null() { return None; }

        // iconForFile: → NSImage
        let icon: *mut Object = msg_send![workspace, iconForFile: ns_path];
        if icon.is_null() { return None; }

        let target_size = NSSize { width: size as f64, height: size as f64 };
        let _: () = msg_send![icon, setSize: target_size];

        // TIFF → NSBitmapImageRep → PNG
        let tiff_data: *mut Object = msg_send![icon, TIFFRepresentation];
        if tiff_data.is_null() { return None; }

        let rep_class = Class::get("NSBitmapImageRep")?;
        let bitmap_rep: *mut Object = msg_send![rep_class, imageRepWithData: tiff_data];
        if bitmap_rep.is_null() { return None; }

        let png_type: usize = 4; // NSBitmapImageFileTypePNG
        let null_dict: *const std::ffi::c_void = std::ptr::null();
        let png_data: *mut Object = msg_send![bitmap_rep, representationUsingType: png_type properties: null_dict];
        if png_data.is_null() { return None; }

        let length: usize = msg_send![png_data, length];
        let bytes_ptr: *const u8 = msg_send![png_data, bytes];
        if bytes_ptr.is_null() || length == 0 { return None; }

        Some(std::slice::from_raw_parts(bytes_ptr, length).to_vec())
    }
}

#[cfg(not(target_os = "macos"))]
fn get_native_icon_bytes(_path: &str, _size: u32) -> Option<Vec<u8>> {
    None
}

// --- ffmpeg 설치 여부 캐시 ---
fn is_ffmpeg_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        std::process::Command::new("ffmpeg")
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    })
}

// --- 동영상 썸네일 (ffmpeg CLI 기반, 디스크 캐시) ---
#[tauri::command]
fn get_video_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use base64::Engine;
    use tauri::Manager;

    if !is_ffmpeg_available() {
        return Ok(None);
    }

    // 캐시 키 구성
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    let cache_key = format!("{:x}", hasher.finish());

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("video_thumbnails");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트
    if cache_file.exists() {
        let cached = std::fs::read(&cache_file).map_err(|e| e.to_string())?;
        return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&cached)));
    }

    // ffmpeg로 1초 지점 프레임 추출 → PNG 파이프 출력
    let output = std::process::Command::new("ffmpeg")
        .args([
            "-i", &path,
            "-ss", "00:00:01",
            "-frames:v", "1",
            "-vf", &format!("scale={}:-1", size),
            "-f", "image2pipe",
            "-vcodec", "png",
            "pipe:1",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() || output.stdout.is_empty() {
        return Ok(None);
    }

    // 디스크 캐시 저장
    std::fs::write(&cache_file, &output.stdout).ok();

    Ok(Some(base64::engine::general_purpose::STANDARD.encode(&output.stdout)))
}

// --- ZIP 압축 ---
#[tauri::command]
async fn compress_to_zip(paths: Vec<String>, dest: String) -> Result<String, String> {
    let file = std::fs::File::create(&dest).map_err(|e| format!("ZIP 파일 생성 실패: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for source in &paths {
        let src = std::path::Path::new(source);
        let base_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

        if src.is_dir() {
            add_directory_to_zip(&mut zip, src, &base_name, options)?;
        } else {
            zip.start_file(&base_name, options).map_err(|e| e.to_string())?;
            let content = std::fs::read(src).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut zip, &content).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest)
}

fn add_directory_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    zip.add_directory(format!("{}/", prefix), options).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let full_name = format!("{}/{}", prefix, entry_name);
        if entry.path().is_dir() {
            add_directory_to_zip(zip, &entry.path(), &full_name, options)?;
        } else {
            zip.start_file(&full_name, options).map_err(|e| e.to_string())?;
            let content = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            std::io::Write::write_all(zip, &content).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// --- 다른 앱으로 열기 ---
#[tauri::command]
async fn open_with_app(path: String, app: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", &app, &path])
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (&path, &app);
    }
    Ok(())
}

// 폴더 선택 결과 구조체
#[derive(serde::Serialize)]
struct FolderSelection {
    path: String,
    name: String,
}

// 폴더 열기 명령
#[tauri::command]
async fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| format!("Failed to open folder: {}", e))?;

    Ok(())
}

// 경로 복사 명령
#[tauri::command]
async fn copy_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    app.clipboard()
        .write_text(path)
        .map_err(|e| format!("Failed to copy path: {}", e))?;

    Ok(())
}

// 폴더 선택 다이얼로그 명령
#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<FolderSelection>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app.dialog()
        .file()
        .blocking_pick_folder();

    if let Some(path) = folder_path {
        // FilePath에서 경로 문자열 가져오기
        let path_str = path.to_string();

        // 경로에서 폴더 이름 추출
        let name = path_str
            .split(['/', '\\'])
            .last()
            .unwrap_or("Unknown")
            .to_string();

        Ok(Some(FolderSelection {
            path: path_str,
            name,
        }))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_drag::init())
    .invoke_handler(tauri::generate_handler![
        open_folder,
        copy_path,
        select_folder,
        list_directory,
        get_image_dimensions,
        get_file_thumbnail,
        get_psd_thumbnail,
        get_file_icon,
        copy_items,
        duplicate_items,
        move_items,
        delete_items,
        create_directory,
        rename_item,
        quick_look,
        is_directory,
        get_video_thumbnail,
        compress_to_zip,
        open_with_app,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
