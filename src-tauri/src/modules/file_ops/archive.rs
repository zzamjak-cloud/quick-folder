use crate::helpers::percent_decode_utf8;
use crate::modules::error::Result;

// 압축 대상의 유닉스 권한(실행 비트 포함)을 ZIP 항목에 보존한다.
// 보존하지 않으면 해제된 .app 번들의 실행 파일이 0644가 되어 실행할 수 없다.
#[cfg(unix)]
fn zip_options_for(
    path: &std::path::Path,
    options: zip::write::SimpleFileOptions,
) -> zip::write::SimpleFileOptions {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => options.unix_permissions(meta.permissions().mode() & 0o777),
        Err(_) => options,
    }
}

#[cfg(not(unix))]
fn zip_options_for(
    _path: &std::path::Path,
    options: zip::write::SimpleFileOptions,
) -> zip::write::SimpleFileOptions {
    options
}

// ===== ZIP 압축 =====

// ZIP 압축
#[tauri::command]
pub async fn compress_to_zip(paths: Vec<String>, dest: String) -> Result<String> {
    let file = std::fs::File::create(&dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for source in &paths {
        let src = std::path::Path::new(source);
        let base_name = src
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if src.is_dir() {
            add_directory_to_zip(&mut zip, src, &base_name, options)?;
        } else {
            zip.start_file(&base_name, zip_options_for(src, options))?;
            let content = std::fs::read(src)?;
            std::io::Write::write_all(&mut zip, &content)?;
        }
    }

    zip.finish()?;
    Ok(dest)
}

fn add_directory_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<()> {
    zip.add_directory(format!("{}/", prefix), options)?;
    for entry in std::fs::read_dir(dir)?.flatten() {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let full_name = format!("{}/{}", prefix, entry_name);
        if entry.path().is_dir() {
            add_directory_to_zip(zip, &entry.path(), &full_name, options)?;
        } else {
            zip.start_file(&full_name, zip_options_for(&entry.path(), options))?;
            let content = std::fs::read(entry.path())?;
            std::io::Write::write_all(zip, &content)?;
        }
    }
    Ok(())
}

// ZIP 압축 풀기
// zip_path: 압축 파일 경로, dest_dir: 출력 디렉토리 경로
fn zip_entry_output_path(entry: &zip::read::ZipFile<'_>) -> std::path::PathBuf {
    let raw_path = entry
        .enclosed_name()
        .unwrap_or_else(|| entry.mangled_name());
    let mut output_path = std::path::PathBuf::new();

    for component in raw_path.components() {
        if let std::path::Component::Normal(part) = component {
            output_path.push(sanitize_zip_entry_component(&part.to_string_lossy()));
        }
    }

    output_path
}

fn sanitize_zip_entry_component(component: &str) -> String {
    let decoded = percent_decode_utf8(component);
    let mut safe = String::with_capacity(decoded.len());

    for ch in decoded.chars() {
        match ch {
            // ZIP 항목명 안에서 디코딩된 구분자는 새 경로로 해석하지 않는다.
            '/' | '\\' => safe.push('_'),
            // Windows 에서 파일명에 쓸 수 없는 예약 문자 (macOS/Linux 에서 만든 ZIP 대응)
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => safe.push('_'),
            // 제어 문자(NUL 포함)는 제거
            c if (c as u32) < 0x20 => {}
            _ => safe.push(ch),
        }
    }

    // Windows 는 경로 컴포넌트 끝의 공백·점을 파일/폴더 생성 시 자동으로 잘라낸다.
    // 그 결과 폴더는 잘린 이름으로 만들어지지만, 같은 컴포넌트가 하위 파일 경로의
    // "중간 요소"로 쓰일 때는 잘리지 않아 디렉토리를 찾지 못하고 ERROR_PATH_NOT_FOUND
    // (os error 3)가 발생한다. 미리 잘라 양쪽을 일치시킨다. (예: Notion 내보내기에서
    // 페이지 제목이 공백으로 끝나는 폴더)
    let trimmed = safe.trim_end_matches([' ', '.']);
    let mut result = if trimmed.is_empty() {
        safe.clone()
    } else {
        trimmed.to_string()
    };

    // Windows 예약 장치 이름(CON, PRN, NUL, COM1~9, LPT1~9 등) 회피
    if is_windows_reserved_name(&result) {
        result.insert(0, '_');
    }

    if result.is_empty() || result == "." || result == ".." {
        component.replace(['/', '\\'], "_")
    } else {
        result
    }
}

// Windows 예약 장치 이름 여부 판정 (확장자 제외, 대소문자 무관)
fn is_windows_reserved_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

// 개별 항목 압축 해제 실패 정보 (프론트엔드에 부분 실패를 알리기 위함)
#[derive(Debug, serde::Serialize)]
pub struct ExtractFailure {
    pub name: String,
    pub reason: String,
}

// 압축 해제 결과 요약
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub dest_dir: String,
    pub total: usize,     // 시도한 파일 수 (디렉토리 제외)
    pub extracted: usize, // 성공한 파일 수
    pub failed: Vec<ExtractFailure>,
}

// ZIP 항목의 유닉스 권한을 복원한다. 실행 비트가 없으면 .app 번들·스크립트가 실행되지 않는다.
#[cfg(unix)]
pub(crate) fn restore_unix_mode(path: &std::path::Path, mode: Option<u32>) {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = mode {
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode & 0o777));
    }
}

// 심볼릭 링크 항목은 링크 대상 문자열이 본문에 들어 있다. 일반 파일로 풀면
// 프레임워크를 포함한 .app 번들이 깨지므로 링크로 복원한다.
// 대상이 절대경로거나 `..`를 포함하면 해제 폴더 밖을 가리킬 수 있어 건너뛴다.
#[cfg(unix)]
pub(crate) fn restore_symlink<R: std::io::Read>(
    entry: &mut R,
    out_path: &std::path::Path,
) -> std::io::Result<()> {
    let mut target = String::new();
    entry.read_to_string(&mut target)?;
    let target = target.trim_end_matches('\0');
    if target.is_empty()
        || target.starts_with('/')
        || target.split('/').any(|part| part == "..")
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "안전하지 않은 심볼릭 링크 대상",
        ));
    }
    let _ = std::fs::remove_file(out_path);
    std::os::unix::fs::symlink(target, out_path)
}

#[tauri::command]
pub async fn extract_zip(zip_path: String, dest_dir: String) -> Result<ExtractResult> {
    let file = std::fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let dest = std::path::Path::new(&dest_dir);
    std::fs::create_dir_all(dest)?;

    let mut total = 0usize;
    let mut extracted = 0usize;
    let mut failed: Vec<ExtractFailure> = Vec::new();

    for i in 0..archive.len() {
        // 단일 항목이 깨졌더라도 나머지 항목 해제는 계속 진행한다.
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => {
                failed.push(ExtractFailure {
                    name: format!("#{}", i),
                    reason: e.to_string(),
                });
                continue;
            }
        };

        let relative_path = zip_entry_output_path(&entry);
        if relative_path.as_os_str().is_empty() {
            continue;
        }
        let out_path = dest.join(&relative_path);
        let entry_name = entry.name().to_string();

        if entry.is_dir() {
            // 디렉토리 생성 실패는 그 자체로 기록하되 파일 카운트에는 넣지 않는다.
            if let Err(e) = std::fs::create_dir_all(&out_path) {
                failed.push(ExtractFailure {
                    name: entry_name,
                    reason: e.to_string(),
                });
            }
            continue;
        }

        total += 1;
        // 파일 하나의 해제를 클로저로 감싸 ? 로 조기 반환해도 루프는 멈추지 않게 한다.
        let result: std::io::Result<()> = (|| {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                if mode & 0xF000 == 0xA000 {
                    return restore_symlink(&mut entry, &out_path);
                }
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
            #[cfg(unix)]
            restore_unix_mode(&out_path, entry.unix_mode());
            Ok(())
        })();

        match result {
            Ok(()) => extracted += 1,
            Err(e) => failed.push(ExtractFailure {
                name: entry_name,
                reason: e.to_string(),
            }),
        }
    }

    Ok(ExtractResult {
        dest_dir,
        total,
        extracted,
        failed,
    })
}

// .app 번들 실행 비트 유실 회귀 방지 — 압축 → 해제 왕복에서 권한이 유지돼야 한다
#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    fn test_dir(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("quickfolder_zip_mode_{}", name));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn extract_zip_restores_executable_bit_and_symlink() {
        let root = test_dir("extract");
        let zip_path = root.join("bundle.zip");

        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let base = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            zip.start_file("App.app/Contents/MacOS/App", base.unix_permissions(0o755))
                .unwrap();
            zip.write_all(b"#!/bin/sh\n").unwrap();

            zip.start_file("App.app/Contents/Info.plist", base.unix_permissions(0o644))
                .unwrap();
            zip.write_all(b"plist").unwrap();

            // 심볼릭 링크 항목 (본문이 링크 대상 경로)
            zip.add_symlink("App.app/Contents/Current", "MacOS/App", base)
                .unwrap();

            zip.finish().unwrap();
        }

        let dest = root.join("out");
        let result = tauri::async_runtime::block_on(extract_zip(
            zip_path.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        ))
        .unwrap();
        assert!(result.failed.is_empty(), "해제 실패 항목: {:?}", result.failed);

        let exe = dest.join("App.app/Contents/MacOS/App");
        let mode = std::fs::metadata(&exe).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o755);

        let plist = dest.join("App.app/Contents/Info.plist");
        let plist_mode = std::fs::metadata(&plist).unwrap().permissions().mode() & 0o777;
        assert_eq!(plist_mode, 0o644);

        let link = dest.join("App.app/Contents/Current");
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn compress_to_zip_keeps_executable_bit() {
        let root = test_dir("compress");
        let src = root.join("run.sh");
        std::fs::write(&src, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&src, std::fs::Permissions::from_mode(0o755)).unwrap();

        let zip_path = root.join("out.zip");
        tauri::async_runtime::block_on(compress_to_zip(
            vec![src.to_string_lossy().to_string()],
            zip_path.to_string_lossy().to_string(),
        ))
        .unwrap();

        let file = std::fs::File::open(&zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let entry = archive.by_name("run.sh").unwrap();
        assert_eq!(entry.unix_mode().unwrap() & 0o777, 0o755);

        let _ = std::fs::remove_dir_all(&root);
    }
}
