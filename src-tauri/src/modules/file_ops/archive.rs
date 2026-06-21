use crate::helpers::percent_decode_utf8;
use crate::modules::error::Result;

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
            zip.start_file(&base_name, options)?;
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
            zip.start_file(&full_name, options)?;
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
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
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
