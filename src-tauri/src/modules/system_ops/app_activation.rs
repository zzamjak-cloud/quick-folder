//! 앱 활성화 모듈
//! 트레이 drag-out 후 드롭 대상 앱을 전면으로 유지하기 위한 macOS 전용 명령

// 지정 좌표(CG 글로벌 top-left, 미지정 시 현재 커서) 아래 다른 앱 창의 소유 PID 조회 (macOS 외 플랫폼은 None)
#[tauri::command]
pub fn get_app_pid_under_cursor(point: Option<(f64, f64)>) -> Result<Option<i32>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos::pid_at_point(point))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = point;
        Ok(None)
    }
}

// 지정 PID의 앱을 전면으로 활성화 (macOS 외 플랫폼은 no-op)
#[tauri::command]
pub fn activate_app_by_pid(app: tauri::AppHandle, pid: i32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // AppKit 호출은 메인 스레드에서 수행
        app.run_on_main_thread(move || macos::activate_pid(pid))
            .map_err(|e| format!("앱 활성화 디스패치 실패: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, pid);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc::runtime::{Class, Object, BOOL};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::{c_void, CString};

    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *mut c_void;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    // kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
    const WINDOW_LIST_OPTIONS: u32 = (1 << 0) | (1 << 4);

    unsafe fn ns_string(s: &str) -> Option<*mut Object> {
        let cls = Class::get("NSString")?;
        let c = CString::new(s).ok()?;
        let obj: *mut Object = msg_send![cls, stringWithUTF8String: c.as_ptr()];
        if obj.is_null() { None } else { Some(obj) }
    }

    unsafe fn dict_value(dict: *mut Object, key: &str) -> Option<*mut Object> {
        let key_obj = ns_string(key)?;
        let value: *mut Object = msg_send![dict, objectForKey: key_obj];
        if value.is_null() { None } else { Some(value) }
    }

    unsafe fn number_f64(dict: *mut Object, key: &str) -> Option<f64> {
        let num = dict_value(dict, key)?;
        Some(msg_send![num, doubleValue])
    }

    // 지정 좌표(글로벌 top-left)에서 자기 자신을 제외한 최전면 일반 창의 소유 PID 반환
    // point 미지정 시 현재 커서 위치 사용 (드롭 직후엔 커서가 이미 이동했을 수 있어 드롭 좌표 전달을 권장)
    pub(super) fn pid_at_point(point: Option<(f64, f64)>) -> Option<i32> {
        unsafe {
            let cursor = match point {
                Some((x, y)) => CGPoint { x, y },
                None => {
                    let event = CGEventCreate(std::ptr::null());
                    if event.is_null() {
                        return None;
                    }
                    let location = CGEventGetLocation(event);
                    CFRelease(event);
                    location
                }
            };

            // CFArray는 NSArray와 toll-free 브리지되므로 objc 메시지로 순회
            let windows = CGWindowListCopyWindowInfo(WINDOW_LIST_OPTIONS, 0) as *mut Object;
            if windows.is_null() {
                return None;
            }

            let own_pid = std::process::id() as i32;
            let count: usize = msg_send![windows, count];
            let mut found: Option<i32> = None;

            // 반환 순서는 전면 → 후면이므로 첫 매치가 커서 아래 최상위 창
            for i in 0..count {
                let info: *mut Object = msg_send![windows, objectAtIndex: i];
                if info.is_null() {
                    continue;
                }

                let alpha = number_f64(info, "kCGWindowAlpha").unwrap_or(0.0);
                if alpha <= 0.0 {
                    continue;
                }

                let pid = match dict_value(info, "kCGWindowOwnerPID") {
                    Some(num) => {
                        let v: i32 = msg_send![num, intValue];
                        v
                    }
                    None => continue,
                };

                let layer = number_f64(info, "kCGWindowLayer").unwrap_or(-1.0);
                // 자기 창은 트레이(alwaysOnTop, floating 레이어)도 포함해서 판정하고,
                // 다른 앱은 일반 창 레이어(0)만 대상 (메뉴바·독·오버레이 제외)
                if pid != own_pid && layer != 0.0 {
                    continue;
                }

                let bounds = match dict_value(info, "kCGWindowBounds") {
                    Some(b) => b,
                    None => continue,
                };
                let x = number_f64(bounds, "X").unwrap_or(f64::MAX);
                let y = number_f64(bounds, "Y").unwrap_or(f64::MAX);
                let w = number_f64(bounds, "Width").unwrap_or(0.0);
                let h = number_f64(bounds, "Height").unwrap_or(0.0);

                if cursor.x >= x && cursor.x <= x + w && cursor.y >= y && cursor.y <= y + h {
                    // 커서 아래 최상위 창이 자기 창이면 외부 드롭이 아님
                    if pid != own_pid {
                        found = Some(pid);
                    }
                    break;
                }
            }

            CFRelease(windows as *const c_void);
            found
        }
    }

    // NSRunningApplication으로 대상 앱을 전면 활성화
    pub(super) fn activate_pid(pid: i32) {
        unsafe {
            let cls = match Class::get("NSRunningApplication") {
                Some(c) => c,
                None => return,
            };
            let app: *mut Object = msg_send![cls, runningApplicationWithProcessIdentifier: pid];
            if app.is_null() {
                return;
            }
            // NSApplicationActivateIgnoringOtherApps
            let _: BOOL = msg_send![app, activateWithOptions: 2u64];
        }
    }
}
