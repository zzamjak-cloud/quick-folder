//! 압축 파일 가상 탐색/선택 추출 모듈
//!
//! 실제 파일시스템에 풀지 않고 압축 파일 내부를 "폴더처럼" 탐색하기 위한
//! 공통 헬퍼와 Tauri command를 제공합니다.

mod extract;
mod listing;
mod materialize;
mod path;
mod records;

pub use listing::list_archive_directory;
pub use materialize::{materialize_archive_path_in_cache, materialize_archive_paths};
pub use path::{
    build_archive_root_virtual_path, is_browsable_archive_path,
    resolve_archive_virtual_path_with_app,
};

#[cfg(test)]
use extract::{decode_archive_tool_output, extract_archive_patterns_to_dir};
#[cfg(test)]
use listing::list_archive_directory_resolved;
#[cfg(test)]
use path::{resolve_archive_virtual_path, resolve_archive_virtual_path_with_loader};
use std::path::PathBuf;

const BROWSABLE_ARCHIVE_SUFFIXES: &[&str] = &[
    ".zip", ".rar", ".7z", ".tar", ".tgz", ".tar.gz", ".tbz2", ".tar.bz2", ".txz", ".tar.xz",
];

#[derive(Debug, Clone)]
pub struct ArchiveVirtualPath {
    pub archive_path: PathBuf,
    pub logical_archive_path: String,
    pub inner_path: Option<String>,
    pub separator: char,
}

#[derive(Debug)]
pub(super) struct ArchiveEntryRecord {
    normalized_path: String,
    is_dir: bool,
    size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Seek, Write};
    use std::path::{Path, PathBuf};

    fn setup_test_dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("quickfolder_archive_test_{}", name));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn cleanup_test_dir(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    fn create_test_zip(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.add_directory("folder/", options).unwrap();
        zip.start_file("folder/file.txt", options).unwrap();
        zip.write_all(b"archive entry").unwrap();
        zip.start_file("root.txt", options).unwrap();
        zip.write_all(b"root entry").unwrap();
        zip.finish().unwrap();
    }

    fn create_cp949_named_zip(path: &Path) {
        let mut file = fs::File::create(path).unwrap();
        let name = [0xc6, 0xfa, 0xb4, 0xf5, b'/'];
        let mut central = Vec::new();

        file.write_all(&0x04034b50u32.to_le_bytes()).unwrap();
        file.write_all(&20u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&(name.len() as u16).to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&name).unwrap();

        let central_offset = file.stream_position().unwrap();
        central.extend_from_slice(&0x02014b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0x10u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&name);
        file.write_all(&central).unwrap();

        file.write_all(&0x06054b50u32.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&1u16.to_le_bytes()).unwrap();
        file.write_all(&1u16.to_le_bytes()).unwrap();
        file.write_all(&(central.len() as u32).to_le_bytes())
            .unwrap();
        file.write_all(&(central_offset as u32).to_le_bytes())
            .unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
    }

    fn create_percent_encoded_zip(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file(
            "%EB%A8%B8%EC%A7%80%EB%A8%B8%EC%A7%80_%ED%83%80%EC%9D%B4%ED%8B%80_en_black.png",
            options,
        )
        .unwrap();
        zip.write_all(b"encoded entry").unwrap();
        zip.finish().unwrap();
    }

    fn create_cp949_file_zip(path: &Path) {
        fn write_stored_entry(
            file: &mut fs::File,
            central: &mut Vec<u8>,
            name: &[u8],
            external_attrs: u32,
        ) {
            let local_offset = file.stream_position().unwrap();
            file.write_all(&0x04034b50u32.to_le_bytes()).unwrap();
            file.write_all(&20u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&(name.len() as u16).to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(name).unwrap();

            central.extend_from_slice(&0x02014b50u32.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&(name.len() as u16).to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&external_attrs.to_le_bytes());
            central.extend_from_slice(&(local_offset as u32).to_le_bytes());
            central.extend_from_slice(name);
        }

        let mut file = fs::File::create(path).unwrap();
        let mut central = Vec::new();
        write_stored_entry(
            &mut file,
            &mut central,
            &[0xc6, 0xfa, 0xb4, 0xf5, b'/'],
            0x10,
        );
        write_stored_entry(
            &mut file,
            &mut central,
            &[
                0xc6, 0xfa, 0xb4, 0xf5, b'/', 0xc0, 0xcc, 0xb9, 0xcc, 0xc1, 0xf6, b'.', b'p', b'n',
                b'g',
            ],
            0,
        );

        let central_offset = file.stream_position().unwrap();
        file.write_all(&central).unwrap();
        file.write_all(&0x06054b50u32.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&2u16.to_le_bytes()).unwrap();
        file.write_all(&2u16.to_le_bytes()).unwrap();
        file.write_all(&(central.len() as u32).to_le_bytes())
            .unwrap();
        file.write_all(&(central_offset as u32).to_le_bytes())
            .unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
    }

    #[test]
    fn test_resolve_archive_virtual_path_root_and_child() {
        let test_dir = setup_test_dir("resolve_virtual");
        let archive = test_dir.join("sample.zip");
        fs::write(&archive, b"placeholder").unwrap();

        let root = resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        assert_eq!(root.archive_path, archive);
        assert_eq!(root.logical_archive_path, archive.display().to_string());
        assert_eq!(root.inner_path, None);

        let child =
            resolve_archive_virtual_path(&format!("{}\\folder\\file.txt", archive.display()))
                .unwrap();
        assert_eq!(child.inner_path.as_deref(), Some("folder/file.txt"));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_archive_directory_for_zip_root_and_child() {
        let test_dir = setup_test_dir("list_zip");
        let archive = test_dir.join("sample.zip");
        create_test_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert_eq!(root_entries.len(), 2);
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "folder" && entry.is_dir));
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "root.txt" && !entry.is_dir && entry.size > 0));

        let child_resolved =
            resolve_archive_virtual_path(&format!("{}\\folder", archive.display())).unwrap();
        let child_entries = list_archive_directory_resolved(&child_resolved).unwrap();
        assert_eq!(child_entries.len(), 1);
        assert_eq!(child_entries[0].name, "file.txt");
        assert!(!child_entries[0].is_dir);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_zip_cp949_directory_name() {
        let test_dir = setup_test_dir("list_zip_cp949");
        let archive = test_dir.join("cp949.zip");
        create_cp949_named_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "\u{d3f4}\u{b354}" && entry.is_dir));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_zip_percent_encoded_file_name() {
        let test_dir = setup_test_dir("list_zip_percent_encoded");
        let archive = test_dir.join("percent_encoded.zip");
        create_percent_encoded_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert!(root_entries
            .iter()
            .any(|entry| { entry.name == "머지머지_타이틀_en_black.png" && !entry.is_dir }));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_extract_zip_percent_encoded_file_by_decoded_path() {
        let test_dir = setup_test_dir("extract_zip_percent_encoded");
        let archive = test_dir.join("percent_encoded.zip");
        let dest = test_dir.join("out");
        create_percent_encoded_zip(&archive);

        extract_archive_patterns_to_dir(
            &archive,
            &[String::from("머지머지_타이틀_en_black.png")],
            &dest,
        )
        .unwrap();

        assert!(dest.join("머지머지_타이틀_en_black.png").exists());

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_decode_archive_tool_output_cp949() {
        let decoded = decode_archive_tool_output(&[0xc6, 0xfa, 0xb4, 0xf5, b'\n']);
        assert_eq!(decoded.trim(), "\u{d3f4}\u{b354}");
    }

    #[test]
    fn test_extract_zip_cp949_file_by_decoded_path() {
        let test_dir = setup_test_dir("extract_zip_cp949");
        let archive = test_dir.join("cp949.zip");
        let dest = test_dir.join("out");
        create_cp949_file_zip(&archive);

        extract_archive_patterns_to_dir(
            &archive,
            &[String::from(
                "\u{d3f4}\u{b354}/\u{c774}\u{bbf8}\u{c9c0}.png",
            )],
            &dest,
        )
        .unwrap();

        assert!(dest
            .join("\u{d3f4}\u{b354}")
            .join("\u{c774}\u{bbf8}\u{c9c0}.png")
            .exists());

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_resolve_nested_archive_virtual_path_with_loader() {
        let test_dir = setup_test_dir("resolve_nested_virtual");
        let outer_archive = test_dir.join("outer.zip");
        let materialized_inner_archive = test_dir.join("materialized").join("inner.7z");
        fs::write(&outer_archive, b"outer").unwrap();
        fs::create_dir_all(materialized_inner_archive.parent().unwrap()).unwrap();
        fs::write(&materialized_inner_archive, b"inner").unwrap();

        let nested_archive_path = format!("{}\\inner.7z", outer_archive.display());
        let nested_entry_path = format!("{}\\docs\\file.txt", nested_archive_path);
        let resolved = resolve_archive_virtual_path_with_loader(&nested_entry_path, |prefix| {
            if prefix == nested_archive_path {
                Ok(Some(materialized_inner_archive.clone()))
            } else {
                Ok(None)
            }
        })
        .unwrap()
        .unwrap();

        assert_eq!(resolved.archive_path, materialized_inner_archive);
        assert_eq!(resolved.logical_archive_path, nested_archive_path);
        assert_eq!(resolved.inner_path.as_deref(), Some("docs/file.txt"));

        cleanup_test_dir(&test_dir);
    }
}
