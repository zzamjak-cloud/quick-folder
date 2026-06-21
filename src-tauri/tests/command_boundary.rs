use app_lib::types::{FileEntry, FileType};
use app_lib::{
    check_duplicate_items, compress_to_zip, create_directory, create_text_file, delete_items,
    duplicate_items, extract_zip, list_directory, read_cached_listing, rename_item,
    write_cached_listing, write_text_file,
};
use std::fs;
use std::path::{Path, PathBuf};

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "quickfolder_command_boundary_{}_{}_{}",
            name,
            std::process::id(),
            now_nanos()
        ));
        fs::create_dir_all(&path).expect("테스트 디렉토리 생성 실패");
        Self { path }
    }

    fn join(&self, child: &str) -> PathBuf {
        self.path.join(child)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("시스템 시간 오류")
        .as_nanos()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[test]
fn file_mutation_commands_create_write_duplicate_and_detect_conflicts() {
    let test_dir = TestDir::new("file_mutation");
    let nested_dir = test_dir.join("nested");
    let source_file = nested_dir.join("note.txt");
    let destination_dir = test_dir.join("dest");

    tauri::async_runtime::block_on(async {
        create_directory(path_string(&nested_dir))
            .await
            .expect("create_directory command 실패");
        create_directory(path_string(&destination_dir))
            .await
            .expect("destination create_directory command 실패");

        create_text_file(path_string(&source_file))
            .await
            .expect("create_text_file command 실패");
        write_text_file(path_string(&source_file), "hello boundary".to_string())
            .await
            .expect("write_text_file command 실패");

        let duplicates = duplicate_items(vec![path_string(&source_file)])
            .await
            .expect("duplicate_items command 실패");

        assert_eq!(duplicates.len(), 1);
        let copied_path = PathBuf::from(&duplicates[0]);
        assert!(copied_path.exists());
        assert_eq!(
            fs::read_to_string(&copied_path).expect("복제 파일 읽기 실패"),
            "hello boundary"
        );

        fs::write(destination_dir.join("note.txt"), "existing").expect("중복 파일 생성 실패");
        let conflicts = check_duplicate_items(
            vec![path_string(&source_file)],
            path_string(&destination_dir),
        )
        .await
        .expect("check_duplicate_items command 실패");

        assert_eq!(conflicts, vec!["note.txt".to_string()]);
    });

    assert!(nested_dir.is_dir());
    assert_eq!(
        fs::read_to_string(source_file).expect("원본 파일 읽기 실패"),
        "hello boundary"
    );
}

#[test]
fn archive_commands_compress_and_extract_files() {
    let test_dir = TestDir::new("archive");
    let source_dir = test_dir.join("source");
    let zip_path = test_dir.join("bundle.zip");
    let extract_dir = test_dir.join("extracted");

    fs::create_dir_all(source_dir.join("child")).expect("소스 디렉토리 생성 실패");
    fs::write(source_dir.join("root.txt"), "root").expect("루트 파일 생성 실패");
    fs::write(source_dir.join("child/nested.txt"), "nested").expect("중첩 파일 생성 실패");

    tauri::async_runtime::block_on(async {
        let output = compress_to_zip(vec![path_string(&source_dir)], path_string(&zip_path))
            .await
            .expect("compress_to_zip command 실패");

        assert_eq!(output, path_string(&zip_path));
        assert!(zip_path.exists());

        let result = extract_zip(path_string(&zip_path), path_string(&extract_dir))
            .await
            .expect("extract_zip command 실패");

        assert_eq!(result.total, 2);
        assert_eq!(result.extracted, 2);
        assert!(result.failed.is_empty());
        assert_eq!(PathBuf::from(result.dest_dir), extract_dir);
    });

    assert_eq!(
        fs::read_to_string(extract_dir.join("source/root.txt"))
            .expect("압축 해제 루트 파일 읽기 실패"),
        "root"
    );
    assert_eq!(
        fs::read_to_string(extract_dir.join("source/child/nested.txt"))
            .expect("압축 해제 중첩 파일 읽기 실패"),
        "nested"
    );
}

#[test]
fn app_handle_commands_list_cache_rename_and_delete_items() {
    let app = tauri::test::mock_app();
    let app_handle = app.handle().clone();
    let test_dir = TestDir::new("app_handle_commands");
    let nested_dir = test_dir.join("folder");
    let source_file = test_dir.join("alpha.txt");
    let hidden_file = test_dir.join(".hidden");

    fs::create_dir_all(&nested_dir).expect("중첩 디렉토리 생성 실패");
    fs::write(&source_file, "alpha").expect("목록 파일 생성 실패");
    fs::write(&hidden_file, "hidden").expect("숨김 파일 생성 실패");

    tauri::async_runtime::block_on(async {
        let entries = list_directory(app_handle.clone(), path_string(&test_dir.path))
            .await
            .expect("list_directory command 실패");
        let names: Vec<String> = entries.iter().map(|entry| entry.name.clone()).collect();

        assert!(names.contains(&"alpha.txt".to_string()));
        assert!(names.contains(&"folder".to_string()));
        assert!(!names.contains(&".hidden".to_string()));

        let cached_entry = FileEntry {
            name: "cached.txt".to_string(),
            path: path_string(&test_dir.join("cached.txt")),
            is_dir: false,
            size: 6,
            modified: 123,
            file_type: FileType::Document,
        };
        write_cached_listing(
            app_handle.clone(),
            path_string(&test_dir.path),
            vec![cached_entry.clone()],
        )
        .await
        .expect("write_cached_listing command 실패");

        let cached = read_cached_listing(app_handle.clone(), path_string(&test_dir.path))
            .await
            .expect("read_cached_listing command 실패")
            .expect("캐시 목록 없음");
        assert_eq!(cached.len(), 1);
        assert_eq!(cached[0].name, cached_entry.name);
        assert_eq!(cached[0].path, cached_entry.path);

        let renamed_file = test_dir.join("renamed.txt");
        rename_item(
            app_handle.clone(),
            path_string(&source_file),
            path_string(&renamed_file),
        )
        .await
        .expect("rename_item command 실패");
        assert!(!source_file.exists());
        assert_eq!(
            fs::read_to_string(&renamed_file).expect("이름 변경 파일 읽기 실패"),
            "alpha"
        );

        delete_items(app_handle.clone(), vec![path_string(&renamed_file)], false)
            .await
            .expect("delete_items command 실패");
        assert!(!renamed_file.exists());
    });

    assert!(nested_dir.is_dir());
}
