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

    let opener = app.opener();

    // 플랫폼별 처리
    #[cfg(target_os = "windows")]
    {
        opener.open_path(&path, None::<&str>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        opener.open_path(&path, None::<&str>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        opener.open_path(&path, None::<&str>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

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
    .plugin({
      let mut updater = tauri_plugin_updater::Builder::new();
      // macOS universal binary용 타겟 설정 (latest.json의 플랫폼 키와 매칭)
      #[cfg(target_os = "macos")]
      {
        updater = updater.target("darwin-universal");
      }
      updater.build()
    })
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
        open_folder,
        copy_path,
        select_folder
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
