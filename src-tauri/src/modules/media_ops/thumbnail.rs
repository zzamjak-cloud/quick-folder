//! 미디어 썸네일 처리 모듈

use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::{
    cached_thumbnail, ensure_cached_thumbnail, ensure_google_drive_thumbnail,
    invalidate_thumbnail_cache_paths,
};
use base64::Engine;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailBatchItem {
    pub path: String,
    pub file_type: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailBatchResult {
    pub path: String,
    pub file_type: String,
    pub cached_path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_video_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    let cache_dir = app_cache.join("video_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        let resolved_path = materialize_archive_path_in_cache(&app, &path)?
            .unwrap_or_else(|| std::path::PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);
        if is_cloud {
            if let Some(cache_path) =
                ensure_google_drive_thumbnail(&app_cache, &resolved_path_str, size, || {
                    // 비율 보존: 네이티브 프레임 추출(AVFoundation maximumSize / Windows shell
                    // RESIZETOFIT — 둘 다 비율 유지)만 사용. QuickLook은 정사각으로 잘려 영상
                    // 비율을 왜곡하므로 쓰지 않는다.
                    get_native_video_thumbnail(&resolved_path_str, size)
                })?
            {
                let cached = std::fs::read(cache_path)?;
                return Ok(Some(
                    base64::engine::general_purpose::STANDARD.encode(&cached),
                ));
            }
        }

        cached_thumbnail(&cache_dir, &resolved_path_str, size, false, || {
            // 비율 보존 네이티브 추출만 사용(QuickLook 정사각 잘림 회피)
            get_native_video_thumbnail(&resolved_path_str, size)
        })
    })
    .await
    .map_err(|e| AppError::VideoProcessing(e.to_string()))?
}

// 동영상 썸네일 캐시 PNG 경로 반환 (asset 프로토콜용 — base64/IPC 왕복 없음)
#[tauri::command]
pub async fn get_video_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    let cache_dir = app_cache.join("video_thumbnails");

    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>> {
        let resolved_path = materialize_archive_path_in_cache(&app, &path)?
            .unwrap_or_else(|| std::path::PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        // 클라우드 경로: OS 썸네일 우선(풀 다운로드 회피) + mtime 무시 캐시 키
        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);
        if is_cloud {
            if let Some(cache_path) =
                ensure_google_drive_thumbnail(&app_cache, &resolved_path_str, size, || {
                    // 비율 보존: 네이티브 프레임 추출(AVFoundation maximumSize / Windows shell
                    // RESIZETOFIT — 둘 다 비율 유지)만 사용. QuickLook은 정사각으로 잘려 영상
                    // 비율을 왜곡하므로 쓰지 않는다.
                    get_native_video_thumbnail(&resolved_path_str, size)
                })?
            {
                return Ok(Some(cache_path.to_string_lossy().to_string()));
            }
        }
        let cache_path = ensure_cached_thumbnail(
            &cache_dir,
            &resolved_path_str,
            size,
            false,
            is_cloud,
            // 비율 보존 네이티브 추출만 사용(QuickLook 정사각 잘림 회피)
            || get_native_video_thumbnail(&resolved_path_str, size),
        )?;
        Ok(cache_path.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| AppError::VideoProcessing(e.to_string()))?
}

#[tauri::command]
pub async fn ensure_thumbnails_batch(
    app: tauri::AppHandle,
    items: Vec<ThumbnailBatchItem>,
    size: u32,
) -> Result<Vec<ThumbnailBatchResult>> {
    const MAX_BATCH_ITEMS: usize = 200;
    // 클라우드(File Provider)는 I/O 대기형이라 한 건씩 직렬 처리하면 폴더 워밍이 매우 느리다.
    // 청크 단위로 동시에 처리해 처리량을 높인다(CPU 합성은 내부 heavy-op 퍼밋이 별도 제한).
    const BATCH_CONCURRENCY: usize = 16;

    let items: Vec<ThumbnailBatchItem> = items.into_iter().take(MAX_BATCH_ITEMS).collect();
    let mut results = Vec::with_capacity(items.len());

    for chunk in items.chunks(BATCH_CONCURRENCY) {
        let mut handles = Vec::with_capacity(chunk.len());
        for item in chunk {
            let app = app.clone();
            let task_path = item.path.clone();
            let task_ft = item.file_type.clone();
            let handle = tauri::async_runtime::spawn(async move {
                match task_ft.as_str() {
                    "image" => {
                        crate::modules::image_ops::get_file_thumbnail_path(app, task_path, size)
                            .await
                    }
                    "psd" => {
                        crate::modules::image_ops::get_psd_thumbnail_path(app, task_path, size).await
                    }
                    "video" => get_video_thumbnail_path(app, task_path, size).await,
                    _ => Ok(None),
                }
            });
            // path/file_type을 함께 보관해 join 실패 시에도 입력과 1:1 순서·개수를 보장
            // (프론트 prewarm이 결과를 입력 순서로 메모리 캐시에 매핑한다)
            handles.push((item.path.clone(), item.file_type.clone(), handle));
        }

        for (path, file_type, handle) in handles {
            let (cached_path, error) = match handle.await {
                Ok(Ok(cached_path)) => (cached_path, None),
                Ok(Err(e)) => (None, Some(e.to_string())),
                Err(_) => (None, Some("thumbnail task failed".to_string())),
            };
            results.push(ThumbnailBatchResult {
                path,
                file_type,
                cached_path,
                error,
            });
        }
    }

    Ok(results)
}

// macOS: AVFoundation AVAssetImageGenerator로 동영상 프레임 추출
#[cfg(target_os = "macos")]
fn get_native_video_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::c_void;

    unsafe {
        // NSURL fileURLWithPath:
        let nsurl_class = Class::get("NSURL")
            .ok_or_else(|| AppError::VideoProcessing("NSURL not found".to_string()))?;
        let path_nsstring: *mut Object = msg_send![
            Class::get("NSString").unwrap(),
            stringWithUTF8String: std::ffi::CString::new(path).map_err(|e| AppError::VideoProcessing(e.to_string()))?.as_ptr()
        ];
        let url: *mut Object = msg_send![nsurl_class, fileURLWithPath: path_nsstring];
        if url.is_null() {
            return Ok(None);
        }

        // AVAsset assetWithURL:
        let avasset_class = Class::get("AVAsset")
            .ok_or_else(|| AppError::VideoProcessing("AVAsset not found".to_string()))?;
        let asset: *mut Object = msg_send![avasset_class, assetWithURL: url];
        if asset.is_null() {
            return Ok(None);
        }

        // AVAssetImageGenerator alloc/initWithAsset:
        let generator_class = Class::get("AVAssetImageGenerator").ok_or_else(|| {
            AppError::VideoProcessing("AVAssetImageGenerator not found".to_string())
        })?;
        let generator: *mut Object = msg_send![generator_class, alloc];
        let generator: *mut Object = msg_send![generator, initWithAsset: asset];
        if generator.is_null() {
            return Ok(None);
        }

        // appliesPreferredTrackTransform = YES (회전 보정)
        let _: () = msg_send![generator, setAppliesPreferredTrackTransform: true];

        // maximumSize 설정
        #[repr(C)]
        struct CGSize {
            width: f64,
            height: f64,
        }
        let max_size = CGSize {
            width: size as f64,
            height: size as f64,
        };
        let _: () = msg_send![generator, setMaximumSize: max_size];

        // CMTime: 1초 지점
        #[repr(C)]
        #[derive(Copy, Clone)]
        struct CMTime {
            value: i64,
            timescale: i32,
            flags: u32,
            epoch: i64,
        }
        let time = CMTime {
            value: 1,
            timescale: 1,
            flags: 1,
            epoch: 0,
        };

        // copyCGImageAtTime:actualTime:error:
        let mut actual_time = time;
        let mut error: *mut Object = std::ptr::null_mut();
        let cg_image: *mut c_void = msg_send![
            generator,
            copyCGImageAtTime: time
            actualTime: &mut actual_time as *mut CMTime
            error: &mut error as *mut *mut Object
        ];

        if cg_image.is_null() || !error.is_null() {
            let _: () = msg_send![generator, release];
            return Ok(None);
        }

        // CGImage → NSBitmapImageRep → PNG 데이터
        let bitmap_class = Class::get("NSBitmapImageRep")
            .ok_or_else(|| AppError::VideoProcessing("NSBitmapImageRep not found".to_string()))?;
        let bitmap: *mut Object = msg_send![bitmap_class, alloc];
        let bitmap: *mut Object = msg_send![bitmap, initWithCGImage: cg_image];

        // CGImageRelease
        extern "C" {
            fn CGImageRelease(image: *mut c_void);
        }
        CGImageRelease(cg_image);

        if bitmap.is_null() {
            let _: () = msg_send![generator, release];
            return Ok(None);
        }

        // representationUsingType:NSBitmapImageFileTypePNG properties:@{}
        let empty_dict: *mut Object = msg_send![Class::get("NSDictionary").unwrap(), dictionary];
        let png_data: *mut Object = msg_send![
            bitmap,
            representationUsingType: 4u64  // NSBitmapImageFileTypePNG = 4
            properties: empty_dict
        ];

        let result = if !png_data.is_null() {
            let length: usize = msg_send![png_data, length];
            let bytes: *const u8 = msg_send![png_data, bytes];
            Some(std::slice::from_raw_parts(bytes, length).to_vec())
        } else {
            None
        };

        let _: () = msg_send![bitmap, release];
        let _: () = msg_send![generator, release];

        Ok(result)
    }
}

// 클라우드 파일용 OS 네이티브 썸네일 (풀 다운로드 없이 제공자 썸네일 활용)
// macOS: QuickLook(QLThumbnailImageCreate), Windows: Shell(IShellItemImageFactory)
// 구글드라이브/OneDrive 등은 OS 썸네일 핸들러로 서버측 썸네일을 즉시 제공 → 첫 진입 비용 대폭 절감
pub(crate) fn get_os_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>> {
    #[cfg(target_os = "macos")]
    {
        get_quicklook_thumbnail(path, size)
    }
    #[cfg(target_os = "windows")]
    {
        get_windows_shell_thumbnail(path, size)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (path, size);
        Ok(None)
    }
}

// macOS: CGImage → PNG 바이트 (NSBitmapImageRep). cg_image는 호출측 소유(여기서 release 안 함)
#[cfg(target_os = "macos")]
unsafe fn cgimage_to_png(cg_image: *mut std::ffi::c_void) -> Option<Vec<u8>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    let bitmap_class = Class::get("NSBitmapImageRep")?;
    let bitmap: *mut Object = msg_send![bitmap_class, alloc];
    let bitmap: *mut Object = msg_send![bitmap, initWithCGImage: cg_image];
    if bitmap.is_null() {
        return None;
    }
    let dict_cls = Class::get("NSDictionary")?;
    let empty_dict: *mut Object = msg_send![dict_cls, dictionary];
    let png_data: *mut Object = msg_send![
        bitmap,
        representationUsingType: 4u64 // NSBitmapImageFileTypePNG
        properties: empty_dict
    ];
    let result = if !png_data.is_null() {
        let length: usize = msg_send![png_data, length];
        let bytes: *const u8 = msg_send![png_data, bytes];
        Some(std::slice::from_raw_parts(bytes, length).to_vec())
    } else {
        None
    };
    let _: () = msg_send![bitmap, release];
    result
}

// macOS: 최신 QLThumbnailGenerator(비동기) — Finder와 동일 경로.
// File Provider 서버 썸네일을 활용해 클라우드 파일을 풀 다운로드 없이 빠르게 생성.
// 비동기 completion을 dispatch_semaphore로 동기화하여 spawn_blocking 안에서 사용.
#[cfg(target_os = "macos")]
fn get_quicklook_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>> {
    use block::ConcreteBlock;
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::c_void;
    use std::sync::{Arc, Mutex};

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct CGSize {
        width: f64,
        height: f64,
    }

    extern "C" {
        fn dispatch_semaphore_create(value: isize) -> *mut Object;
        fn dispatch_semaphore_signal(sema: *mut Object) -> isize;
        fn dispatch_semaphore_wait(sema: *mut Object, timeout: u64) -> isize;
        fn dispatch_time(when: u64, delta: i64) -> u64;
    }

    unsafe {
        let nsstring_cls = Class::get("NSString")
            .ok_or_else(|| AppError::Internal("NSString not found".to_string()))?;
        let cpath = std::ffi::CString::new(path).map_err(|e| AppError::Internal(e.to_string()))?;
        let path_ns: *mut Object = msg_send![nsstring_cls, stringWithUTF8String: cpath.as_ptr()];
        let nsurl_cls =
            Class::get("NSURL").ok_or_else(|| AppError::Internal("NSURL not found".to_string()))?;
        let url: *mut Object = msg_send![nsurl_cls, fileURLWithPath: path_ns];
        if url.is_null() {
            return Ok(None);
        }

        // QLThumbnailGenerationRequest(initWithFileAtURL:size:scale:representationTypes:)
        let req_cls = Class::get("QLThumbnailGenerationRequest").ok_or_else(|| {
            AppError::Internal("QLThumbnailGenerationRequest not found".to_string())
        })?;
        let cg_size = CGSize {
            width: size as f64,
            height: size as f64,
        };
        let scale: f64 = 1.0;
        // QLThumbnailGenerationRequestRepresentationTypeThumbnail = 1<<2
        let rep_types: u64 = 1 << 2;
        let req: *mut Object = msg_send![req_cls, alloc];
        let req: *mut Object = msg_send![
            req,
            initWithFileAtURL: url
            size: cg_size
            scale: scale
            representationTypes: rep_types
        ];
        if req.is_null() {
            return Ok(None);
        }

        let gen_cls = Class::get("QLThumbnailGenerator")
            .ok_or_else(|| AppError::Internal("QLThumbnailGenerator not found".to_string()))?;
        let generator: *mut Object = msg_send![gen_cls, sharedGenerator];

        let sema = dispatch_semaphore_create(0);
        let out: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
        let out_cb = out.clone();
        let sema_addr = sema as usize;

        // completion: (thumbnail: QLThumbnailRepresentation*, error: NSError*)
        let handler = ConcreteBlock::new(move |rep: *mut Object, _err: *mut Object| {
            if !rep.is_null() {
                let cg: *mut c_void = msg_send![rep, CGImage];
                if !cg.is_null() {
                    if let Some(png) = cgimage_to_png(cg) {
                        if let Ok(mut g) = out_cb.lock() {
                            *g = Some(png);
                        }
                    }
                    // cg는 representation 소유 → release 안 함
                }
            }
            let _ = dispatch_semaphore_signal(sema_addr as *mut Object);
        });
        let handler = handler.copy();

        let _: () = msg_send![
            generator,
            generateBestRepresentationForRequest: req
            completionHandler: &*handler
        ];

        // 최대 10초 대기 (completion은 별도 GCD 큐에서 실행되므로 데드락 없음)
        let timeout = dispatch_time(0, 10_000_000_000i64);
        let _ = dispatch_semaphore_wait(sema, timeout);

        let _: () = msg_send![req, release];

        let r = out.lock().ok().and_then(|mut g| g.take());
        Ok(r)
    }
}

// Windows: Shell COM 인터페이스로 썸네일 추출 (영상·이미지·클라우드 파일 공용)
#[cfg(target_os = "windows")]
fn get_windows_shell_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>> {
    use winapi::shared::guiddef::GUID;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::windef::HBITMAP;
    use winapi::shared::winerror::HRESULT;
    use winapi::um::combaseapi::{CoInitializeEx, CoUninitialize};
    use winapi::um::objbase::COINIT_MULTITHREADED;
    use winapi::um::wingdi::*;
    // use winapi::um::unknwnbase::{IUnknown, IUnknownVtbl}; // 사용하지 않음
    use std::ffi::c_void;
    use std::ptr;

    // IShellItemImageFactory COM 인터페이스 수동 정의
    #[repr(C)]
    struct IShellItemImageFactoryVtbl {
        // IUnknown
        query_interface: unsafe extern "system" fn(
            *mut IShellItemImageFactoryRaw,
            *const GUID,
            *mut *mut c_void,
        ) -> HRESULT,
        add_ref: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw) -> u32,
        release: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw) -> u32,
        // IShellItemImageFactory
        get_image: unsafe extern "system" fn(
            *mut IShellItemImageFactoryRaw,
            winapi::shared::windef::SIZE,
            u32,
            *mut HBITMAP,
        ) -> HRESULT,
    }

    #[repr(C)]
    struct IShellItemImageFactoryRaw {
        vtbl: *const IShellItemImageFactoryVtbl,
    }

    extern "system" {
        fn SHCreateItemFromParsingName(
            pszPath: *const u16,
            pbc: *mut c_void,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    // IShellItemImageFactory GUID: {bcc18b79-ba16-442f-80c4-8a59c30c463b}
    let iid_image_factory = GUID {
        Data1: 0xbcc18b79,
        Data2: 0xba16,
        Data3: 0x442f,
        Data4: [0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b],
    };

    unsafe {
        CoInitializeEx(ptr::null_mut(), COINIT_MULTITHREADED);

        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

        // SHCreateItemFromParsingName으로 IShellItemImageFactory 직접 취득
        let mut factory: *mut IShellItemImageFactoryRaw = ptr::null_mut();
        let hr = SHCreateItemFromParsingName(
            wide_path.as_ptr(),
            ptr::null_mut(),
            &iid_image_factory,
            &mut factory as *mut _ as *mut *mut c_void,
        );
        if hr != 0 || factory.is_null() {
            CoUninitialize();
            return Ok(None);
        }

        // GetImage로 HBITMAP 취득
        let sz = winapi::shared::windef::SIZE {
            cx: size as i32,
            cy: size as i32,
        };
        let mut hbitmap: HBITMAP = ptr::null_mut();
        let hr = ((*(*factory).vtbl).get_image)(factory, sz, 0x0, &mut hbitmap);
        ((*(*factory).vtbl).release)(factory);

        if hr != 0 || hbitmap.is_null() {
            CoUninitialize();
            return Ok(None);
        }

        // HBITMAP → 픽셀 데이터 추출
        let mut bmp_info = BITMAP {
            bmType: 0,
            bmWidth: 0,
            bmHeight: 0,
            bmWidthBytes: 0,
            bmPlanes: 0,
            bmBitsPixel: 0,
            bmBits: ptr::null_mut(),
        };
        GetObjectW(
            hbitmap as *mut _,
            std::mem::size_of::<BITMAP>() as i32,
            &mut bmp_info as *mut _ as *mut _,
        );

        let width = bmp_info.bmWidth as u32;
        let height = bmp_info.bmHeight.unsigned_abs();
        if width == 0 || height == 0 {
            DeleteObject(hbitmap as *mut _);
            CoUninitialize();
            return Ok(None);
        }

        // GetDIBits로 BGRA 픽셀 추출
        let hdc = CreateCompatibleDC(ptr::null_mut());
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as DWORD,
                biWidth: width as i32,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            hdc,
            hbitmap,
            0,
            height,
            pixels.as_mut_ptr() as *mut _,
            &mut bi,
            DIB_RGB_COLORS,
        );
        DeleteDC(hdc);
        DeleteObject(hbitmap as *mut _);
        CoUninitialize();

        // BGRA → RGBA 변환
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2); // B ↔ R
        }

        // image crate로 PNG 인코딩
        let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
            image::ImageBuffer::from_raw(width, height, pixels)
                .ok_or_else(|| AppError::VideoProcessing("이미지 버퍼 생성 실패".to_string()))?;

        let mut png_buf = std::io::Cursor::new(Vec::new());
        img_buf
            .write_to(&mut png_buf, image::ImageFormat::Png)
            .map_err(|e| AppError::VideoProcessing(format!("PNG 인코딩 실패: {}", e)))?;

        Ok(Some(png_buf.into_inner()))
    }
}

// Windows 동영상 썸네일: 범용 Shell 썸네일 함수에 위임
#[cfg(target_os = "windows")]
fn get_native_video_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>> {
    get_windows_shell_thumbnail(path, size)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_native_video_thumbnail(_path: &str, _size: u32) -> Result<Option<Vec<u8>>> {
    Ok(None)
}

#[tauri::command]
pub fn invalidate_thumbnail_cache(app: tauri::AppHandle, paths: Vec<String>) -> Result<()> {
    invalidate_thumbnail_cache_paths(&app, &paths)
}
