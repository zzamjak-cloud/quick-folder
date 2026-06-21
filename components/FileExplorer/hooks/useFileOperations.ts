import { useState, useCallback, useRef, useMemo } from 'react';
import { Channel } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';
import { useUndoStack } from './useUndoStack';
import {
  getFileName,
  getBaseName,
  getExtension,
  getPathSeparator,
  getParentDir,
  isArchiveVirtualPath,
} from '../../../utils/pathUtils';
import { convertBaseName, NamingCase } from '../../../utils/caseConvert';
import type { LaigterParamsUI } from '../MapMakerModal';
import { formatSize } from '../fileUtils';
import { tauriCommands } from '../../../utils/tauriCommands';

type FolderSizeResponse = {
  bytes: string;
  file_count?: number;
  fileCount?: number;
  folder_count?: number;
  folderCount?: number;
  children?: FolderSizeChildResponse[];
};

type FolderSizeChildResponse = {
  name: string;
  path: string;
  is_dir?: boolean;
  isDir?: boolean;
  bytes: string;
  file_count?: number;
  fileCount?: number;
  folder_count?: number;
  folderCount?: number;
};

export type FolderSizeChildInfo = {
  name: string;
  path: string;
  isDir: boolean;
  bytes: number;
  bytesText: string;
  fileCount: number;
  folderCount: number;
  percent: number;
};

export type FolderSizeDialogState = {
  status: 'loading' | 'ready' | 'error';
  path: string;
  folderName: string;
  sizeText?: string;
  bytes?: string;
  fileCount?: number;
  folderCount?: number;
  children?: FolderSizeChildInfo[];
  error?: string;
};

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
  const [folderSizeDialog, setFolderSizeDialog] = useState<FolderSizeDialogState | null>(null);

  // 동영상 압축 진행률
  const [videoCompression, setVideoCompression] = useState<{
    fileName: string;
    percent: number;  // 0~: 인코딩 시간(초)
    speed: string;
    current?: number;
    total?: number;
  } | null>(null);

  /** PDF 압축: Ghostscript 자동 설치 중 */
  const [gsSetup, setGsSetup] = useState<{ fileName: string } | null>(null);

  // 파일 작업 진행 상태 (삭제/복제 중 오버레이 표시용)
  const [operationProgress, setOperationProgress] = useState<{ type: string; current: number; total: number; itemLabel?: string } | null>(null);
  const [extractingZipPaths, setExtractingZipPaths] = useState<Set<string>>(() => new Set());

  /** 복제 후 목록 갱신 시 선택·스크롤 (loadDirectory가 선택을 비울 수 있어 ref로 이어줌) */
  const pendingDuplicateSelectRef = useRef<string[]>([]);

  /** 압축 해제 후 새 폴더로 선택·스크롤하기 위한 경로 ref */
  const pendingExtractSelectRef = useRef<string[]>([]);

  // 영구삭제 확인 다이얼로그
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<{ paths: string[] } | null>(null);

  // 관리자 권한 삭제 확인 다이얼로그 (Windows)
  const [elevatedDeleteConfirm, setElevatedDeleteConfirm] = useState<{ paths: string[] } | null>(null);

  // 폴더 해제 확인 다이얼로그
  const [ungroupConfirm, setUngroupConfirm] = useState<{ path: string } | null>(null);
  const archiveReadonlyMessage = '압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.';

  // 토스트 표시 헬퍼
  const showCopyToast = useCallback((msg: string, duration = 1500) => {
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    setCopyToast(msg);
    copyToastTimerRef.current = setTimeout(() => setCopyToast(null), duration);
  }, []);

  const closeFolderSizeDialog = useCallback(() => {
    setFolderSizeDialog(null);
  }, []);

  const ensureWritableContext = useCallback((paths: string[] = []) => {
    const blocked = (currentPath != null && isArchiveVirtualPath(currentPath))
      || paths.some((path) => isArchiveVirtualPath(path));

    if (!blocked) {
      return true;
    }

    showCopyToast(archiveReadonlyMessage, 2200);
    setError(archiveReadonlyMessage);
    return false;
  }, [archiveReadonlyMessage, currentPath, setError, showCopyToast]);

  // --- 삭제 ---
  const handleDelete = useCallback(async (paths: string[], permanent = false) => {
    if (paths.length === 0) return;
    if (!ensureWritableContext(paths)) return;
    if (permanent) {
      // 영구삭제는 확인 다이얼로그 표시
      setPermanentDeleteConfirm({ paths: [...paths] });
      return;
    }
    try {
      setOperationProgress({
        type: '삭제',
        current: 0,
        total: paths.length,
        itemLabel: paths.length === 1 ? getFileName(paths[0]) : `${getFileName(paths[0])} 외 ${paths.length - 1}개`,
      });
      await tauriCommands.deleteItems(paths, true);
      setOperationProgress(null);
      undoStack.push({ type: 'delete', paths: [...paths], directory: currentPath ?? '', useTrash: true });
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      // 삭제된 폴더를 열고 있는 탭 제거 (커스텀 이벤트)
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      setOperationProgress(null);
      const errMsg = String(e);
      // Windows 권한 에러 감지 → 관리자 권한 삭제 제안
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('삭제 실패:', e);
        setError(`삭제 실패: ${e}`);
      }
    }
  }, [currentPath, ensureWritableContext, loadDirectory, undoStack, setSelectedPaths, setError]);

  // --- 영구삭제 확인 후 실행 ---
  const executePermanentDelete = useCallback(async () => {
    if (!permanentDeleteConfirm) return;
    const { paths } = permanentDeleteConfirm;
    if (!ensureWritableContext(paths)) {
      setPermanentDeleteConfirm(null);
      return;
    }
    setPermanentDeleteConfirm(null);
    try {
      setOperationProgress({
        type: '영구삭제',
        current: 0,
        total: paths.length,
        itemLabel: paths.length === 1 ? getFileName(paths[0]) : `${getFileName(paths[0])} 외 ${paths.length - 1}개`,
      });
      await tauriCommands.deleteItems(paths, false);
      setOperationProgress(null);
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      setOperationProgress(null);
      const errMsg = String(e);
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('영구삭제 실패:', e);
        setError(`영구삭제 실패: ${e}`);
      }
    }
  }, [permanentDeleteConfirm, ensureWritableContext, currentPath, loadDirectory, setSelectedPaths, setError]);

  // --- 관리자 권한 삭제 실행 (Windows) ---
  const executeElevatedDelete = useCallback(async () => {
    if (!elevatedDeleteConfirm) return;
    const { paths } = elevatedDeleteConfirm;
    if (!ensureWritableContext(paths)) {
      setElevatedDeleteConfirm(null);
      return;
    }
    setElevatedDeleteConfirm(null);
    try {
      await tauriCommands.deleteItemsElevated(paths);
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (e) {
      console.error('관리자 권한 삭제 실패:', e);
      setError(`관리자 권한 삭제 실패: ${e}`);
    }
  }, [elevatedDeleteConfirm, ensureWritableContext, currentPath, loadDirectory, setSelectedPaths, setError]);

  // --- 복제 ---
  const handleDuplicate = useCallback(async () => {
    if (selectedPaths.length === 0 || !currentPath) return;
    if (!ensureWritableContext(selectedPaths)) return;
    try {
      setOperationProgress({
        type: '복제',
        current: 0,
        total: selectedPaths.length,
        itemLabel: selectedPaths.length === 1
          ? getFileName(selectedPaths[0])
          : `${getFileName(selectedPaths[0])} 외 ${selectedPaths.length - 1}개`,
      });
      const newPaths = await tauriCommands.duplicateItems(selectedPaths);
      setOperationProgress(null);
      pendingDuplicateSelectRef.current = newPaths;
      await loadDirectory(currentPath);
    } catch (e) {
      setOperationProgress(null);
      pendingDuplicateSelectRef.current = [];
      console.error('복제 실패:', e);
    }
  }, [selectedPaths, currentPath, ensureWritableContext, loadDirectory]);

  // --- 폴더 생성 ---
  const handleCreateDirectory = useCallback(async () => {
    if (!currentPath) return;
    if (!ensureWritableContext()) return;
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
      await tauriCommands.createDirectory(newPath);
      await loadDirectory(currentPath);
      // 생성 후 바로 인라인 이름변경 시작
      setRenamingPath(newPath);
      setSelectedPaths([newPath]);
    } catch (e) {
      console.error('폴더 생성 실패:', e);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, entries, setRenamingPath, setSelectedPaths]);

  // --- 마크다운 파일 생성 ---
  const handleCreateMarkdown = useCallback(async () => {
    if (!currentPath) return;
    if (!ensureWritableContext()) return;
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
      await tauriCommands.createTextFile(newPath);
      undoStack.push({ type: 'create_file', path: newPath });
      await loadDirectory(currentPath);
      // 생성 후 바로 인라인 이름변경 시작
      setRenamingPath(newPath);
      setSelectedPaths([newPath]);
    } catch (e) {
      console.error('마크다운 파일 생성 실패:', e);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, entries, undoStack, setRenamingPath, setSelectedPaths]);

  // --- 클립보드 이미지 PNG 저장 ---
  const handlePasteImageFromClipboard = useCallback(async () => {
    if (!currentPath) return;
    if (!ensureWritableContext()) return;
    try {
      const savedPath = await tauriCommands.pasteImageFromClipboard(currentPath);
      if (savedPath) {
        await loadDirectory(currentPath);
        setSelectedPaths([savedPath]);
        showCopyToast(`스크린샷 저장: ${getFileName(savedPath)}`);
      } else {
        showCopyToast('클립보드에 이미지가 없습니다');
      }
    } catch (e) {
      console.error('클립보드 이미지 저장 실패:', e);
      setError(`클립보드 이미지 저장 실패: ${e}`);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, setSelectedPaths, showCopyToast, setError]);

  // --- 폰트 병합 완료 처리 ---
  const handleMergeFontsComplete = useCallback(async (outputPath: string) => {
    if (currentPath) {
      await loadDirectory(currentPath);
      setSelectedPaths([outputPath]);
    }
    showCopyToast(`폰트 병합 완료: ${getFileName(outputPath)}`);
  }, [currentPath, loadDirectory, setSelectedPaths, showCopyToast]);

  // --- 인라인 이름변경 시작 ---
  const handleRenameStart = useCallback((path: string) => {
    setRenamingPath(path);
    setContextMenu(null);
  }, [setRenamingPath, setContextMenu]);

  // --- 일괄 이름변경 모달 열기 ---
  const handleBulkRename = useCallback((paths: string[]) => {
    if (!ensureWritableContext(paths)) return;
    setBulkRenamePaths(paths);
    setContextMenu(null);
  }, [ensureWritableContext, setBulkRenamePaths, setContextMenu]);

  // --- 일괄 이름변경 적용 ---
  const handleBulkRenameApply = useCallback(async (renames: { oldPath: string; newPath: string }[]) => {
    if (!ensureWritableContext(renames.flatMap(({ oldPath, newPath }) => [oldPath, newPath]))) return;
    for (const { oldPath, newPath } of renames) {
      await tauriCommands.renameItem(oldPath, newPath);
    }
    if (currentPath) {
      const result = await tauriCommands.listDirectory(currentPath);
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    setSelectedPaths([]);
    window.dispatchEvent(new Event('qf-files-changed'));
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, setEntries, setSelectedPaths]);

  // --- 파일명 명명 규칙 변환 (PascalCase / camelCase / snake_case) ---
  // 선택된 파일/폴더의 베이스명만 변환하고 확장자는 유지.
  // 같은 디렉토리에서 충돌이 발생하면 해당 항목은 건너뛴다 (임시 리네임 없이 안전하게 처리).
  const handleConvertCase = useCallback(async (paths: string[], target: NamingCase) => {
    if (!paths.length) return;
    if (!ensureWritableContext(paths)) return;

    type Plan = { oldPath: string; newPath: string; displayName: string };
    const plans: Plan[] = [];
    const skipped: { name: string; reason: string }[] = [];

    // 1단계: 각 항목의 목표 경로를 계산. 변경 없는 항목은 제외.
    for (const p of paths) {
      const sep = getPathSeparator(p);
      const dir = getParentDir(p);
      const fullName = getFileName(p);
      const base = getBaseName(p);
      const ext = getExtension(p);

      const newBase = convertBaseName(base, target);
      if (!newBase) { skipped.push({ name: fullName, reason: '빈 이름' }); continue; }
      const newName = newBase + ext;
      if (newName === fullName) continue; // 이미 목표 케이스

      const newPath = dir + sep + newName;
      plans.push({ oldPath: p, newPath, displayName: fullName });
    }

    if (plans.length === 0) {
      if (skipped.length > 0) {
        showCopyToast(`변환 불가: ${skipped.length}개`);
      } else {
        showCopyToast('이미 적용된 규칙입니다');
      }
      return;
    }

    // 2단계: 동일 배치 내 중복 타깃 검사 (대소문자 구분 없이 같은 스네이크/파스칼/카멜이 나올 수 있음)
    const seen = new Map<string, string>(); // newPath(lc) -> oldPath
    const finalPlans: Plan[] = [];
    for (const pl of plans) {
      const key = pl.newPath.toLowerCase();
      if (seen.has(key)) {
        skipped.push({ name: pl.displayName, reason: '같은 이름 충돌' });
        continue;
      }
      seen.set(key, pl.oldPath);
      finalPlans.push(pl);
    }

    // 3단계: 실제 리네임 (충돌 회피 위해 임시 파일명 경유)
    // 케이스만 다른 경우(예: "File.txt" → "file.txt") 윈도우에서는 동일 파일로 취급되어 바로 rename 시 실패할 수 있음.
    // 모든 리네임을 2단계로 수행: 원본 → 임시(고유) → 최종
    const renamed: { oldPath: string; newPath: string }[] = [];
    try {
      const tempPaths: { tempPath: string; finalPath: string }[] = [];

      for (const pl of finalPlans) {
        const tempName = `.qf_case_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}__${getFileName(pl.oldPath)}`;
        const dir = getParentDir(pl.oldPath);
        const sep = getPathSeparator(pl.oldPath);
        const tempPath = dir + sep + tempName;
        await tauriCommands.renameItem(pl.oldPath, tempPath);
        tempPaths.push({ tempPath, finalPath: pl.newPath });
      }
      for (const t of tempPaths) {
        await tauriCommands.renameItem(t.tempPath, t.finalPath);
      }
      for (const pl of finalPlans) {
        renamed.push({ oldPath: pl.oldPath, newPath: pl.newPath });
      }
    } catch (e) {
      console.error('케이스 변환 실패:', e);
      showCopyToast('일부 파일 변환에 실패했습니다');
    }

    if (renamed.length > 0) {
      // 실행취소 스택 등록 (역순으로)
      for (const r of [...renamed].reverse()) {
        undoStack.push({ type: 'rename', oldPath: r.newPath, newPath: r.oldPath });
      }
      // 탭 경로 동기화 및 다른 패널 새로고침
      for (const r of renamed) {
        window.dispatchEvent(new CustomEvent('qf-tab-rename', { detail: { oldPath: r.oldPath, newPath: r.newPath } }));
      }
      window.dispatchEvent(new Event('qf-files-changed'));

      if (currentPath) {
        const result = await tauriCommands.listDirectory(currentPath);
        const sorted = sortEntries(result, sortBy, sortDir);
        setEntries(sorted);
        const newPaths = renamed.map(r => r.newPath);
        setSelectedPaths(newPaths);
      }

      const msg = skipped.length > 0
        ? `${renamed.length}개 변환, ${skipped.length}개 건너뜀`
        : `${renamed.length}개 변환 완료`;
      showCopyToast(msg);
    }
    setContextMenu(null);
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, undoStack, setEntries, setSelectedPaths, setContextMenu]);

  // --- URL 인코딩 파일명 복구 ---
  const handleRecoverFileNames = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    if (!ensureWritableContext(paths)) return;

    const decodeFileName = (name: string): string | null => {
      if (!/%[0-9a-f]{2}/i.test(name)) return null;
      try {
        let decoded = name;
        for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(decoded); i += 1) {
          const next = decodeURIComponent(decoded);
          if (next === decoded) break;
          decoded = next;
        }
        decoded = decoded.normalize('NFC');
        if (!decoded || decoded === '.' || decoded === '..' || /[/\\]/.test(decoded)) return null;
        return decoded === name ? null : decoded;
      } catch {
        return null;
      }
    };

    const renamed: { oldPath: string; newPath: string }[] = [];
    let skipped = 0;
    for (const oldPath of paths) {
      const oldName = getFileName(oldPath);
      const decodedName = decodeFileName(oldName);
      if (!decodedName) {
        skipped += 1;
        continue;
      }
      const sep = getPathSeparator(oldPath);
      const newPath = getParentDir(oldPath) + sep + decodedName;
      if (newPath === oldPath) {
        skipped += 1;
        continue;
      }
      try {
        await tauriCommands.renameItem(oldPath, newPath);
        renamed.push({ oldPath, newPath });
      } catch (e) {
        console.error('파일명 복구 실패:', e);
        skipped += 1;
      }
    }

    if (renamed.length > 0) {
      for (const r of [...renamed].reverse()) {
        undoStack.push({ type: 'rename', oldPath: r.newPath, newPath: r.oldPath });
      }
      for (const r of renamed) {
        window.dispatchEvent(new CustomEvent('qf-tab-rename', { detail: { oldPath: r.oldPath, newPath: r.newPath } }));
      }
      window.dispatchEvent(new Event('qf-files-changed'));

      if (currentPath) {
        const result = await tauriCommands.listDirectory(currentPath);
        setEntries(sortEntries(result, sortBy, sortDir));
        setSelectedPaths(renamed.map(r => r.newPath));
      }
    }

    const msg = renamed.length > 0
      ? (skipped > 0 ? `${renamed.length}개 복구, ${skipped}개 건너뜀` : `${renamed.length}개 복구 완료`)
      : '복구할 파일명이 없습니다';
    showCopyToast(msg);
    setContextMenu(null);
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, undoStack, setEntries, setSelectedPaths, setContextMenu, showCopyToast]);

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

    if (!ensureWritableContext(batchPaths)) return;

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
          await tauriCommands.renameItem(p, targetPath);
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
      const result = await tauriCommands.listDirectory(currentPath);
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
        const result = await tauriCommands.listDirectory(currentPath);
        setEntries(sortEntries(result, sortBy, sortDir));
      }
    }
  }, [currentPath, selectedPaths, ensureWritableContext, sortBy, sortDir, sortEntries, showCopyToast, undoStack, setRenamingPath, setEntries, setSelectedPaths, setFocusedIndex]);

  // --- 선택된 파일들을 새 폴더로 그룹화 (Ctrl+G) ---
  const handleGroupIntoFolder = useCallback(async () => {
    if (!currentPath || selectedPaths.length === 0) return;
    if (!ensureWritableContext(selectedPaths)) return;
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
      await tauriCommands.createDirectory(newPath);
      await tauriCommands.moveItems(selectedPaths, newPath);
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
  }, [currentPath, selectedPaths, ensureWritableContext, entries, loadDirectory, showCopyToast, undoStack, setSelectedPaths, setRenamingPath]);

  // --- 폴더 해제 요청 (확인 다이얼로그 표시) ---
  const handleUngroupFolder = useCallback((path: string) => {
    setUngroupConfirm({ path });
  }, []);

  // --- 폴더 해제 실행 (확인 후) ---
  const executeUngroupFolder = useCallback(async () => {
    if (!ungroupConfirm || !currentPath) return;
    const { path: folderPath } = ungroupConfirm;
    if (!ensureWritableContext([folderPath])) {
      setUngroupConfirm(null);
      return;
    }
    setUngroupConfirm(null);
    try {
      // 폴더 내부 파일 목록 조회
      const contents = await tauriCommands.listDirectory(folderPath);
      if (contents.length > 0) {
        // 내용물을 부모 폴더로 이동
        const sources = contents.map(e => e.path);
        await tauriCommands.moveItems(sources, currentPath);
      }
      // 빈 폴더 삭제
      await tauriCommands.deleteItems([folderPath], true);
      await loadDirectory(currentPath);
      showCopyToast(`폴더 해제 완료: ${getFileName(folderPath)}`);
    } catch (e) {
      console.error('폴더 해제 실패:', e);
      setError(`폴더 해제 실패: ${e}`);
    }
  }, [ungroupConfirm, ensureWritableContext, currentPath, loadDirectory, showCopyToast, setError]);

  // --- ZIP 압축 ---
  const handleCompressZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    if (!ensureWritableContext(paths)) return;
    const sep = getPathSeparator(currentPath);
    const firstName = getFileName(paths[0]);
    const base = paths.length === 1 ? firstName.replace(/\.[^.]+$/, '') : (getFileName(currentPath) || 'archive');
    const zipPath = `${currentPath}${sep}${base}.zip`;
    try {
      await tauriCommands.compressToZip(paths, zipPath);
      loadDirectory(currentPath);
    } catch (e) {
      console.error('압축 실패:', e);
    }
  }, [currentPath, ensureWritableContext, loadDirectory]);

  // --- ZIP 압축 풀기 ---
  const handleExtractZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    if (!ensureWritableContext(paths)) return;
    const sep = getPathSeparator(currentPath);
    setExtractingZipPaths(prev => {
      const next = new Set(prev);
      paths.forEach(path => next.add(path));
      return next;
    });
    showCopyToast(paths.length === 1 ? `압축 해제 중: ${getFileName(paths[0])}` : `압축 해제 중: ${paths.length}개`, 3000);
    try {
      const createdDirs: string[] = [];
      // 해제마다 누적 사용 중인 폴더명 (이전 해제 결과 + 기존 entries)
      const existingNames = new Set(entries.map(e => e.name));
      let totalFailed = 0; // 부분 실패 누적 (개별 파일 단위)
      for (const zipPath of paths) {
        const fileName = getFileName(zipPath);
        const baseName = fileName.replace(/\.zip$/i, '');
        // 동일 이름 폴더가 있으면 번호 붙이기
        let counter = 2;
        let folderName = baseName;
        while (existingNames.has(folderName)) {
          folderName = `${baseName} (${counter})`;
          counter++;
        }
        existingNames.add(folderName);
        const destDir = `${currentPath}${sep}${folderName}`;
        const result = await tauriCommands.extractZip(zipPath, destDir);
        createdDirs.push(result.destDir || destDir);
        if (result.failed.length > 0) {
          totalFailed += result.failed.length;
          // 어떤 항목이 왜 실패했는지 콘솔에 상세 기록
          console.warn(`압축 해제 일부 실패 (${fileName}):`, result.failed);
        }
        setExtractingZipPaths(prev => {
          const next = new Set(prev);
          next.delete(zipPath);
          return next;
        });
      }
      // 해제된 폴더로 선택·스크롤 이동 (entries 갱신 후 effect가 처리)
      pendingExtractSelectRef.current = createdDirs;
      await loadDirectory(currentPath);
      // 일부 항목이 실패했어도 나머지는 해제되었으므로 폴더 이동은 유지하고 경고만 표시
      if (totalFailed > 0) {
        showCopyToast(`압축 풀기 완료 — ${totalFailed}개 항목 실패`);
      } else {
        showCopyToast('압축 풀기 완료');
      }
    } catch (e) {
      pendingExtractSelectRef.current = [];
      console.error('압축 풀기 실패:', e);
      setError(`압축 풀기 실패: ${e}`);
    } finally {
      setExtractingZipPaths(prev => {
        const next = new Set(prev);
        let changed = false;
        paths.forEach(path => {
          if (next.delete(path)) changed = true;
        });
        return changed ? next : prev;
      });
    }
  }, [currentPath, entries, ensureWritableContext, loadDirectory, showCopyToast, setError]);

  // --- Map Maker (Laigter 스타일 맵)보내기 ---
  const handleLaigterMapsExport = useCallback(async (
    inputPath: string,
    params: LaigterParamsUI,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) => {
    if (!ensureWritableContext([inputPath])) return;
    const outputs = await tauriCommands.exportLaigterMaps(inputPath, params, options);
    if (outputs.length > 0) {
      undoStack.push({ type: 'export_maps', paths: outputs });
    }
    if (currentPath) {
      const result = await tauriCommands.listDirectory(currentPath);
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    showCopyToast(`맵 저장 완료: ${outputs.length}개 파일`);
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, showCopyToast, setEntries, undoStack]);

  // --- 픽셀화 적용 ---
  const handlePixelateApply = useCallback(async (path: string, pixelSize: number, scale: number, maxColors: number) => {
    if (!ensureWritableContext([path])) return;
    const output = await tauriCommands.pixelateImage(path, pixelSize, scale, maxColors);
    if (currentPath) {
      const result = await tauriCommands.listDirectory(currentPath);
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    showCopyToast(`픽셀화 완료: ${getFileName(output)}`);
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, showCopyToast, setEntries]);

  // --- 흰색 배경 제거 적용 ---
  const handleRemoveWhiteBgApply = useCallback(async (paths: string[], threshold: number, feather: number, seeds: [number, number][], trim: boolean) => {
    if (!ensureWritableContext(paths)) return;
    const outputs = await tauriCommands.removeWhiteBgSave(paths, threshold, feather, seeds, trim);
    if (currentPath) {
      const result = await tauriCommands.listDirectory(currentPath);
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    if (outputs.length === 1) {
      showCopyToast(`배경 제거 완료: ${getFileName(outputs[0])}`);
    } else {
      showCopyToast(`배경 제거 완료: ${outputs.length}개 파일`);
    }
  }, [currentPath, ensureWritableContext, sortBy, sortDir, sortEntries, showCopyToast, setEntries]);

  // --- 스프라이트 시트 패킹 ---
  const handleSpritePack = useCallback(async (paths: string[]) => {
    if (!ensureWritableContext(paths)) return;
    if (paths.length === 1) {
      // 폴더: 폴더 내 이미지 목록 조회
      const result = await tauriCommands.listDirectory(paths[0]);
      const imageExts = /\.(png|jpe?g|gif|webp|bmp)$/i;
      const imgs = result.filter(e => !e.is_dir && imageExts.test(e.name)).map(e => e.path);
      if (imgs.length === 0) { showCopyToast('이미지 파일이 없습니다'); return; }
      setSheetPackPaths(imgs);
    } else {
      setSheetPackPaths(paths);
    }
  }, [ensureWritableContext, showCopyToast, setSheetPackPaths]);

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
  const handleCompressVideo = useCallback(async (targetPaths: string | string[], quality: 'low' | 'medium' | 'high' = 'medium') => {
    const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
    if (paths.length === 0) return;
    if (!ensureWritableContext(paths)) return;
    try {
      // 1. ffmpeg 설치 확인
      const installed = await tauriCommands.checkFfmpeg();
      if (!installed) {
        showCopyToast('FFmpeg를 찾을 수 없습니다. 앱 업데이트 또는 설치 상태를 확인해주세요.');
        return;
      }

      let successCount = 0;
      for (let i = 0; i < paths.length; i += 1) {
        const path = paths[i];
        const fileName = getFileName(path);
        const current = i + 1;

        // 2. Channel 생성 + 압축 시작
        const onProgress = new Channel<{ percent: number; speed: string; fps: number }>();
        let lastSpeed = '';
        onProgress.onmessage = (p) => {
          if (p.percent === -2) {
            lastSpeed = p.speed;
          } else if (p.percent >= 0) {
            setVideoCompression(prev => ({
              fileName,
              percent: p.percent,
              speed: p.speed || lastSpeed || prev?.speed || '',
              current,
              total: paths.length,
            }));
          }
        };

        setVideoCompression({ fileName, percent: 0, speed: '준비 중...', current, total: paths.length });
        await tauriCommands.compressVideo(path, quality, onProgress);
        successCount += 1;
      }

      setVideoCompression(null);
      if (currentPath) loadDirectory(currentPath);
      showCopyToast(paths.length > 1 ? `동영상 압축 완료: ${successCount}/${paths.length}개` : '동영상 압축 완료');
    } catch (e) {
      setVideoCompression(null);
      showCopyToast(`압축 실패: ${e}`);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, showCopyToast]);

  // --- GIF → MP4 변환 ---
  const handleGifToMp4 = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    if (!ensureWritableContext(paths)) return;
    try {
      const installed = await tauriCommands.checkFfmpeg();
      if (!installed) {
        showCopyToast('FFmpeg를 찾을 수 없습니다. 앱 업데이트 또는 설치 상태를 확인해주세요.');
        return;
      }

      let successCount = 0;
      for (let i = 0; i < paths.length; i += 1) {
        setOperationProgress({ type: 'GIF → MP4 변환', current: i + 1, total: paths.length, itemLabel: getFileName(paths[i]) });
        await tauriCommands.gifToMp4(paths[i]);
        successCount += 1;
      }

      setOperationProgress(null);
      if (currentPath) loadDirectory(currentPath);
      showCopyToast(`GIF → MP4 완료: ${successCount}/${paths.length}개`);
    } catch (e) {
      setOperationProgress(null);
      showCopyToast(`GIF → MP4 실패: ${e}`);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, showCopyToast]);

  // --- PDF 압축 ---
  const handleCompressPdf = useCallback(async (path: string) => {
    if (!ensureWritableContext([path])) return;
    const fileName = getFileName(path);
    try {
      // Ghostscript 설치 확인
      const gsInstalled = await tauriCommands.checkGhostscript();
      if (!gsInstalled) {
        setGsSetup({ fileName });
        try {
          await tauriCommands.downloadGhostscript();
          showCopyToast('Ghostscript 설치 완료');
        } catch (installErr) {
          showCopyToast(`Ghostscript 설치 실패: ${installErr}`);
          return;
        } finally {
          setGsSetup(null);
        }
      }
      showCopyToast(`PDF 압축 중: ${fileName}`);
      const output = await tauriCommands.compressPdf(path);
      if (currentPath) loadDirectory(currentPath);
      showCopyToast(`PDF 압축 완료: ${getFileName(output)}`);
    } catch (e) {
      showCopyToast(`PDF 압축 실패: ${e}`);
    }
  }, [currentPath, ensureWritableContext, loadDirectory, showCopyToast]);

  // --- 폴더 용량 확인 ---
  const handleInspectFolderSize = useCallback(async (path: string) => {
    if (isArchiveVirtualPath(path)) {
      showCopyToast(archiveReadonlyMessage, 2200);
      setError(archiveReadonlyMessage);
      return;
    }
    const folderName = getFileName(path) || path;
    setFolderSizeDialog({ status: 'loading', path, folderName });
    try {
      const info = await tauriCommands.calculateFolderSize<FolderSizeResponse>(path);
      const bytes = Number(info.bytes);
      const sizeText = Number.isFinite(bytes) ? formatSize(bytes, false) : `${info.bytes} bytes`;
      const fileCount = info.file_count ?? info.fileCount ?? 0;
      const folderCount = info.folder_count ?? info.folderCount ?? 0;
      const children = (info.children ?? [])
        .map((child): FolderSizeChildInfo => {
          const childBytes = Number(child.bytes);
          const normalizedBytes = Number.isFinite(childBytes) ? childBytes : 0;
          return {
            name: child.name,
            path: child.path,
            isDir: child.is_dir ?? child.isDir ?? false,
            bytes: normalizedBytes,
            bytesText: formatSize(normalizedBytes, false),
            fileCount: child.file_count ?? child.fileCount ?? 0,
            folderCount: child.folder_count ?? child.folderCount ?? 0,
            percent: Number.isFinite(bytes) && bytes > 0 ? Math.min(100, (normalizedBytes / bytes) * 100) : 0,
          };
        })
        .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
      setFolderSizeDialog({
        status: 'ready',
        path,
        folderName,
        sizeText,
        bytes: info.bytes,
        fileCount,
        folderCount,
        children,
      });
    } catch (e) {
      console.error('폴더 용량 확인 실패:', e);
      setFolderSizeDialog({
        status: 'error',
        path,
        folderName,
        error: String(e),
      });
    }
  }, [archiveReadonlyMessage, setError, showCopyToast]);

  // --- 경로 복사 ---
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await tauriCommands.copyPath(path);
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
        await tauriCommands.restoreTrashItems(action.paths);
        showCopyToast('삭제 취소됨');
      } else if (action.type === 'rename') {
        await tauriCommands.renameItem(action.oldPath, action.newPath);
        showCopyToast('이름 변경 취소됨');
      } else if (action.type === 'move_group') {
        // 새 폴더 안의 파일들을 원래 디렉토리로 이동
        const innerFiles = await tauriCommands.listDirectory(action.createdDir);
        const innerPaths = innerFiles.map((f: FileEntry) => f.path);
        if (innerPaths.length > 0) {
          await tauriCommands.moveItems(innerPaths, action.parentDir);
        }
        // 빈 폴더 삭제
        await tauriCommands.deleteItems([action.createdDir], false);
        showCopyToast('그룹화 취소됨');
      } else if (action.type === 'create_file') {
        await tauriCommands.deleteItems([action.path], true);
        showCopyToast('파일 생성 취소됨');
      } else if (action.type === 'export_maps' && action.paths.length > 0) {
        await tauriCommands.deleteItems(action.paths, true);
        showCopyToast('맵보내기 취소됨');
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
    handlePasteImageFromClipboard,
    handleMergeFontsComplete,
    handleRenameStart,
    handleRenameCommit,
    handleBulkRename,
    handleBulkRenameApply,
    handleConvertCase,
    handleRecoverFileNames,
    handleGroupIntoFolder,
    handleUngroupFolder,
    handleCompressZip,
    handleExtractZip,
    handlePixelateApply,
    handleLaigterMapsExport,
    handleRemoveWhiteBgApply,
    handleSpritePack,
    handleCompressVideo,
    handleGifToMp4,
    handleCompressPdf,
    handleInspectFolderSize,
    handleCopyPath,
    handleUndo,
    showCopyToast,
    closeFolderSizeDialog,
    pendingDuplicateSelectRef,
    pendingExtractSelectRef,
    // 상태
    copyToast,
    folderSizeDialog,
    operationProgress,
    extractingZipPaths,
    videoCompression,
    gsSetup,
    sheetPackDefaultName,
    permanentDeleteConfirm,
    setPermanentDeleteConfirm,
    executePermanentDelete,
    elevatedDeleteConfirm,
    setElevatedDeleteConfirm,
    executeElevatedDelete,
    ungroupConfirm,
    setUngroupConfirm,
    executeUngroupFolder,
  };
}
