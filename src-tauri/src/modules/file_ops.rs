//! 파일 및 디렉토리 조작 모듈
//! 파일 조회, 캐시, 변경, 전송, 압축 command를 하위 모듈로 분리한다.

mod archive;
mod cache;
mod listing;
mod mutation;
mod transfer;

pub use archive::*;
pub use cache::*;
pub use listing::*;
pub use mutation::*;
pub use transfer::*;

#[cfg(test)]
use crate::modules::error::AppError;
#[cfg(test)]
use mutation::{delete_items_impl, is_cloud_path, read_text_file_impl, rename_item_impl};
#[cfg(test)]
use transfer::{
    copy_items_impl, count_files_to_copy, merge_folders_recursive, move_items_impl,
    FolderMergeConflictMode,
};

// ===== 테스트 =====

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_test_dir(name: &str) -> std::path::PathBuf {
        let temp = std::env::temp_dir();
        let test_dir = temp.join(format!("file_ops_test_{}", name));
        let _ = fs::remove_dir_all(&test_dir); // 기존 테스트 디렉토리 제거
        fs::create_dir_all(&test_dir).unwrap();
        test_dir
    }

    fn cleanup_test_dir(path: &std::path::Path) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn test_is_directory() {
        let test_dir = setup_test_dir("is_directory");
        let file_path = test_dir.join("test.txt");
        fs::write(&file_path, "test").unwrap();

        assert_eq!(is_directory(test_dir.to_string_lossy().to_string()), true);
        assert_eq!(is_directory(file_path.to_string_lossy().to_string()), false);
        assert_eq!(is_directory("/nonexistent/path".to_string()), false);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_is_cloud_path() {
        assert_eq!(
            is_cloud_path("/Users/test/Library/CloudStorage/GoogleDrive/file.txt"),
            true
        );
        assert_eq!(
            is_cloud_path("/Users/test/Library/Mobile Documents/com~apple~CloudDocs/file.txt"),
            true
        );
        assert_eq!(is_cloud_path("/Users/test/Google Drive/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/OneDrive/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Dropbox/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Documents/file.txt"), false);
    }

    #[test]
    fn test_create_directory() {
        let test_dir = setup_test_dir("create_directory");
        let new_dir = test_dir.join("new_folder");

        tauri::async_runtime::block_on(async {
            let result = create_directory(new_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(new_dir.exists());
            assert!(new_dir.is_dir());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_create_text_file() {
        let test_dir = setup_test_dir("create_text_file");
        let file_path = test_dir.join("new_file.txt");

        tauri::async_runtime::block_on(async {
            // 새 파일 생성
            let result = create_text_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(file_path.exists());
            assert!(file_path.is_file());

            // 이미 존재하는 파일 — AlreadyExists 에러
            let result2 = create_text_file(file_path.to_string_lossy().to_string()).await;
            assert!(result2.is_err());
            assert!(matches!(result2.unwrap_err(), AppError::AlreadyExists(_)));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_read_text_file() {
        let test_dir = setup_test_dir("read_text_file");
        let file_path = test_dir.join("test.txt");
        let content = "Hello, World! 안녕하세요!";
        fs::write(&file_path, content).unwrap();

        // 전체 읽기
        let result = read_text_file_impl(&file_path, 1000);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), content);

        // 부분 읽기 (최대 10바이트)
        let result2 = read_text_file_impl(&file_path, 10);
        assert!(result2.is_ok());
        assert_eq!(result2.unwrap().len(), 10);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_write_text_file() {
        let test_dir = setup_test_dir("write_text_file");
        let file_path = test_dir.join("output.txt");
        let content = "Test content\nLine 2\n한글 테스트";

        tauri::async_runtime::block_on(async {
            let result =
                write_text_file(file_path.to_string_lossy().to_string(), content.to_string()).await;
            assert!(result.is_ok());

            let read_content = fs::read_to_string(&file_path).unwrap();
            assert_eq!(read_content, content);
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_rename_item() {
        let test_dir = setup_test_dir("rename_item");
        let old_path = test_dir.join("old.txt");
        let new_path = test_dir.join("new.txt");
        fs::write(&old_path, "test").unwrap();

        tauri::async_runtime::block_on(async {
            // 정상 이름 변경
            let result = rename_item_impl(
                old_path.to_string_lossy().to_string(),
                new_path.to_string_lossy().to_string(),
                None,
            )
            .await;
            assert!(result.is_ok());
            assert!(!old_path.exists());
            assert!(new_path.exists());

            // 이미 존재하는 이름으로 변경 시도 — AlreadyExists 에러
            let another = test_dir.join("another.txt");
            fs::write(&another, "test2").unwrap();
            let result2 = rename_item_impl(
                another.to_string_lossy().to_string(),
                new_path.to_string_lossy().to_string(),
                None,
            )
            .await;
            assert!(result2.is_err());
            assert!(matches!(result2.unwrap_err(), AppError::AlreadyExists(_)));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_copy_dir_recursive() {
        let test_dir = setup_test_dir("copy_dir_recursive");
        let src_dir = test_dir.join("source");
        let dest_dir = test_dir.join("destination");

        // 소스 디렉토리 구조 생성
        fs::create_dir_all(src_dir.join("subdir")).unwrap();
        fs::write(src_dir.join("file1.txt"), "content1").unwrap();
        fs::write(src_dir.join("subdir/file2.txt"), "content2").unwrap();

        // 재귀 복사
        let result = copy_dir_recursive(&src_dir, &dest_dir);
        assert!(result.is_ok());
        assert!(dest_dir.exists());
        assert!(dest_dir.join("file1.txt").exists());
        assert!(dest_dir.join("subdir").exists());
        assert!(dest_dir.join("subdir/file2.txt").exists());

        let content = fs::read_to_string(dest_dir.join("subdir/file2.txt")).unwrap();
        assert_eq!(content, "content2");

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_duplicate_items() {
        let test_dir = setup_test_dir("duplicate_items");
        let file1 = test_dir.join("original.txt");
        fs::write(&file1, "content").unwrap();

        tauri::async_runtime::block_on(async {
            // 복제
            let result = duplicate_items(vec![file1.to_string_lossy().to_string()]).await;
            assert!(result.is_ok());

            let new_paths = result.unwrap();
            assert_eq!(new_paths.len(), 1);
            assert!(new_paths[0].contains("(복사)"));

            let duplicated = std::path::Path::new(&new_paths[0]);
            assert!(duplicated.exists());
            assert_eq!(fs::read_to_string(duplicated).unwrap(), "content");

            // 두 번째 복제 — "(복사 2)" 접미사
            let result2 = duplicate_items(vec![file1.to_string_lossy().to_string()]).await;
            assert!(result2.is_ok());
            let new_paths2 = result2.unwrap();
            assert!(new_paths2[0].contains("(복사 2)"));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_copy_items() {
        let test_dir = setup_test_dir("copy_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();

        tauri::async_runtime::block_on(async {
            // 복사
            let result = copy_items_impl(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
                None,
                None,
            )
            .await;
            assert!(result.is_ok());
            assert!(dest.join("file1.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_move_items() {
        let test_dir = setup_test_dir("move_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();

        tauri::async_runtime::block_on(async {
            // 이동
            let result = move_items_impl(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
                None,
                None,
            )
            .await;
            assert!(result.is_ok());
            assert!(!file1.exists()); // 원본 삭제됨
            assert!(dest.join("file1.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_check_duplicate_items() {
        let test_dir = setup_test_dir("check_duplicate_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();
        fs::write(dest.join("file1.txt"), "existing").unwrap();

        tauri::async_runtime::block_on(async {
            let result = check_duplicate_items(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());
            let duplicates = result.unwrap();
            assert_eq!(duplicates.len(), 1);
            assert_eq!(duplicates[0], "file1.txt");
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_folder_merge_skip_conflicts() {
        let test_dir = setup_test_dir("folder_merge_skip");
        let src_folder = test_dir.join("src").join("Project");
        let dest_folder = test_dir.join("dest").join("Project");
        fs::create_dir_all(src_folder.join("sub")).unwrap();
        fs::create_dir_all(dest_folder.join("sub")).unwrap();
        fs::write(src_folder.join("only_src.txt"), "from source").unwrap();
        fs::write(src_folder.join("conflict.txt"), "source version").unwrap();
        fs::write(src_folder.join("sub/nested.txt"), "nested source").unwrap();
        fs::write(dest_folder.join("only_dest.txt"), "from dest").unwrap();
        fs::write(dest_folder.join("conflict.txt"), "dest version").unwrap();

        tauri::async_runtime::block_on(async {
            let analysis = analyze_folder_merge(
                src_folder.to_string_lossy().to_string(),
                test_dir.join("dest").to_string_lossy().to_string(),
            )
            .await
            .unwrap();
            assert_eq!(analysis.conflicts.len(), 1);
            assert_eq!(analysis.conflicts[0].relative_path, "conflict.txt");
            assert!(analysis.only_source.contains(&"only_src.txt".to_string()));
            assert!(analysis.only_source.contains(&"sub/nested.txt".to_string()));
            assert!(analysis.only_dest.contains(&"only_dest.txt".to_string()));

            // spawn_blocking 내부에서 app handle 없이 직접 병합
            merge_folders_recursive(
                &src_folder,
                &dest_folder,
                FolderMergeConflictMode::Skip,
                None,
            )
            .unwrap();
        });

        assert_eq!(
            fs::read_to_string(dest_folder.join("conflict.txt")).unwrap(),
            "dest version"
        );
        assert_eq!(
            fs::read_to_string(dest_folder.join("only_src.txt")).unwrap(),
            "from source"
        );
        assert_eq!(
            fs::read_to_string(dest_folder.join("sub/nested.txt")).unwrap(),
            "nested source"
        );
        assert_eq!(
            fs::read_to_string(dest_folder.join("only_dest.txt")).unwrap(),
            "from dest"
        );

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_compress_and_extract_zip() {
        let test_dir = setup_test_dir("zip");
        let src_dir = test_dir.join("source");
        let zip_path = test_dir.join("archive.zip");
        let extract_dir = test_dir.join("extracted");

        // 소스 파일 생성
        fs::create_dir_all(src_dir.join("subdir")).unwrap();
        fs::write(src_dir.join("file1.txt"), "content1").unwrap();
        fs::write(src_dir.join("subdir/file2.txt"), "content2").unwrap();

        tauri::async_runtime::block_on(async {
            // 압축
            let result = compress_to_zip(
                vec![src_dir.to_string_lossy().to_string()],
                zip_path.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());
            assert!(zip_path.exists());

            // 압축 해제
            let result2 = extract_zip(
                zip_path.to_string_lossy().to_string(),
                extract_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result2.is_ok());
            assert!(extract_dir.join("source/file1.txt").exists());
            assert!(extract_dir.join("source/subdir/file2.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_extract_zip_with_long_nested_paths() {
        let test_dir = setup_test_dir("zip_long_path");
        let zip_path = test_dir.join("long_paths.zip");
        let extract_dir = test_dir.join("extracted");

        let nested_path = (0..10)
            .map(|i| format!("notion_export_section_{:02}_with_verbose_title", i))
            .collect::<Vec<_>>()
            .join("/");
        let entry_name = format!("{}/document.txt", nested_path);
        let expected_path =
            extract_dir.join(entry_name.replace('/', std::path::MAIN_SEPARATOR_STR));
        assert!(
            expected_path.to_string_lossy().chars().count() > 260,
            "테스트 경로가 Windows 기본 한계보다 길어야 합니다: {}",
            expected_path.display()
        );

        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            zip.start_file(&entry_name, options).unwrap();
            std::io::Write::write_all(&mut zip, b"long path content").unwrap();
            zip.finish().unwrap();
        }

        tauri::async_runtime::block_on(async {
            let result = extract_zip(
                zip_path.to_string_lossy().to_string(),
                extract_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok(), "긴 경로 ZIP 해제 실패: {:?}", result.err());
            assert!(expected_path.exists());
            assert_eq!(
                fs::read_to_string(expected_path).unwrap(),
                "long path content"
            );
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_extract_zip_decodes_percent_encoded_utf8_names() {
        let test_dir = setup_test_dir("zip_percent_encoded");
        let zip_path = test_dir.join("percent_encoded.zip");
        let extract_dir = test_dir.join("extracted");
        let encoded_name =
            "%EB%A8%B8%EC%A7%80%EB%A8%B8%EC%A7%80_%ED%83%80%EC%9D%B4%ED%8B%80_en_black.png";
        let decoded_name = "머지머지_타이틀_en_black.png";

        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            zip.start_file(format!("assets/{}", encoded_name), options)
                .unwrap();
            std::io::Write::write_all(&mut zip, b"image bytes").unwrap();
            zip.finish().unwrap();
        }

        tauri::async_runtime::block_on(async {
            let result = extract_zip(
                zip_path.to_string_lossy().to_string(),
                extract_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(
                result.is_ok(),
                "percent-encoded 파일명 ZIP 해제 실패: {:?}",
                result.err()
            );
            assert!(extract_dir.join("assets").join(decoded_name).exists());
            assert!(!extract_dir.join("assets").join(encoded_name).exists());
        });

        cleanup_test_dir(&test_dir);
    }

    // 회귀 방지: 폴더명이 공백/점으로 끝나는 ZIP(예: Notion 내보내기에서 제목이 잘린 경우)
    // Windows 에서 중간 경로 컴포넌트의 끝 공백 때문에 ERROR_PATH_NOT_FOUND 가 나
    // 일부 파일만 풀리고 나머지가 실패하던 문제를 막는다.
    #[test]
    fn test_extract_zip_handles_trailing_space_and_dot_dirs() {
        let test_dir = setup_test_dir("zip_trailing_space");
        let zip_path = test_dir.join("trailing.zip");
        let extract_dir = test_dir.join("extracted");

        // 폴더명 끝에 공백("LTV for ")과 점("section.")을 둔 항목 구성
        let entries = [
            ("How to calculate LTV for /a.png", b"aaa".as_slice()),
            ("How to calculate LTV for /b.png", b"bbb".as_slice()),
            ("report section./c.txt", b"ccc".as_slice()),
        ];

        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (name, content) in entries {
                zip.start_file(name, options).unwrap();
                std::io::Write::write_all(&mut zip, content).unwrap();
            }
            zip.finish().unwrap();
        }

        tauri::async_runtime::block_on(async {
            let result = extract_zip(
                zip_path.to_string_lossy().to_string(),
                extract_dir.to_string_lossy().to_string(),
            )
            .await
            .expect("압축 해제 자체는 성공해야 함");

            assert!(
                result.failed.is_empty(),
                "끝 공백/점 폴더는 모두 해제되어야 함: {:?}",
                result.failed
            );
            assert_eq!(result.extracted, 3);
            // 끝 공백이 제거된 폴더명으로 파일이 존재해야 함
            assert!(extract_dir
                .join("How to calculate LTV for")
                .join("a.png")
                .exists());
            assert!(extract_dir
                .join("How to calculate LTV for")
                .join("b.png")
                .exists());
            assert!(extract_dir.join("report section").join("c.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_calculate_folder_size_counts_nested_files() {
        let test_dir = setup_test_dir("folder_size");
        let nested_dir = test_dir.join("nested");
        let empty_dir = test_dir.join("empty");
        fs::create_dir_all(&nested_dir).unwrap();
        fs::create_dir_all(&empty_dir).unwrap();
        fs::write(test_dir.join("root.txt"), b"12345").unwrap();
        fs::write(nested_dir.join("child.bin"), b"1234567").unwrap();

        let info = tauri::async_runtime::block_on(calculate_folder_size(
            test_dir.to_string_lossy().to_string(),
        ))
        .unwrap();
        assert_eq!(info.bytes, "12");
        assert_eq!(info.file_count, 2);
        assert_eq!(info.folder_count, 2);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_calculate_folder_size_returns_direct_children_sorted_by_size() {
        let test_dir = setup_test_dir("folder_size_children");
        let cache_dir = test_dir.join("cache");
        let assets_dir = test_dir.join("assets");
        let empty_dir = test_dir.join("empty");
        fs::create_dir_all(&cache_dir).unwrap();
        fs::create_dir_all(&assets_dir).unwrap();
        fs::create_dir_all(&empty_dir).unwrap();
        fs::write(cache_dir.join("a.bin"), vec![0u8; 20]).unwrap();
        fs::write(cache_dir.join("b.bin"), vec![0u8; 15]).unwrap();
        fs::write(assets_dir.join("image.png"), vec![0u8; 6]).unwrap();
        fs::write(test_dir.join("root.log"), vec![0u8; 12]).unwrap();

        let info = tauri::async_runtime::block_on(calculate_folder_size(
            test_dir.to_string_lossy().to_string(),
        ))
        .unwrap();

        assert_eq!(info.bytes, "53");
        assert_eq!(info.children.len(), 4);
        assert_eq!(info.children[0].name, "cache");
        assert_eq!(info.children[0].bytes, "35");
        assert!(info.children[0].is_dir);
        assert_eq!(info.children[1].name, "root.log");
        assert_eq!(info.children[1].bytes, "12");
        assert!(!info.children[1].is_dir);
        assert_eq!(info.children[2].name, "assets");
        assert_eq!(info.children[2].bytes, "6");
        assert_eq!(info.children[3].name, "empty");
        assert_eq!(info.children[3].bytes, "0");

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_calculate_folder_size_rejects_file_path() {
        let test_dir = setup_test_dir("folder_size_reject_file");
        let file_path = test_dir.join("file.txt");
        fs::write(&file_path, b"content").unwrap();

        let result = tauri::async_runtime::block_on(calculate_folder_size(
            file_path.to_string_lossy().to_string(),
        ));
        assert!(matches!(result, Err(AppError::InvalidInput(_))));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_delete_items_direct() {
        let test_dir = setup_test_dir("delete_items");
        let file1 = test_dir.join("file1.txt");
        fs::write(&file1, "content").unwrap();

        tauri::async_runtime::block_on(async {
            // 직접 삭제 (use_trash = false)
            let result =
                delete_items_impl(vec![file1.to_string_lossy().to_string()], false, None).await;
            assert!(result.is_ok());
            assert!(!file1.exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_count_files_to_copy() {
        let test_dir = setup_test_dir("count_files");
        let dir = test_dir.join("dir");
        fs::create_dir_all(dir.join("subdir")).unwrap();
        fs::write(dir.join("file1.txt"), "").unwrap();
        fs::write(dir.join("file2.txt"), "").unwrap();
        fs::write(dir.join("subdir/file3.txt"), "").unwrap();

        let count = count_files_to_copy(&dir).unwrap();
        assert_eq!(count, 3);

        let file_path = test_dir.join("single.txt");
        fs::write(&file_path, "").unwrap();
        let count2 = count_files_to_copy(&file_path).unwrap();
        assert_eq!(count2, 1);

        cleanup_test_dir(&test_dir);
    }
}
