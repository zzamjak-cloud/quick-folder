//! 클립보드 모듈
//! OS 파일 클립보드 및 이미지 붙여넣기

#[cfg(target_os = "windows")]
use super::super::constants::windows::*;

// ===== OS 파일 클립보드 (파일 경로를 시스템 클립보드에 등록/읽기) =====

// 파일 경로를 시스템 클립보드에 쓰기
#[tauri::command]
pub fn write_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    write_files_to_clipboard_native(&paths)
}

// 시스템 클립보드에서 파일 경로 읽기
#[tauri::command]
pub fn read_files_from_clipboard() -> Result<Vec<String>, String> {
    read_files_from_clipboard_native()
}

#[cfg(target_os = "macos")]
fn write_files_to_clipboard_native(paths: &[String]) -> Result<(), String> {
    // osascript(AppleScript)로 클립보드에 파일 등록
    // Finder와 동일한 방식으로 동작하여 Notion, Slack 등 외부 앱 호환
    let file_refs: Vec<String> = paths.iter()
        .map(|p| format!("POSIX file \"{}\"", p.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect();
    let script = if file_refs.len() == 1 {
        format!("set the clipboard to ({})", file_refs[0])
    } else {
        format!("set the clipboard to {{{}}}", file_refs.join(", "))
    };

    let output = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript 실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("클립보드 설정 실패: {}", stderr));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let pb_class = Class::get("NSPasteboard").ok_or("NSPasteboard not found")?;
        let pb: *mut Object = msg_send![pb_class, generalPasteboard];
        if pb.is_null() { return Err("generalPasteboard is null".into()); }

        let url_class = Class::get("NSURL").ok_or("NSURL not found")?;
        let arr_class = Class::get("NSArray").ok_or("NSArray not found")?;
        let dict_class = Class::get("NSDictionary").ok_or("NSDictionary not found")?;
        let nsnum_class = Class::get("NSNumber").ok_or("NSNumber not found")?;
        let nsstr_class = Class::get("NSString").ok_or("NSString not found")?;

        let classes: *mut Object = msg_send![arr_class, arrayWithObject: url_class];

        // NSPasteboardURLReadingFileURLsOnlyKey 옵션으로 파일 URL만 필터링
        let key_str = std::ffi::CString::new("NSPasteboardURLReadingFileURLsOnlyKey").unwrap();
        let key: *mut Object = msg_send![nsstr_class, stringWithUTF8String: key_str.as_ptr()];
        let yes_val: *mut Object = msg_send![nsnum_class, numberWithBool: true];
        let options: *mut Object = msg_send![dict_class, dictionaryWithObject: yes_val forKey: key];

        let urls: *mut Object = msg_send![pb, readObjectsForClasses: classes options: options];
        if !urls.is_null() {
            let count: usize = msg_send![urls, count];
            let mut result = Vec::with_capacity(count);

            for i in 0..count {
                let url: *mut Object = msg_send![urls, objectAtIndex: i];
                if url.is_null() { continue; }

                let is_file: i8 = msg_send![url, isFileURL];
                if is_file == 0 { continue; }

                let path: *mut Object = msg_send![url, path];
                if path.is_null() { continue; }

                let utf8: *const std::os::raw::c_char = msg_send![path, UTF8String];
                if utf8.is_null() { continue; }

                let path_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(path_str);
            }

            if !result.is_empty() { return Ok(result); }
        }

        // 폴백: NSFilenamesPboardType으로 Finder 복사 파일 읽기
        let ptype_str = std::ffi::CString::new("NSFilenamesPboardType").unwrap();
        let ptype: *mut Object = msg_send![nsstr_class, stringWithUTF8String: ptype_str.as_ptr()];
        let plist: *mut Object = msg_send![pb, propertyListForType: ptype];
        if !plist.is_null() {
            let pcount: usize = msg_send![plist, count];
            let mut result = Vec::with_capacity(pcount);
            for i in 0..pcount {
                let item: *mut Object = msg_send![plist, objectAtIndex: i];
                if item.is_null() { continue; }
                let utf8: *const std::os::raw::c_char = msg_send![item, UTF8String];
                if utf8.is_null() { continue; }
                let s = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(s);
            }
            if !result.is_empty() { return Ok(result); }
        }

        Ok(vec![])
    }
}

#[cfg(target_os = "windows")]
fn write_files_to_clipboard_native(paths: &[String]) -> Result<(), String> {
    std::panic::catch_unwind(|| write_files_to_clipboard_inner(paths))
        .map_err(|_| "clipboard write panic".to_string())?
}

#[cfg(target_os = "windows")]
fn write_files_to_clipboard_inner(paths: &[String]) -> Result<(), String> {
    use winapi::um::winuser::{OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData, CF_HDROP};
    use winapi::um::winbase::{GlobalAlloc, GlobalLock, GlobalUnlock, GlobalFree, GMEM_MOVEABLE, GMEM_ZEROINIT};
    use std::mem;
    use std::ptr;

    // winapi 크레이트에 DROPFILES가 없어서 직접 정의
    #[repr(C)]
    struct DROPFILES {
        pFiles: u32,
        pt_x: i32,
        pt_y: i32,
        fNC: i32,
        fWide: i32,
    }

    // 경로를 UTF-16 null 종료 문자열로 변환
    let wide_paths: Vec<Vec<u16>> = paths.iter()
        .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
        .collect();

    // DROPFILES 헤더 + 모든 경로 + 끝 null 종료자
    let mut total_size = mem::size_of::<DROPFILES>();
    for wp in &wide_paths {
        total_size += wp.len() * 2;
    }
    total_size += 2; // 끝 null 종료자

    unsafe {
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("OpenClipboard failed".into());
        }

        if EmptyClipboard() == 0 {
            CloseClipboard();
            return Err("EmptyClipboard failed".into());
        }

        let h_global = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
        if h_global.is_null() {
            CloseClipboard();
            return Err("GlobalAlloc failed".into());
        }

        let data = GlobalLock(h_global) as *mut u8;
        if data.is_null() {
            GlobalFree(h_global);
            CloseClipboard();
            return Err("GlobalLock failed".into());
        }

        // DROPFILES 헤더 채우기
        let drop_files = data as *mut DROPFILES;
        (*drop_files).pFiles = mem::size_of::<DROPFILES>() as u32;
        (*drop_files).fWide = 1; // 유니코드 경로

        // 헤더 뒤에 경로 복사
        let mut offset = mem::size_of::<DROPFILES>();
        for wp in &wide_paths {
            let bytes = std::slice::from_raw_parts(wp.as_ptr() as *const u8, wp.len() * 2);
            ptr::copy_nonoverlapping(bytes.as_ptr(), data.add(offset), bytes.len());
            offset += bytes.len();
        }
        // 끝 null 종료자는 GMEM_ZEROINIT으로 이미 0

        GlobalUnlock(h_global);

        if SetClipboardData(CF_HDROP, h_global).is_null() {
            GlobalFree(h_global);
            CloseClipboard();
            return Err("SetClipboardData failed".into());
        }

        // SetClipboardData 성공 시 시스템이 메모리 소유 (GlobalFree 호출 금지)
        CloseClipboard();
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    std::panic::catch_unwind(|| {
        // 첫 시도 실패 시 50ms 후 1회 재시도 (다른 프로세스가 클립보드를 잠근 경우)
        match read_files_from_clipboard_inner() {
            Ok(v) => Ok(v),
            Err(e) => {
                log::warn!("클립보드 읽기 첫 시도 실패 ({}), 50ms 후 재시도", e);
                std::thread::sleep(std::time::Duration::from_millis(50));
                read_files_from_clipboard_inner()
            }
        }
    })
    .map_err(|_| "clipboard read panic".to_string())?
}

#[cfg(target_os = "windows")]
fn read_files_from_clipboard_inner() -> Result<Vec<String>, String> {
    use winapi::um::winuser::{OpenClipboard, CloseClipboard, GetClipboardData, CF_HDROP, IsClipboardFormatAvailable};
    use winapi::um::shellapi::{DragQueryFileW, HDROP};
    use std::ptr;

    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP) == 0 {
            return Ok(vec![]);
        }

        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("OpenClipboard failed".into());
        }

        let h_data = GetClipboardData(CF_HDROP);
        if h_data.is_null() {
            CloseClipboard();
            return Ok(vec![]);
        }

        let h_drop = h_data as HDROP;
        let count = DragQueryFileW(h_drop, 0xFFFFFFFF, ptr::null_mut(), 0);
        let mut result = Vec::with_capacity(count as usize);

        for i in 0..count {
            let len = DragQueryFileW(h_drop, i, ptr::null_mut(), 0);
            let mut buf = vec![0u16; (len + 1) as usize];
            DragQueryFileW(h_drop, i, buf.as_mut_ptr(), len + 1);
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            result.push(path);
        }

        CloseClipboard();
        Ok(result)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn write_files_to_clipboard_native(_paths: &[String]) -> Result<(), String> {
    Err("이 플랫폼에서는 파일 클립보드가 지원되지 않습니다".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    Ok(vec![])
}

// ===== 클립보드 이미지 저장 =====

// 클립보드 이미지 데이터를 PNG 파일로 저장
#[tauri::command]
pub fn paste_image_from_clipboard(dest_dir: String) -> Result<Option<String>, String> {
    use arboard::Clipboard;

    let mut clip = Clipboard::new().map_err(|e| format!("클립보드 접근 실패: {}", e))?;
    let img = match clip.get_image() {
        Ok(img) => img,
        Err(_) => return Ok(None), // 이미지 데이터 없음
    };

    // Screenshot_0.png, Screenshot_1.png, ... 순번 자동 증가
    let parent = std::path::Path::new(&dest_dir);
    let mut num = 0u32;
    let mut file_path = parent.join(format!("Screenshot_{}.png", num));
    while file_path.exists() {
        num += 1;
        file_path = parent.join(format!("Screenshot_{}.png", num));
    }

    // RGBA → PNG 저장
    let width = img.width as u32;
    let height = img.height as u32;
    let rgba_data: Vec<u8> = img.bytes.into_owned();
    let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_raw(width, height, rgba_data)
            .ok_or("이미지 버퍼 생성 실패")?;
    img_buf.save(&file_path).map_err(|e| format!("이미지 저장 실패: {}", e))?;

    Ok(Some(file_path.to_string_lossy().to_string()))
}
