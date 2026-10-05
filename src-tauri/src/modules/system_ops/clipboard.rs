//! 클립보드 모듈
//! OS 파일 클립보드 및 이미지 붙여넣기

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

// 이미지 데이터를 함께 등록할 최대 파일 크기 (Ctrl+C 시 UI 멈춤 방지)
#[cfg(any(target_os = "macos", target_os = "windows"))]
const CLIPBOARD_IMAGE_MAX_BYTES: u64 = 50 * 1024 * 1024;

// 단일 이미지 파일 선택 시에만 이미지 데이터도 클립보드에 넣는다.
// 파일 참조만 있으면 이미지 편집기·메신저 입력창 등에서 붙여넣기가 안 되기 때문.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn single_image_path(paths: &[String]) -> Option<&str> {
    if paths.len() != 1 {
        return None;
    }
    let path = std::path::Path::new(&paths[0]);
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let supported = matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico"
    ) || (cfg!(target_os = "macos")
        && matches!(ext.as_str(), "heic" | "heif" | "tif" | "tiff"));
    if !supported {
        return None;
    }
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > CLIPBOARD_IMAGE_MAX_BYTES {
        return None;
    }
    Some(paths[0].as_str())
}

#[cfg(target_os = "macos")]
fn write_files_to_clipboard_native(paths: &[String]) -> Result<(), String> {
    match write_files_to_pasteboard(paths) {
        Ok(()) => Ok(()),
        Err(e) => {
            log::warn!("NSPasteboard 쓰기 실패 ({}), osascript 폴백", e);
            write_files_to_clipboard_osascript(paths)
        }
    }
}

// NSPasteboard에 파일 URL(Finder와 동일) + 단일 이미지면 PNG/TIFF 데이터까지 등록
#[cfg(target_os = "macos")]
fn write_files_to_pasteboard(paths: &[String]) -> Result<(), String> {
    use objc::runtime::{Class, Object, BOOL, NO};
    use objc::{msg_send, sel, sel_impl};

    let ns_string = |cls: &Class, s: &str| -> Result<*mut Object, String> {
        let c = std::ffi::CString::new(s).map_err(|e| e.to_string())?;
        let obj: *mut Object = unsafe { msg_send![cls, stringWithUTF8String: c.as_ptr()] };
        if obj.is_null() {
            return Err("NSString 생성 실패".into());
        }
        Ok(obj)
    };

    unsafe {
        let pool_class = Class::get("NSAutoreleasePool").ok_or("NSAutoreleasePool not found")?;
        let pool: *mut Object = msg_send![pool_class, new];

        let result = (|| -> Result<(), String> {
            let pb_class = Class::get("NSPasteboard").ok_or("NSPasteboard not found")?;
            let url_class = Class::get("NSURL").ok_or("NSURL not found")?;
            let arr_class = Class::get("NSMutableArray").ok_or("NSMutableArray not found")?;
            let str_class = Class::get("NSString").ok_or("NSString not found")?;

            let pb: *mut Object = msg_send![pb_class, generalPasteboard];
            if pb.is_null() {
                return Err("generalPasteboard is null".into());
            }

            let urls: *mut Object = msg_send![arr_class, arrayWithCapacity: paths.len()];
            for p in paths {
                let ns_path = ns_string(str_class, p)?;
                let url: *mut Object = msg_send![url_class, fileURLWithPath: ns_path];
                if url.is_null() {
                    return Err(format!("NSURL 생성 실패: {}", p));
                }
                let _: () = msg_send![urls, addObject: url];
            }

            let _: isize = msg_send![pb, clearContents];
            let ok: BOOL = msg_send![pb, writeObjects: urls];
            if ok == NO {
                return Err("writeObjects 실패".into());
            }

            // 이미지 데이터는 첫 번째 pasteboard item에 추가 (실패해도 파일 복사는 유지)
            if let Some(img_path) = single_image_path(paths) {
                let ns_path = ns_string(str_class, img_path)?;
                let is_png = img_path.to_ascii_lowercase().ends_with(".png");
                if is_png {
                    if let Ok(bytes) = std::fs::read(img_path) {
                        if let Some(data_class) = Class::get("NSData") {
                            let data: *mut Object = msg_send![data_class, dataWithBytes: bytes.as_ptr() as *const std::ffi::c_void length: bytes.len()];
                            if !data.is_null() {
                                let t = ns_string(str_class, "public.png")?;
                                let _: BOOL = msg_send![pb, setData: data forType: t];
                            }
                        }
                    }
                }
                if let Some(img_class) = Class::get("NSImage") {
                    let alloc: *mut Object = msg_send![img_class, alloc];
                    let image: *mut Object = msg_send![alloc, initWithContentsOfFile: ns_path];
                    if !image.is_null() {
                        let tiff: *mut Object = msg_send![image, TIFFRepresentation];
                        if !tiff.is_null() {
                            let t = ns_string(str_class, "public.tiff")?;
                            let _: BOOL = msg_send![pb, setData: tiff forType: t];
                        }
                        let _: () = msg_send![image, release];
                    }
                }
            }
            Ok(())
        })();

        let _: () = msg_send![pool, drain];
        result
    }
}

#[cfg(target_os = "macos")]
fn write_files_to_clipboard_osascript(paths: &[String]) -> Result<(), String> {
    // osascript(AppleScript)로 클립보드에 파일 등록
    let file_refs: Vec<String> = paths
        .iter()
        .map(|p| {
            format!(
                "POSIX file \"{}\"",
                p.replace('\\', "\\\\").replace('"', "\\\"")
            )
        })
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
        if pb.is_null() {
            return Err("generalPasteboard is null".into());
        }

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
                if url.is_null() {
                    continue;
                }

                let is_file: i8 = msg_send![url, isFileURL];
                if is_file == 0 {
                    continue;
                }

                let path: *mut Object = msg_send![url, path];
                if path.is_null() {
                    continue;
                }

                let utf8: *const std::os::raw::c_char = msg_send![path, UTF8String];
                if utf8.is_null() {
                    continue;
                }

                let path_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(path_str);
            }

            if !result.is_empty() {
                return Ok(result);
            }
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
                if item.is_null() {
                    continue;
                }
                let utf8: *const std::os::raw::c_char = msg_send![item, UTF8String];
                if utf8.is_null() {
                    continue;
                }
                let s = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(s);
            }
            if !result.is_empty() {
                return Ok(result);
            }
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
    use std::mem;
    use std::ptr;
    use winapi::um::winbase::{
        GlobalAlloc, GlobalFree, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };
    use winapi::um::winuser::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
        CF_DIB, CF_HDROP,
    };

    // winapi 크레이트에 DROPFILES가 없어서 직접 정의
    // 필드명은 Win32 DROPFILES 구조체(MSDN)와 1:1 대응시키기 위해 원본 명명을 유지
    #[repr(C)]
    #[allow(non_snake_case)]
    struct DROPFILES {
        pFiles: u32,
        pt_x: i32,
        pt_y: i32,
        fNC: i32,
        fWide: i32,
    }

    // 경로를 UTF-16 null 종료 문자열로 변환
    let wide_paths: Vec<Vec<u16>> = paths
        .iter()
        .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
        .collect();

    // DROPFILES 헤더 + 모든 경로 + 끝 null 종료자
    let mut total_size = mem::size_of::<DROPFILES>();
    for wp in &wide_paths {
        total_size += wp.len() * 2;
    }
    total_size += 2; // 끝 null 종료자

    // 클립보드를 잠그기 전에 이미지 디코딩을 끝내 잠금 시간을 줄인다
    let image_payload = single_image_path(paths).and_then(build_windows_image_payload);

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

        // 이미지 데이터 추가 (실패해도 파일 복사는 유지)
        if let Some((dib, png)) = image_payload {
            set_clipboard_bytes(CF_DIB, &dib);
            let png_name: Vec<u16> = "PNG".encode_utf16().chain(std::iter::once(0)).collect();
            let png_format = RegisterClipboardFormatW(png_name.as_ptr());
            if png_format != 0 {
                set_clipboard_bytes(png_format, &png);
            }
        }

        CloseClipboard();
        Ok(())
    }
}

// 열린 클립보드에 바이트 데이터를 지정 포맷으로 등록
#[cfg(target_os = "windows")]
unsafe fn set_clipboard_bytes(format: u32, bytes: &[u8]) -> bool {
    use std::ptr;
    use winapi::um::winbase::{GlobalAlloc, GlobalFree, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use winapi::um::winuser::SetClipboardData;

    let h_global = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
    if h_global.is_null() {
        return false;
    }
    let data = GlobalLock(h_global) as *mut u8;
    if data.is_null() {
        GlobalFree(h_global);
        return false;
    }
    ptr::copy_nonoverlapping(bytes.as_ptr(), data, bytes.len());
    GlobalUnlock(h_global);
    if SetClipboardData(format, h_global).is_null() {
        GlobalFree(h_global);
        return false;
    }
    true
}

// 이미지 파일 → (CF_DIB 바이트, PNG 바이트). PNG 포맷은 알파 채널을 보존하는 앱(Office, 브라우저 등)용
#[cfg(target_os = "windows")]
fn build_windows_image_payload(path: &str) -> Option<(Vec<u8>, Vec<u8>)> {
    let img = image::open(path).ok()?.to_rgba8();
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return None;
    }

    // BITMAPINFOHEADER(40바이트) + 32bpp BGRA bottom-up 픽셀
    let pixel_bytes = (width as usize) * (height as usize) * 4;
    let mut dib = Vec::with_capacity(40 + pixel_bytes);
    dib.extend_from_slice(&40u32.to_le_bytes()); // biSize
    dib.extend_from_slice(&(width as i32).to_le_bytes()); // biWidth
    dib.extend_from_slice(&(height as i32).to_le_bytes()); // biHeight (양수 = bottom-up)
    dib.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    dib.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    dib.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    dib.extend_from_slice(&(pixel_bytes as u32).to_le_bytes()); // biSizeImage
    dib.extend_from_slice(&0i32.to_le_bytes()); // biXPelsPerMeter
    dib.extend_from_slice(&0i32.to_le_bytes()); // biYPelsPerMeter
    dib.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    dib.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant
    for row in img.rows().rev() {
        for px in row {
            let [r, g, b, a] = px.0;
            dib.extend_from_slice(&[b, g, r, a]);
        }
    }

    let png = if path.to_ascii_lowercase().ends_with(".png") {
        std::fs::read(path).ok()?
    } else {
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png).ok()?;
        buf.into_inner()
    };

    Some((dib, png))
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
    use std::ptr;
    use winapi::um::shellapi::{DragQueryFileW, HDROP};
    use winapi::um::winuser::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, CF_HDROP,
    };

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
        image::ImageBuffer::from_raw(width, height, rgba_data).ok_or("이미지 버퍼 생성 실패")?;
    img_buf
        .save(&file_path)
        .map_err(|e| format!("이미지 저장 실패: {}", e))?;

    Ok(Some(file_path.to_string_lossy().to_string()))
}
