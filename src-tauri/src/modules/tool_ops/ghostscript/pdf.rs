use super::path::find_gs_path;
use crate::modules::error::{AppError, Result};

fn format_file_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

pub async fn compress_pdf(input: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let gs = find_gs_path().ok_or_else(|| AppError::ToolNotFound {
            tool: "Ghostscript".to_string(),
        })?;

        // 고화질 압축 (Ghostscript PDFSETTINGS=printer)
        let pdf_settings = "/printer";

        let input_path = std::path::Path::new(&input);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("document");
        let output_path = crate::helpers::find_unique_path(parent, stem, "_compressed", ".pdf");
        let output_str = output_path.to_string_lossy().to_string();

        let mut cmd = std::process::Command::new(&gs);

        // 포터블 GS 사용 시 라이브러리 경로 설정
        if let Some(gs_root) = std::path::Path::new(&gs)
            .parent() // bin/
            .and_then(|p| p.parent())
        // <root>/
        {
            // GS_LIB: Ghostscript 리소스 경로 (초기화 파일 + lib)
            let mut gs_lib_paths: Vec<String> = Vec::new();

            // Windows 포터블: <root>/lib
            let root_lib = gs_root.join("lib");
            if root_lib.exists() {
                gs_lib_paths.push(root_lib.to_string_lossy().to_string());
            }

            // macOS 포터블: share/ghostscript/Resource/Init + share/ghostscript/lib
            let gs_share = gs_root.join("share").join("ghostscript");
            let resource_init = gs_share.join("Resource").join("Init");
            let share_lib = gs_share.join("lib");
            if resource_init.exists() {
                gs_lib_paths.push(resource_init.to_string_lossy().to_string());
            }
            if share_lib.exists() {
                gs_lib_paths.push(share_lib.to_string_lossy().to_string());
            }

            // Homebrew 시스템 설치: share/ghostscript/VERSION/Resource
            if gs_lib_paths.is_empty() {
                if let Ok(entries) = std::fs::read_dir(&gs_share) {
                    for entry in entries.flatten() {
                        let resource = entry.path().join("Resource");
                        if resource.is_dir() && entry.path().join("Resource").join("Init").exists()
                        {
                            gs_lib_paths.push(resource.join("Init").to_string_lossy().to_string());
                            let ver_lib = entry.path().join("lib");
                            if ver_lib.exists() {
                                gs_lib_paths.push(ver_lib.to_string_lossy().to_string());
                            }
                            break;
                        }
                    }
                }
            }

            if !gs_lib_paths.is_empty() {
                let sep = if cfg!(target_os = "windows") {
                    ";"
                } else {
                    ":"
                };
                cmd.env("GS_LIB", gs_lib_paths.join(sep));
            }

            // macOS: 포터블 패키지의 dylib 경로 설정
            #[cfg(target_os = "macos")]
            {
                let dylib_dir = gs_root.join("lib");
                if dylib_dir.exists() {
                    cmd.env("DYLD_LIBRARY_PATH", &dylib_dir);
                }
            }
        }
        cmd.args([
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            &format!("-dPDFSETTINGS={}", pdf_settings),
            "-dNOPAUSE",
            "-dBATCH",
            "-dQUIET",
            &format!("-sOutputFile={}", output_str),
            &input,
        ]);

        // Windows: 콘솔 창 숨기기
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd.output().map_err(|e| AppError::ToolExecution {
            tool: "Ghostscript".to_string(),
            reason: e.to_string(),
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::PdfProcessing(stderr.to_string()));
        }

        // 결과 파일이 원본보다 크면 의미 없음 → 경고 포함하여 반환
        let orig_size = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(0);
        let comp_size = std::fs::metadata(&output_path)
            .map(|m| m.len())
            .unwrap_or(0);

        if comp_size >= orig_size {
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::Cancelled(format!(
                "압축 결과가 원본({})보다 크거나 같아 취소되었습니다.",
                format_file_size(orig_size)
            )));
        }

        Ok(output_str)
    })
    .await
    .map_err(|e| AppError::Internal(format!("PDF 압축 실패: {}", e)))?
}
