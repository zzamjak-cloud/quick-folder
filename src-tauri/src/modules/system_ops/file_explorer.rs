//! 파일 탐색기 연동 모듈
//! 폴더 열기, 앱 실행, 경로 복사, 폴더 선택 다이얼로그

use super::FolderSelection;

// ===== 파일 탐색기 연동 =====

// 폴더/파일을 시스템 파일 탐색기에서 열기
#[tauri::command]
pub async fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| format!("폴더 열기 실패: {}", e))?;

    Ok(())
}

// 특정 앱으로 파일 열기
#[tauri::command]
pub async fn open_with_app(path: String, app: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", &app, &path])
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &app, &path])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (&path, &app);
    }
    Ok(())
}

// Photoshop에서 파일 열기
#[tauri::command]
pub async fn open_in_photoshop(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // /Applications/에서 "Adobe Photoshop*" 앱 중 최신 버전 찾기
        let ps_app = std::fs::read_dir("/Applications")
            .ok()
            .and_then(|entries| {
                entries
                    .flatten()
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        if name.starts_with("Adobe Photoshop") && name.ends_with(".app") {
                            Some(name)
                        } else if name.starts_with("Adobe Photoshop") && e.path().is_dir() {
                            Some(name)
                        } else {
                            None
                        }
                    })
                    .max() // 알파벳 순 최대 = 최신 버전
            })
            .ok_or_else(|| "Photoshop을 찾을 수 없습니다. 설치되어 있는지 확인해주세요.".to_string())?;

        let mut cmd = std::process::Command::new("open");
        cmd.arg("-a").arg(&ps_app);
        for p in &paths {
            cmd.arg(p);
        }
        cmd.spawn().map_err(|e| format!("Photoshop 실행 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // 레지스트리에서 Photoshop 경로 탐색
        fn find_photoshop_path() -> Option<String> {
            use winapi::um::winreg::{RegOpenKeyExW, RegCloseKey, RegEnumKeyExW, RegQueryValueExW, HKEY_LOCAL_MACHINE};
            use winapi::um::winnt::{KEY_READ, REG_SZ};
            use std::ptr;

            unsafe {
                let subkey: Vec<u16> = "SOFTWARE\\Adobe\\Photoshop\0".encode_utf16().collect();
                let mut hkey = ptr::null_mut();
                if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != 0 {
                    return None;
                }

                // 최신 버전 키 찾기 (예: "160.0", "170.0" 등)
                let mut latest_version = String::new();
                let mut index = 0u32;
                loop {
                    let mut name_buf = vec![0u16; 256];
                    let mut name_len = 256u32;
                    let result = RegEnumKeyExW(
                        hkey, index, name_buf.as_mut_ptr(), &mut name_len,
                        ptr::null_mut(), ptr::null_mut(), ptr::null_mut(), ptr::null_mut()
                    );
                    if result != 0 { break; }
                    let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                    if name > latest_version {
                        latest_version = name;
                    }
                    index += 1;
                }
                RegCloseKey(hkey);

                if latest_version.is_empty() {
                    return None;
                }

                // ApplicationPath 값 읽기
                let full_key = format!("SOFTWARE\\Adobe\\Photoshop\\{}\0", latest_version);
                let full_key_w: Vec<u16> = full_key.encode_utf16().collect();
                let mut hkey2 = ptr::null_mut();
                if RegOpenKeyExW(HKEY_LOCAL_MACHINE, full_key_w.as_ptr(), 0, KEY_READ, &mut hkey2) != 0 {
                    return None;
                }

                let value_name: Vec<u16> = "ApplicationPath\0".encode_utf16().collect();
                let mut data_type = 0u32;
                let mut data_size = 0u32;
                if RegQueryValueExW(hkey2, value_name.as_ptr(), ptr::null_mut(), &mut data_type, ptr::null_mut(), &mut data_size) != 0 {
                    RegCloseKey(hkey2);
                    return None;
                }
                if data_type != REG_SZ {
                    RegCloseKey(hkey2);
                    return None;
                }

                let mut data = vec![0u8; data_size as usize];
                if RegQueryValueExW(hkey2, value_name.as_ptr(), ptr::null_mut(), &mut data_type, data.as_mut_ptr(), &mut data_size) != 0 {
                    RegCloseKey(hkey2);
                    return None;
                }
                RegCloseKey(hkey2);

                let path_slice: &[u16] = std::slice::from_raw_parts(data.as_ptr() as *const u16, data_size as usize / 2);
                let app_dir = String::from_utf16_lossy(path_slice).trim_end_matches('\0').to_string();
                // 경로 구분자 보정
                let sep = if app_dir.ends_with('\\') { "" } else { "\\" };
                let exe_path = format!("{}{}Photoshop.exe", app_dir, sep);
                if std::path::Path::new(&exe_path).exists() {
                    return Some(exe_path);
                }
                None
            }
        }

        // Program Files에서 직접 탐색 (레지스트리 폴백)
        fn find_photoshop_in_program_files() -> Option<String> {
            for base in &["C:\\Program Files\\Adobe", "C:\\Program Files (x86)\\Adobe"] {
                if let Ok(entries) = std::fs::read_dir(base) {
                    let mut candidates: Vec<String> = entries
                        .flatten()
                        .filter_map(|e| {
                            let name = e.file_name().to_string_lossy().to_string();
                            if name.starts_with("Adobe Photoshop") {
                                let exe = format!("{}\\{}\\Photoshop.exe", base, name);
                                if std::path::Path::new(&exe).exists() {
                                    return Some(exe);
                                }
                            }
                            None
                        })
                        .collect();
                    candidates.sort();
                    if let Some(last) = candidates.pop() {
                        return Some(last);
                    }
                }
            }
            None
        }

        let ps_path = find_photoshop_path()
            .or_else(find_photoshop_in_program_files)
            .ok_or_else(|| "Photoshop을 찾을 수 없습니다. 설치되어 있는지 확인해주세요.".to_string())?;

        let mut cmd = std::process::Command::new(&ps_path);
        for p in &paths {
            cmd.arg(p);
        }
        // GUI 앱 직접 실행 시 CREATE_NO_WINDOW 불필요
        cmd.spawn()
            .map_err(|e| format!("Photoshop 실행 실패: {}", e))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = &paths;
        return Err("이 플랫폼에서는 Photoshop 열기가 지원되지 않습니다".into());
    }

    Ok(())
}

// macOS Quick Look 미리보기 실행 (qlmanage -p <path>)
#[tauri::command]
pub async fn quick_look(path: String) -> Result<(), String> {
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

// ===== 클립보드 =====

// 경로를 클립보드에 복사
#[tauri::command]
pub async fn copy_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    app.clipboard()
        .write_text(path)
        .map_err(|e| format!("경로 복사 실패: {}", e))?;

    Ok(())
}

// ===== 폴더 선택 다이얼로그 =====

// 네이티브 폴더 선택 다이얼로그 열기
#[tauri::command]
pub async fn select_folder(app: tauri::AppHandle) -> Result<Option<FolderSelection>, String> {
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
