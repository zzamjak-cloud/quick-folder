# 압축파일 탐색

## 역할
압축을 풀지 않고 `FileExplorer` 안에서 일반 폴더처럼 탐색한다. 현재 브라우징 대상은 아래 확장자다.

- `.zip`
- `.rar`
- `.7z`
- `.tar`
- `.tgz`
- `.tar.gz`
- `.tbz2`
- `.tar.bz2`
- `.txz`
- `.tar.xz`

## 관련 코드
- `components/FileExplorer/index.tsx`
- `components/FileExplorer/hooks/useInternalDragDrop.ts`
- `components/FileExplorer/hooks/usePreviewRouting.ts`
- `components/FileExplorer/hooks/useFileOperations.ts`
- `utils/pathUtils.ts`
- `src-tauri/src/modules/file_ops/listing.rs` — list_directory 라우팅
- `src-tauri/src/modules/archive_ops/` — 압축 내부 목록·materialize

## 가상 경로 규칙
- 압축 루트 진입 경로는 `buildArchiveBrowsePath(path)`로 만든다.
  - 예: `D:\work\sample.zip\`
- 내부 항목은 `압축파일 실제 경로 + separator + 내부 logical path` 형태다.
  - 예: `D:\work\sample.zip\images\hero.png`
- `splitArchiveVirtualPath()`가 실제 압축 파일 경로와 내부 경로를 분리한다.
- `isArchiveVirtualPath()`가 현재 경로나 선택 항목이 압축 내부인지 판별한다.
- 압축 루트 경로는 **반드시 separator로 끝나야 한다.** 이 규칙이 깨지면 루트/부모 계산과 중첩 진입 판별이 어긋난다.

## 패널 동작
### 일반 압축파일 더블클릭
- 일반 파일시스템에서 압축 파일을 더블클릭하면 `openArchiveEntry()`가 `qf-open-archive-pane` 이벤트를 보낸다.
- 반대편 분할 패널에 압축 경로가 열린다.
- 이유는 현재 패널을 유지해서 압축 바깥으로 파일을 꺼낼 목적지를 남겨두기 위해서다.

### 중첩 압축 더블클릭
- 이미 압축 내부에 있을 때 다시 압축 파일을 더블클릭하면 `shouldOpenArchiveInCurrentPane()`가 현재 패널 유지로 판단한다.
- 중첩 압축은 반대편 패널을 또 점유하지 않고 **같은 패널 안에서 계속 진입**한다.

### 새 탭 열기
- Ctrl+더블클릭/새 탭 열기 흐름은 `buildArchiveBrowsePath()` 기준으로 압축 루트 가상 경로를 탭에 연다.

## 목록 로딩과 메타데이터
- 프런트는 `tauriCommands.listDirectory`만 호출하고, Rust `file_ops/listing.rs`가 archive virtual path를 감지하면 `archive_ops/`로 라우팅한다.
- ZIP은 `zip` crate로 직접 읽는다.
- `.rar`, `.7z`, `.tar` 계열은 `tar -tf` / `tar -tvf` 출력으로 내부 목록과 크기를 만든다.
- 파일 항목은 실제 entry size를 표시하고, 디렉터리만 `0`을 유지한다.
- ZIP entry name과 `tar.exe` stdout/stderr는 UTF-8 우선으로 디코딩하고, 실패 시 CP949/EUC-KR fallback을 사용한다.

## 압축 내부에서 파일 열기
- 압축 내부의 일반 파일을 더블클릭하면 프런트는 그대로 `open_folder`를 호출한다.
- Rust `open_folder`는 archive virtual path를 받으면 먼저 캐시에 실파일로 materialize한 뒤 OS 기본 연결로 연다.
- 압축 내부의 파일이 다시 브라우징 가능한 압축 확장자면 OS로 넘기지 않고 탐색 대상으로 취급한다.

## 읽기 전용 규칙
- 압축 내부는 탐색 전용이다.
- `useFileOperations.ensureWritableContext()`가 현재 경로나 선택 경로에 `isArchiveVirtualPath()`가 포함되면 쓰기 작업을 막는다.
- 차단 대상 예시:
  - 삭제
  - 이름변경
  - 그룹화 / 그룹 해제
  - 새 폴더 / 새 파일 생성
  - 압축 / 변환처럼 새 결과물을 저장하는 작업
  - 폴더 크기 계산
- 사용자 메시지는 `압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.` 로 고정된다.

## 파일 꺼내기
### OS 바깥으로 드래그
- `useInternalDragDrop`는 마우스가 창 바깥으로 나가면 external drag로 전환한다.
- 선택 항목 중 archive virtual path가 하나라도 있으면 먼저 `materialize_archive_paths`를 호출한다.
- 백엔드는 앱 캐시 아래 `archive_materialized`에 원본 항목을 풀고, 드래그 세션 전용 `archive_drag_batches`로 다시 복사해 OS 드래그용 실경로를 만든다.
- 그 뒤 `tauri-plugin-drag`가 실제 파일 경로로 OS drag를 시작한다.
- 실패하면 `onError`를 통해 `FileExplorer` 오류 상태와 토스트에 반영한다.

### 탐색기 내부 실제 폴더로 드롭
- 압축 내부 항목을 실제 폴더/패널에 드롭할 때도 먼저 `materialize_archive_paths`를 호출한다.
- 압축 내부 원본은 항상 **copy**로 취급한다. move는 허용하지 않는다.
- 압축 내부 경로는 드롭 타겟으로 취급하지 않는다.

## 회귀 포인트
- 일반 압축은 반대편 패널에 열리고, 중첩 압축은 현재 패널에 남아야 한다.
- 압축 내부 파일 크기가 다시 전부 `0B`로 돌아가면 `archive_ops.rs`의 size 전달 경로를 먼저 본다.
- 한글 폴더명/파일명이 깨지면 ZIP raw name과 `tar.exe` 출력 디코딩 경로를 먼저 본다.
- 드래그로 꺼낼 때 반응이 없으면 `materialize_archive_paths`와 `useInternalDragDrop.ts`의 error surface를 같이 확인한다.

## 관련 위키
- [overview.md](overview.md)
- [FileExplorer.md](FileExplorer.md)
- [../operations/drag-drop.md](../operations/drag-drop.md)
- [../operations/useFileOperations.md](../operations/useFileOperations.md)
- [../rust/commands.md](../rust/commands.md)
