//! 파일 아이콘 추출 모듈
//! OS 네이티브 아이콘 캐시 및 플랫폼별 추출 로직

#[cfg(target_os = "windows")]
use super::super::constants::windows::*;

// ===== 파일 아이콘 =====

// OS 네이티브 파일 아이콘 캐시 (확장자별)
fn icon_cache() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    use std::sync::{OnceLock, Mutex};
    use std::collections::HashMap;
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// OS 네이티브 파일 아이콘 가져오기 (확장자별 캐시)
#[tauri::command]
pub fn get_file_icon(path: String, size: u32) -> Result<Option<String>, String> {
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

    // 플랫폼별 아이콘 추출 (패닉 방지)
    // 아이콘은 확장자별 캐시로 재사용되어 실질적으로 한 번만 호출 → 세마포어 불필요
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| get_native_icon_bytes(&path, size))) {
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

#[cfg(target_os = "windows")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    // GDI 패닉 방지: catch_unwind로 감싸서 앱 크래시 방지
    std::panic::catch_unwind(|| get_native_icon_bytes_inner(path, size)).ok().flatten()
}

#[cfg(target_os = "windows")]
fn get_native_icon_bytes_inner(path: &str, size: u32) -> Option<Vec<u8>> {
    use std::mem;
    use winapi::um::shellapi::{SHGetFileInfoW, SHFILEINFOW, SHGFI_SYSICONINDEX};
    use winapi::um::winuser::{GetIconInfo, DestroyIcon, ICONINFO, GetDC, ReleaseDC};
    use winapi::um::wingdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject,
        BITMAPINFOHEADER, BITMAP, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::objbase::CoInitialize;
    use winapi::shared::windef::HICON;
    use winapi::shared::winerror::S_OK;

    // SHGetImageList 이미지 리스트 크기 상수 및 투명 배경 플래그는 constants::windows::*에서 import

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetImageList(iImageList: i32, riid: *const winapi::shared::guiddef::GUID, ppvObj: *mut *mut std::ffi::c_void) -> i32;
    }

    // IID_IImageList = {46EB5926-582E-4017-9FDF-E8998DAA0950}
    let iid_iimagelist = winapi::shared::guiddef::GUID {
        Data1: 0x46EB5926,
        Data2: 0x582E,
        Data3: 0x4017,
        Data4: [0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50],
    };

    unsafe {
        // COM 초기화 (이미 초기화된 경우 무시)
        CoInitialize(std::ptr::null_mut());

        // 1. 파일의 시스템 아이콘 인덱스 가져오기
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut shfi: SHFILEINFOW = mem::zeroed();

        let result = SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut shfi,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX,
        );

        if result == 0 {
            return None;
        }

        let icon_index = shfi.iIcon;

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
            let get_icon_fn: extern "system" fn(*mut std::ffi::c_void, i32, i32, *mut HICON) -> i32 =
                mem::transmute(*vtable.add(10));
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

        if h_icon.is_null() {
            return None;
        }

        // 3. HICON → 비트맵 픽셀 데이터 추출
        let mut icon_info: ICONINFO = mem::zeroed();
        if GetIconInfo(h_icon, &mut icon_info) == 0 {
            DestroyIcon(h_icon);
            return None;
        }

        let hbm_color = icon_info.hbmColor;
        if hbm_color.is_null() {
            if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
            DestroyIcon(h_icon);
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
            if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
            DestroyIcon(h_icon);
            return None;
        }

        // 4. BITMAPINFOHEADER 준비 (top-down DIB)
        let bmi_size = mem::size_of::<BITMAPINFOHEADER>();
        let mut bmi_buf = vec![0u8; bmi_size + 4 * 256];
        let bmi = &mut *(bmi_buf.as_mut_ptr() as *mut winapi::um::wingdi::BITMAPINFO);
        bmi.bmiHeader.biSize = bmi_size as u32;
        bmi.bmiHeader.biWidth = width as i32;
        bmi.bmiHeader.biHeight = -(height as i32);
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        // 5. 픽셀 데이터 추출
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

        // 6. BGRA → RGBA 변환
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        // 7. 알파 채널이 모두 0인 경우 불투명으로 설정 (구형 아이콘 호환)
        let has_alpha = pixels.chunks_exact(4).any(|c| c[3] != 0);
        if !has_alpha {
            for chunk in pixels.chunks_exact_mut(4) {
                chunk[3] = 255;
            }
        }

        // 8. GDI 리소스 정리
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);
        DeleteObject(icon_info.hbmColor as _);
        if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
        DestroyIcon(h_icon);

        // 9. PNG 인코딩
        let img = image::RgbaImage::from_raw(width, height, pixels)?;
        let mut png_buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png_buf, image::ImageFormat::Png).ok()?;

        Some(png_buf.into_inner())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_native_icon_bytes(_path: &str, _size: u32) -> Option<Vec<u8>> {
    None
}
