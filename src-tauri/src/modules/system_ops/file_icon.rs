//! 파일 아이콘 추출 모듈
//! OS 네이티브 아이콘 캐시 및 플랫폼별 추출 로직

use crate::modules::archive_ops::materialize_archive_path_in_cache;

#[cfg(target_os = "windows")]
use super::super::constants::windows::*;

// ===== 파일 아이콘 =====

// OS 네이티브 파일 아이콘 캐시 (확장자별)
fn icon_cache() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn crop_transparent_rgba(pixels: Vec<u8>, width: u32, height: u32) -> Option<(Vec<u8>, u32, u32)> {
    if width == 0 || height == 0 || pixels.len() != (width * height * 4) as usize {
        return None;
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let alpha_index = ((y * width + x) * 4 + 3) as usize;
            if pixels[alpha_index] == 0 {
                continue;
            }

            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }

    if !found {
        return Some((pixels, width, height));
    }

    let padding = 2;
    min_x = min_x.saturating_sub(padding);
    min_y = min_y.saturating_sub(padding);
    max_x = (max_x + padding).min(width - 1);
    max_y = (max_y + padding).min(height - 1);

    let cropped_width = max_x - min_x + 1;
    let cropped_height = max_y - min_y + 1;

    if cropped_width == width && cropped_height == height {
        return Some((pixels, width, height));
    }

    let mut cropped = vec![0u8; (cropped_width * cropped_height * 4) as usize];
    for row in 0..cropped_height {
        let src_start = (((min_y + row) * width + min_x) * 4) as usize;
        let src_end = src_start + (cropped_width * 4) as usize;
        let dst_start = (row * cropped_width * 4) as usize;
        let dst_end = dst_start + (cropped_width * 4) as usize;
        cropped[dst_start..dst_end].copy_from_slice(&pixels[src_start..src_end]);
    }

    Some((cropped, cropped_width, cropped_height))
}

fn should_use_doc_assoc_icon(
    is_dir: bool,
    icon_index: i32,
    doc_no_assoc_index: Option<i32>,
) -> bool {
    !is_dir
        && doc_no_assoc_index
            .map(|index| index == icon_index)
            .unwrap_or(false)
}

fn file_extension(path: &str) -> String {
    std::path::Path::new(path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn should_use_text_document_icon(is_dir: bool, ext: &str) -> bool {
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

// OS 네이티브 파일 아이콘 가져오기 (확장자별 캐시)
#[tauri::command]
pub fn get_file_icon(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>, String> {
    use base64::Engine;

    let resolved_path = materialize_archive_path_in_cache(&app, &path)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| std::path::PathBuf::from(&path));
    let resolved_path_str = resolved_path.to_string_lossy().to_string();
    let p = std::path::Path::new(&resolved_path_str);
    let cache_key = if p.is_dir() {
        format!("__folder___{}", size)
    } else {
        let ext = p
            .extension()
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

    // 플랫폼별 아이콘 추출 (패닉 방지)
    // 아이콘은 확장자별 캐시로 재사용되어 실질적으로 한 번만 호출 → 세마포어 불필요
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        get_native_icon_bytes(&resolved_path_str, size)
    })) {
        Ok(Some(bytes)) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
            cache.insert(cache_key, b64.clone());
            Ok(Some(b64))
        }
        _ => Ok(None),
    }
}

#[cfg(target_os = "macos")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    #[repr(C)]
    struct NSSize {
        width: f64,
        height: f64,
    }

    unsafe {
        let ws_class = Class::get("NSWorkspace")?;
        let workspace: *mut Object = msg_send![ws_class, sharedWorkspace];
        if workspace.is_null() {
            return None;
        }

        let str_class = Class::get("NSString")?;
        let is_dir = std::path::Path::new(path).is_dir();
        let ext = file_extension(path);

        let icon: *mut Object = if should_use_text_document_icon(is_dir, &ext) {
            // 텍스트 기반 문서는 실제 앱 연결 대신 macOS의 .txt 파일 타입 아이콘으로 맞춘다.
            let c_type = CString::new("txt").ok()?;
            let ns_type: *mut Object = msg_send![str_class, stringWithUTF8String: c_type.as_ptr()];
            if ns_type.is_null() {
                return None;
            }
            msg_send![workspace, iconForFileType: ns_type]
        } else {
            let c_path = CString::new(path).ok()?;
            let ns_path: *mut Object = msg_send![str_class, stringWithUTF8String: c_path.as_ptr()];
            if ns_path.is_null() {
                return None;
            }
            msg_send![workspace, iconForFile: ns_path]
        };
        if icon.is_null() {
            return None;
        }

        let target_size = NSSize {
            width: size as f64,
            height: size as f64,
        };
        let _: () = msg_send![icon, setSize: target_size];

        // TIFF → NSBitmapImageRep → PNG
        let tiff_data: *mut Object = msg_send![icon, TIFFRepresentation];
        if tiff_data.is_null() {
            return None;
        }

        let rep_class = Class::get("NSBitmapImageRep")?;
        let bitmap_rep: *mut Object = msg_send![rep_class, imageRepWithData: tiff_data];
        if bitmap_rep.is_null() {
            return None;
        }

        let png_type: usize = 4; // NSBitmapImageFileTypePNG
        let null_dict: *const std::ffi::c_void = std::ptr::null();
        let png_data: *mut Object =
            msg_send![bitmap_rep, representationUsingType: png_type properties: null_dict];
        if png_data.is_null() {
            return None;
        }

        let length: usize = msg_send![png_data, length];
        let bytes_ptr: *const u8 = msg_send![png_data, bytes];
        if bytes_ptr.is_null() || length == 0 {
            return None;
        }

        Some(std::slice::from_raw_parts(bytes_ptr, length).to_vec())
    }
}

#[cfg(target_os = "windows")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    // GDI 패닉 방지: catch_unwind로 감싸서 앱 크래시 방지
    std::panic::catch_unwind(|| get_native_icon_bytes_inner(path, size))
        .ok()
        .flatten()
}

#[cfg(target_os = "windows")]
fn resolve_windows_icon_query(path: &str) -> (String, u32) {
    use std::path::Path;
    use winapi::um::winnt::FILE_ATTRIBUTE_NORMAL;

    let p = Path::new(path);
    if p.is_dir() {
        return (path.to_string(), 0);
    }

    let ext = file_extension(path);

    if ext.is_empty() {
        (path.to_string(), 0)
    } else {
        (format!("dummy.{}", ext), FILE_ATTRIBUTE_NORMAL)
    }
}

#[cfg(target_os = "windows")]
fn stock_icon_sys_index_flags() -> u32 {
    const SHGSI_SYSICONINDEX: u32 = 0x0000_4000;
    SHGSI_SYSICONINDEX
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct SHStockIconInfo {
    cb_size: u32,
    h_icon: winapi::shared::windef::HICON,
    i_sys_image_index: i32,
    i_icon: i32,
    sz_path: [u16; 260],
}

#[cfg(target_os = "windows")]
unsafe fn get_stock_icon_info(stock_id: i32, flags: u32) -> Option<SHStockIconInfo> {
    use std::mem;
    use winapi::shared::winerror::S_OK;

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetStockIconInfo(siid: i32, u_flags: u32, info: *mut SHStockIconInfo) -> i32;
    }

    let mut info = SHStockIconInfo {
        cb_size: mem::size_of::<SHStockIconInfo>() as u32,
        h_icon: std::ptr::null_mut(),
        i_sys_image_index: 0,
        i_icon: 0,
        sz_path: [0; 260],
    };

    if SHGetStockIconInfo(stock_id, flags, &mut info) == S_OK {
        Some(info)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
unsafe fn hicon_to_png_bytes(h_icon: winapi::shared::windef::HICON) -> Option<Vec<u8>> {
    use std::mem;
    use winapi::um::wingdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject, BITMAP,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::winuser::{GetDC, GetIconInfo, ReleaseDC, ICONINFO};

    let mut icon_info: ICONINFO = mem::zeroed();
    if GetIconInfo(h_icon, &mut icon_info) == 0 {
        return None;
    }

    let hbm_color = icon_info.hbmColor;
    if hbm_color.is_null() {
        if !icon_info.hbmMask.is_null() {
            DeleteObject(icon_info.hbmMask as _);
        }
        return None;
    }

    let mut bmp: BITMAP = mem::zeroed();
    GetObjectW(
        hbm_color as _,
        mem::size_of::<BITMAP>() as i32,
        &mut bmp as *mut _ as *mut _,
    );

    let width = bmp.bmWidth as u32;
    let height = bmp.bmHeight as u32;

    if width == 0 || height == 0 {
        DeleteObject(icon_info.hbmColor as _);
        if !icon_info.hbmMask.is_null() {
            DeleteObject(icon_info.hbmMask as _);
        }
        return None;
    }

    let bmi_size = mem::size_of::<BITMAPINFOHEADER>();
    let mut bmi_buf = vec![0u8; bmi_size + 4 * 256];
    let bmi = &mut *(bmi_buf.as_mut_ptr() as *mut winapi::um::wingdi::BITMAPINFO);
    bmi.bmiHeader.biSize = bmi_size as u32;
    bmi.bmiHeader.biWidth = width as i32;
    bmi.bmiHeader.biHeight = -(height as i32);
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    let hdc_screen = GetDC(std::ptr::null_mut());
    let hdc_mem = CreateCompatibleDC(hdc_screen);
    let old_bmp = SelectObject(hdc_mem, hbm_color as _);

    let mut pixels: Vec<u8> = vec![0u8; (width * height * 4) as usize];
    GetDIBits(
        hdc_mem,
        hbm_color,
        0,
        height,
        pixels.as_mut_ptr() as *mut _,
        bmi,
        DIB_RGB_COLORS,
    );

    SelectObject(hdc_mem, old_bmp);
    DeleteDC(hdc_mem);
    ReleaseDC(std::ptr::null_mut(), hdc_screen);
    DeleteObject(icon_info.hbmColor as _);
    if !icon_info.hbmMask.is_null() {
        DeleteObject(icon_info.hbmMask as _);
    }

    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    let has_alpha = pixels.chunks_exact(4).any(|c| c[3] != 0);
    if !has_alpha {
        for chunk in pixels.chunks_exact_mut(4) {
            chunk[3] = 255;
        }
    }

    let (pixels, width, height) = crop_transparent_rgba(pixels, width, height)?;
    let img = image::RgbaImage::from_raw(width, height, pixels)?;
    let mut png_buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut png_buf, image::ImageFormat::Png).ok()?;

    Some(png_buf.into_inner())
}

#[cfg(target_os = "windows")]
fn get_text_document_icon_bytes(size: u32) -> Option<Vec<u8>> {
    // Windows Shell의 .txt 연결 아이콘을 종이문서 기본 스타일로 재사용한다.
    get_native_icon_bytes_inner("dummy.txt", size)
}

#[cfg(target_os = "windows")]
fn get_stock_doc_no_assoc_index() -> Option<i32> {
    const SIID_DOCNOASSOC: i32 = 0;

    unsafe {
        get_stock_icon_info(SIID_DOCNOASSOC, stock_icon_sys_index_flags())
            .map(|info| info.i_sys_image_index)
    }
}

#[cfg(target_os = "windows")]
fn get_native_icon_bytes_inner(path: &str, size: u32) -> Option<Vec<u8>> {
    use std::mem;
    use winapi::shared::windef::HICON;
    use winapi::shared::winerror::S_OK;
    use winapi::um::combaseapi::CoInitializeEx;
    use winapi::um::shellapi::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SYSICONINDEX,
        SHGFI_USEFILEATTRIBUTES,
    };
    use winapi::um::winuser::DestroyIcon;

    // SHGetImageList 이미지 리스트 크기 상수 및 투명 배경 플래그는 constants::windows::*에서 import

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetImageList(
            iImageList: i32,
            riid: *const winapi::shared::guiddef::GUID,
            ppvObj: *mut *mut std::ffi::c_void,
        ) -> i32;
    }

    // IID_IImageList = {46EB5926-582E-4017-9FDF-E8998DAA0950}
    let iid_iimagelist = winapi::shared::guiddef::GUID {
        Data1: 0x46EB5926,
        Data2: 0x582E,
        Data3: 0x4017,
        Data4: [0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50],
    };

    unsafe {
        // Shell / IImageList 는 STA 권장. 이미 초기화된 스레드에서는 S_FALSE 만 반환될 수 있음.
        // COINIT_APARTMENTTHREADED = 0x2 — Shell/IImageList STA
        let _ = CoInitializeEx(std::ptr::null_mut(), 0x2);

        let is_dir = std::path::Path::new(path).is_dir();
        let original_ext = file_extension(path);
        if should_use_text_document_icon(is_dir, &original_ext) {
            if let Some(bytes) = get_text_document_icon_bytes(size) {
                return Some(bytes);
            }
        }

        let (query_path, file_attributes) = resolve_windows_icon_query(path);
        let use_file_attributes = file_attributes != 0;

        // 1. 파일의 시스템 아이콘 인덱스 가져오기
        let wide_path: Vec<u16> = query_path
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut shfi: SHFILEINFOW = mem::zeroed();
        let mut info_flags = SHGFI_SYSICONINDEX;
        if use_file_attributes {
            info_flags |= SHGFI_USEFILEATTRIBUTES;
        }

        let result = SHGetFileInfoW(
            wide_path.as_ptr(),
            file_attributes,
            &mut shfi,
            mem::size_of::<SHFILEINFOW>() as u32,
            info_flags,
        );

        if result == 0 {
            return None;
        }

        let icon_index = shfi.iIcon;
        // 연결 프로그램 없는 흐릿한 기본 문서 아이콘도 .md/.json과 동일한 .txt 문서 아이콘으로 통일
        if should_use_doc_assoc_icon(is_dir, icon_index, get_stock_doc_no_assoc_index()) {
            if let Some(bytes) = get_text_document_icon_bytes(size) {
                return Some(bytes);
            }
        }

        // 2. 요청 크기에 맞는 이미지 리스트 가져오기
        // 256x256 시도 → 48x48 폴백 → 32x32 폴백
        let list_sizes = if size >= 64 {
            vec![SHIL_JUMBO, SHIL_EXTRALARGE, SHIL_LARGE]
        } else if size >= 40 {
            vec![SHIL_EXTRALARGE, SHIL_LARGE]
        } else {
            vec![SHIL_LARGE]
        };

        let mut h_icon: HICON = std::ptr::null_mut();

        for &shil in &list_sizes {
            let mut image_list: *mut std::ffi::c_void = std::ptr::null_mut();
            let hr = SHGetImageList(shil, &iid_iimagelist, &mut image_list);
            if hr != S_OK || image_list.is_null() {
                continue;
            }

            // IImageList vtable에서 GetIcon 호출 (vtable 인덱스 10)
            // IUnknown(0-2) + Add(3), ReplaceIcon(4), SetOverlayImage(5),
            // Replace(6), AddMasked(7), Draw(8), Remove(9), GetIcon(10)
            let vtable = *(image_list as *const *const usize);
            let get_icon_fn: extern "system" fn(
                *mut std::ffi::c_void,
                i32,
                i32,
                *mut HICON,
            ) -> i32 = mem::transmute(*vtable.add(10));
            let mut icon: HICON = std::ptr::null_mut();
            let hr2 = get_icon_fn(image_list, icon_index, ILD_TRANSPARENT, &mut icon);

            // IImageList Release (vtable 인덱스 2)
            let release_fn: extern "system" fn(*mut std::ffi::c_void) -> u32 =
                mem::transmute(*vtable.add(2));
            release_fn(image_list);

            if hr2 == S_OK && !icon.is_null() {
                h_icon = icon;
                break;
            }
        }

        // SHGetImageList 경로 실패 시 SHGetFileInfo(SHGFI_ICON) 직접 획득 (vtable/OS 차이 대비)
        if h_icon.is_null() {
            let mut shfi_direct: SHFILEINFOW = mem::zeroed();
            let mut direct_flags = SHGFI_ICON | SHGFI_LARGEICON;
            if use_file_attributes {
                direct_flags |= SHGFI_USEFILEATTRIBUTES;
            }
            let ok = SHGetFileInfoW(
                wide_path.as_ptr(),
                file_attributes,
                &mut shfi_direct,
                mem::size_of::<SHFILEINFOW>() as u32,
                direct_flags,
            );
            if ok != 0 && !shfi_direct.hIcon.is_null() {
                h_icon = shfi_direct.hIcon;
            }
        }

        if h_icon.is_null() {
            return None;
        }

        let bytes = hicon_to_png_bytes(h_icon);
        DestroyIcon(h_icon);
        bytes
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_native_icon_bytes(_path: &str, _size: u32) -> Option<Vec<u8>> {
    None
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{
        crop_transparent_rgba, resolve_windows_icon_query, should_use_doc_assoc_icon,
        should_use_text_document_icon,
    };
    use winapi::um::winnt::FILE_ATTRIBUTE_NORMAL;

    #[test]
    fn crops_transparent_padding_around_icon_pixels() {
        let width = 10;
        let height = 10;
        let mut pixels = vec![0u8; (width * height * 4) as usize];

        for y in 4..=5 {
            for x in 4..=5 {
                let base = ((y * width + x) * 4) as usize;
                pixels[base] = 255;
                pixels[base + 1] = 255;
                pixels[base + 2] = 255;
                pixels[base + 3] = 255;
            }
        }

        let (cropped, cropped_width, cropped_height) =
            crop_transparent_rgba(pixels, width, height).expect("crop should succeed");

        assert_eq!(cropped_width, 6);
        assert_eq!(cropped_height, 6);
        assert_eq!(cropped.len(), (cropped_width * cropped_height * 4) as usize);
    }

    #[test]
    fn uses_extension_query_for_code_like_files() {
        let (query_path, file_attributes) = resolve_windows_icon_query(r"C:\repo\vite.config.ts");
        assert_eq!(query_path, "dummy.ts");
        assert_eq!(file_attributes, FILE_ATTRIBUTE_NORMAL);
    }

    #[test]
    fn keeps_real_path_for_extensionless_files() {
        let path = r"C:\repo\Dockerfile";
        let (query_path, file_attributes) = resolve_windows_icon_query(path);
        assert_eq!(query_path, path);
        assert_eq!(file_attributes, 0);
    }

    #[test]
    fn keeps_real_path_for_directories() {
        let dir = std::env::temp_dir();
        let dir_str = dir.to_string_lossy().to_string();
        let (query_path, file_attributes) = resolve_windows_icon_query(&dir_str);
        assert_eq!(query_path, dir_str);
        assert_eq!(file_attributes, 0);
    }

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
