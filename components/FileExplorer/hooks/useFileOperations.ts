import { useState, useCallback, useRef, useMemo } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';
import { useUndoStack } from './useUndoStack';
import { getFileName, getBaseName, getExtension, getPathSeparator, getParentDir } from '../../../utils/pathUtils';

export interface UseFileOperationsConfig {
  currentPath: string | null;
  entries: FileEntry[];
  selectedPaths: string[];
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setEntries: React.Dispatch<React.SetStateAction<FileEntry[]>>;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  loadDirectory: (path: string) => Promise<void>;
  undoStack: ReturnType<typeof useUndoStack>;
  sortBy: string;
  sortDir: string;
  sortEntries: (list: FileEntry[], by: string, dir: string) => FileEntry[];
  // 모달 상태
  sheetPackPaths: string[] | null;
  setBulkRenamePaths: React.Dispatch<React.SetStateAction<string[] | null>>;
  setSheetPackPaths: React.Dispatch<React.SetStateAction<string[] | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; paths: string[] } | null>>;
  setRenamingPath: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * 파일 조작 핸들러를 모아 관리하는 훅.
 * 삭제, 복제, 폴더 생성, 그룹화, ZIP 압축, 이름변경, 픽셀화, 스프라이트 패킹, 동영상 압축, 실행취소 등.
 */
export function useFileOperations(config: UseFileOperationsConfig) {
  const {
    currentPath, entries, selectedPaths,
    setSelectedPaths, setEntries, setFocusedIndex,
    loadDirectory, undoStack,
    sortBy, sortDir, sortEntries,
    sheetPackPaths,
    setBulkRenamePaths, setSheetPackPaths,
    setContextMenu, setRenamingPath,
    setError,
  } = config;

  // 복사 피드백 토스트
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 동영상 압축 진행률
  const [videoCompression, setVideoCompression] = useState<{
    fileName: string;
    percent: number;  // -1: ffmpeg 다운로드 중, 0~: 인코딩 시간(초)
    speed: string;
  } | null>(null);

  // 영구삭제 확인 다이얼로그
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<{ paths: string[] } | null>(null);

  // 관리자 권한 삭제 확인 다이얼로그 (Windows)
  const [elevatedDeleteConfirm, setElevatedDeleteConfirm] = useState<{ paths: string[] } | null>(null);

  // 토스트 표시 헬퍼
  const showCopyToast = useCallback((msg: string) => {
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    setCopyToast(msg);
    copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 1500);
  }, []);

  // --- 삭제 ---
  const handleDelete = useCallback(async (paths: string[], permanent = false) => {
    if (paths.length === 0) return;
    if (permanent) {
      // 영구삭제는 확인 다이얼로그 표시
      setPermanentDeleteConfirm({ paths: [...paths] });
      return;
    }
    try {
      await invoke('delete_items', { paths, useTrash: true });
      undoStack.push({ type: 'delete', paths: [...paths], directory: currentPath ?? '', useTrash: true });
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      // 삭제된 폴더를 열고 있는 탭 제거 (커스텀 이벤트)
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      const errMsg = String(e);
      // Windows 권한 에러 감지 → 관리자 권한 삭제 제안
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('삭제 실패:', e);
        setError(`삭제 실패: ${e}`);
      }
    }
  }, [currentPath, loadDirectory, undoStack, setSelectedPaths, setError]);

  // --- 영구삭제 확인 후 실행 ---
  const executePermanentDelete = useCallback(async () => {
    if (!permanentDeleteConfirm) return;
    const { paths } = permanentDeleteConfirm;
    setPermanentDeleteConfirm(null);
    try {
      await invoke('delete_items', { paths, useTrash: false });
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('영구삭제 실패:', e);
        setError(`영구삭제 실패: ${e}`);
      }
    }
  }, [permanentDeleteConfirm, currentPath, loadDirectory, setSelectedPaths, setError]);

  // --- 관리자 권한 삭제 실행 (Windows) ---
  const executeElevatedDelete = useCallback(async () => {
    if (!elevatedDeleteConfirm) return;
    const { paths } = elevatedDeleteConfirm;
    setElevatedDeleteConfirm(null);
    try {
      await invoke('delete_items_elevated', { paths });
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      console.error('관리자 권한 삭제 실패:', e);
      setError(`관리자 권한 삭제 실패: ${e}`);
    }
  }, [elevatedDeleteConfirm, currentPath, loadDirectory, setSelectedPaths, setError]);

  // --- 복제 ---
  const handleDuplicate = useCallback(async () => {
    if (selectedPaths.length === 0 || !currentPath) return;
    try {
      const newPaths = await invoke<string[]>('duplicate_items', { paths: selectedPaths });
      await loadDirectory(currentPath);
      setSelectedPaths(newPaths);
    } catch (e) {
      console.error('복제 실패:', e);
    }
  }, [selectedPaths, currentPath, loadDirectory, setSelectedPaths]);

  // --- 폴더 생성 ---
  const handleCreateDirectory = useCallback(async () => {
    if (!currentPath) return;
    const sep = getPathSeparator(currentPath);
    // 중복 방지: "새 폴더", "새 폴더 2", "새 폴더 3"...
    let base = '새 폴더';
    let candidate = base;
    let counter = 2;
    const existingNames = new Set(entries.map(e => e.name));
    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter++}`;
    }
    const newPath = `${currentPath}${sep}${candidate}`;
    try {
      await invoke('create_directory', { path: newPath });
      await loadDirectory(currentPath);
      // 생성 후 바로 인라인 이름변경 시작
      setRenamingPath(newPath);
      setSelectedPaths([newPath]);
    } catch (e) {
      console.error('폴더 생성 실패:', e);
    }
  }, [currentPath, loadDirectory, entries, setRenamingPath, setSelectedPaths]);

  // --- 마크다운 파일 생성 ---
  const handleCreateMarkdown = useCallback(async () => {
    if (!currentPath) return;
    const sep = getPathSeparator(currentPath);
    let base = '새 문서';
    let candidate = `${base}.md`;
    let counter = 2;
    const existingNames = new Set(entries.map(e => e.name));
    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter++}.md`;
    }
    const newPath = `${currentPath}${sep}${candidate}`;
    try {
      await invoke('create_text_file', { path: newPath });
      undoStack.push({ type: 'create_file', path: newPath });
      await loadDirectory(currentPath);
      // 생성 후 바로 인라인 이름변경 시작
      setRenamingPath(newPath);
      setSelectedPaths([newPath]);
    } catch (e) {
      console.error('마크다운 파일 생성 실패:', e);
    }
  }, [currentPath, loadDirectory, entries, undoStack, setRenamingPath, setSelectedPaths]);

  // --- 인라인 이름변경 시작 ---
  const handleRenameStart = useCallback((path: string) => {
    setRenamingPath(path);
    setContextMenu(null);
  }, [setRenamingPath, setContextMenu]);

  // --- 일괄 이름변경 모달 열기 ---
  const handleBulkRename = useCallback((paths: string[]) => {
    setBulkRenamePaths(paths);
    setContextMenu(null);
  }, [setBulkRenamePaths, setContextMenu]);

  // --- 일괄 이름변경 적용 ---
  const handleBulkRenameApply = useCallback(async (renames: { oldPath: string; newPath: string }[]) => {
    for (const { oldPath, newPath } of renames) {
      await invoke('rename_item', { oldPath, newPath });
    }
    if (currentPath) {
      const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    setSelectedPaths([]);
    window.dispatchEvent(new Event('qf-files-changed'));
  }, [currentPath, sortBy, sortDir, sortEntries, setEntries, setSelectedPaths]);

  // --- 이름변경 커밋 ---
  const handleRenameCommit = useCallback(async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    if (!newName.trim()) return;
    const sep = getPathSeparator(oldPath);

    // 새 이름에서 베이스명 추출
    const newBase = getBaseName(newName) || newName;
    const newExt = getExtension(newName);

    // 일괄 이름변경 대상 결정: 선택된 파일 중 동일 베이스명만
    const oldBase = getBaseName(oldPath);
    const batchPaths = selectedPaths.length > 1
      ? selectedPaths.filter(p => getBaseName(p) === oldBase)
      : [oldPath];

    try {
      const renamedPaths: string[] = [];
      const undoRenames: { oldPath: string; newPath: string }[] = [];
      for (const p of batchPaths) {
        const dir = getParentDir(p);
        // 대표 파일은 입력한 확장자 사용, 나머지는 기존 확장자 유지
        const ext = p === oldPath ? newExt : getExtension(p);
        const targetName = newBase + ext;
        const targetPath = dir + sep + targetName;
        if (targetPath !== p) {
          await invoke('rename_item', { oldPath: p, newPath: targetPath });
          undoRenames.push({ oldPath: p, newPath: targetPath });
        }
        renamedPaths.push(targetPath);
      }
      // undo 스택에 역순으로 push (마지막 rename부터 되돌리기)
      for (const r of [...undoRenames].reverse()) {
        undoStack.push({ type: 'rename', oldPath: r.newPath, newPath: r.oldPath });
      }
      // 이름 변경된 경로를 사용하는 탭 동기화 (커스텀 이벤트)
      for (const r of undoRenames) {
        window.dispatchEvent(new CustomEvent('qf-tab-rename', { detail: { oldPath: r.oldPath, newPath: r.newPath } }));
      }
      // 다른 패널에서도 파일 목록 갱신
      window.dispatchEvent(new Event('qf-files-changed'));

      // 이름 변경 후 디렉토리 재로드
      const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
      const sorted = sortEntries(result, sortBy, sortDir);
      setEntries(sorted);
      setSelectedPaths(renamedPaths);
      const idx = sorted.findIndex(e => renamedPaths.includes(e.path));
      if (idx >= 0) setFocusedIndex(idx);
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes('동일한 이름의 파일이 존재합니다')) {
        showCopyToast('동일한 이름의 파일이 존재합니다.');
      } else {
        console.error('이름 변경 실패:', e);
      }
      // 실패 시 디렉토리 재로드하여 원래 이름 복원
      if (currentPath) {
        const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
        setEntries(sortEntries(result, sortBy, sortDir));
      }
    }
  }, [currentPath, selectedPaths, sortBy, sortDir, sortEntries, showCopyToast, undoStack, setRenamingPath, setEntries, setSelectedPaths, setFocusedIndex]);

  // --- 선택된 파일들을 새 폴더로 그룹화 (Ctrl+G) ---
  const handleGroupIntoFolder = useCallback(async () => {
    if (!currentPath || selectedPaths.length === 0) return;
    const sep = getPathSeparator(currentPath);
    // 중복 방지: "새 폴더", "새 폴더 2"...
    let base = '새 폴더';
    let candidate = base;
    let counter = 2;
    const existingNames = new Set(entries.map(e => e.name));
    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter++}`;
    }
    const newPath = `${currentPath}${sep}${candidate}`;
    try {
      const sourcePaths = [...selectedPaths];
      await invoke('create_directory', { path: newPath });
      await invoke('move_items', { sources: selectedPaths, dest: newPath });
      undoStack.push({
        type: 'move_group',
        sources: sourcePaths,
        createdDir: newPath,
        parentDir: currentPath,
      });
      await loadDirectory(currentPath);
      setSelectedPaths([newPath]);
      setRenamingPath(newPath);
    } catch (e) {
      showCopyToast(`그룹화 실패: ${e}`);
    }
  }, [currentPath, selectedPaths, entries, loadDirectory, showCopyToast, undoStack, setSelectedPaths, setRenamingPath]);

  // --- ZIP 압축 ---
  const handleCompressZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    const sep = getPathSeparator(currentPath);
    const firstName = getFileName(paths[0]);
    const base = paths.length === 1 ? firstName.replace(/\.[^.]+$/, '') : (getFileName(currentPath) || 'archive');
    const zipPath = `${currentPath}${sep}${base}.zip`;
    try {
      await invoke('compress_to_zip', { paths, dest: zipPath });
      loadDirectory(currentPath);
    } catch (e) {
      console.error('압축 실패:', e);
    }
  }, [currentPath, loadDirectory]);

  // --- ZIP 압축 풀기 ---
  const handleExtractZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    const sep = getPathSeparator(currentPath);
    try {
      for (const zipPath of paths) {
        const fileName = getFileName(zipPath);
        const baseName = fileName.replace(/\.zip$/i, '');
        // 동일 이름 폴더가 있으면 번호 붙이기
        let destDir = `${currentPath}${sep}${baseName}`;
        let counter = 2;
        // Rust 측에서 디렉토리를 생성하므로, 프론트에서 존재 여부만 확인
        const existingNames = new Set(entries.map(e => e.name));
        let folderName = baseName;
        while (existingNames.has(folderName)) {
          folderName = `${baseName} (${counter})`;
          counter++;
        }
        destDir = `${currentPath}${sep}${folderName}`;
        await invoke('extract_zip', { zipPath, destDir });
      }
      loadDirectory(currentPath);
      showCopyToast('압축 풀기 완료');
    } catch (e) {
      console.error('압축 풀기 실패:', e);
      setError(`압축 풀기 실패: ${e}`);
    }
  }, [currentPath, entries, loadDirectory, showCopyToast, setError]);

  // --- 픽셀화 적용 ---
  const handlePixelateApply = useCallback(async (path: string, pixelSize: number, scale: number, maxColors: number) => {
    const output = await invoke<string>('pixelate_image', { input: path, pixelSize, scale, maxColors });
    if (currentPath) {
      const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    showCopyToast(`픽셀화 완료: ${getFileName(output)}`);
  }, [currentPath, sortBy, sortDir, sortEntries, showCopyToast, setEntries]);

  // --- 스프라이트 시트 패킹 ---
  const handleSpritePack = useCallback(async (paths: string[]) => {
    if (paths.length === 1) {
      // 폴더: 폴더 내 이미지 목록 조회
      const result = await invoke<FileEntry[]>('list_directory', { path: paths[0] });
      const imageExts = /\.(png|jpe?g|gif|webp|bmp)$/i;
      const imgs = result.filter(e => !e.is_dir && imageExts.test(e.name)).map(e => e.path);
      if (imgs.length === 0) { showCopyToast('이미지 파일이 없습니다'); return; }
      setSheetPackPaths(imgs);
    } else {
      setSheetPackPaths(paths);
    }
  }, [showCopyToast, setSheetPackPaths]);

  // 시트 패킹 기본 파일명
  const sheetPackDefaultName = useMemo(() => {
    if (!sheetPackPaths || sheetPackPaths.length === 0) return 'sprite';
    const names = sheetPackPaths.map(p => getFileName(p));
    // 공통 접두사 찾기
    if (names.length > 1) {
      let prefix = names[0];
      for (let i = 1; i < names.length; i++) {
        while (!names[i].startsWith(prefix) && prefix.length > 0) {
          prefix = prefix.slice(0, -1);
        }
      }
      // 접두사에서 마지막 구분자/숫자 제거
      prefix = prefix.replace(/[\s_\-.\d]+$/, '');
      if (prefix.length > 0) return prefix;
    }
    return 'sprite';
  }, [sheetPackPaths]);

  // --- 동영상 압축 ---
  const handleCompressVideo = useCallback(async (path: string, quality: 'low' | 'medium' | 'high' = 'medium') => {
    const fileName = getFileName(path);
    try {
      // 1. ffmpeg 설치 확인
      const installed = await invoke<boolean>('check_ffmpeg');
      if (!installed) {
        setVideoCompression({ fileName, percent: -1, speed: 'ffmpeg 다운로드 중...' });
        await invoke('download_ffmpeg');
      }

      // 2. Channel 생성 + 압축 시작
      const onProgress = new Channel<{ percent: number; speed: string; fps: number }>();
      let lastSpeed = '';
      onProgress.onmessage = (p) => {
        if (p.percent === -2) {
          // 스피드만 업데이트
          lastSpeed = p.speed;
        } else if (p.percent >= 0) {
          setVideoCompression(prev => ({
            fileName,
            percent: p.percent,
            speed: p.speed || lastSpeed || prev?.speed || '',
          }));
        }
      };

      setVideoCompression({ fileName, percent: 0, speed: '준비 중...' });
      const output = await invoke<string>('compress_video', { input: path, quality, onProgress });

      setVideoCompression(null);
      if (currentPath) loadDirectory(currentPath);
      showCopyToast(`압축 완료: ${getFileName(output)}`);
    } catch (e) {
      setVideoCompression(null);
      showCopyToast(`압축 실패: ${e}`);
    }
  }, [currentPath, loadDirectory, showCopyToast]);

  // --- 경로 복사 ---
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await invoke('copy_path', { path });
      showCopyToast('경로가 복사되었습니다');
    } catch (e) {
      console.error('경로 복사 실패:', e);
    }
  }, [showCopyToast]);

  // --- 실행취소 (Ctrl+Z / Cmd+Z) ---
  const handleUndo = useCallback(async () => {
    const action = undoStack.pop();
    if (!action) return;

    try {
      if (action.type === 'delete') {
        await invoke('restore_trash_items', { originalPaths: action.paths });
        showCopyToast('삭제 취소됨');
      } else if (action.type === 'rename') {
        await invoke('rename_item', { oldPath: action.oldPath, newPath: action.newPath });
        showCopyToast('이름 변경 취소됨');
      } else if (action.type === 'move_group') {
        // 새 폴더 안의 파일들을 원래 디렉토리로 이동
        const innerFiles = await invoke<FileEntry[]>('list_directory', { path: action.createdDir });
        const innerPaths = innerFiles.map((f: FileEntry) => f.path);
        if (innerPaths.length > 0) {
          await invoke('move_items', { sources: innerPaths, dest: action.parentDir });
        }
        // 빈 폴더 삭제
        await invoke('delete_items', { paths: [action.createdDir], useTrash: false });
        showCopyToast('그룹화 취소됨');
      } else if (action.type === 'create_file') {
        await invoke('delete_items', { paths: [action.path], useTrash: true });
        showCopyToast('파일 생성 취소됨');
      }
      if (currentPath) {
        loadDirectory(currentPath);
      }
    } catch (e) {
      console.error('실행취소 실패:', e);
      showCopyToast('실행취소 실패');
    }
  }, [undoStack, currentPath, loadDirectory, showCopyToast]);

  return {
    // 핸들러
    handleDelete,
    handleDuplicate,
    handleCreateDirectory,
    handleCreateMarkdown,
    handleRenameStart,
    handleRenameCommit,
    handleBulkRename,
    handleBulkRenameApply,
    handleGroupIntoFolder,
    handleCompressZip,
    handleExtractZip,
    handlePixelateApply,
    handleSpritePack,
    handleCompressVideo,
    handleCopyPath,
    handleUndo,
    showCopyToast,
    // 상태
    copyToast,
    videoCompression,
    sheetPackDefaultName,
    permanentDeleteConfirm,
    setPermanentDeleteConfirm,
    executePermanentDelete,
    elevatedDeleteConfirm,
    setElevatedDeleteConfirm,
    executeElevatedDelete,
  };
}
