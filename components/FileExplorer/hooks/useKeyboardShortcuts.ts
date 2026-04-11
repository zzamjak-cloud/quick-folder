import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize, ViewMode } from '../../../types';
import { cancelAllQueued } from './invokeQueue';
import { usePreview } from './usePreview';
import { useColumnView } from './useColumnView';
import { Tab } from '../types';
import { getBaseName } from '../../../utils/pathUtils';

// 최근항목 특수 경로 상수
const RECENT_PATH = '__recent__';

const THUMBNAIL_SIZES: ThumbnailSize[] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];

export interface UseKeyboardShortcutsConfig {
  isFocused: boolean;
  renamingPath: string | null;
  currentPath: string | null;
  viewMode: ViewMode;
  entries: FileEntry[];
  selectedPaths: string[];
  focusedIndex: number;
  clipboard: ClipboardData | null;
  isSearchActive: boolean;
  isMac: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null | undefined;
  thumbnailSize: ThumbnailSize;
  gridRef: React.RefObject<HTMLDivElement | null>;
  selectionAnchorRef: React.MutableRefObject<number>;
  // 핸들러
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
  handleDelete: (paths: string[], permanent?: boolean) => void;
  handleCreateDirectory: () => void;
  handleGroupIntoFolder: () => void;
  handleUngroupFolder: (path: string) => void;
  handleRenameStart: (path: string) => void;
  handleBulkRename: (paths: string[]) => void;
  handleCopyPath: (path: string) => void;
  handleUndo: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  openEntry: (entry: FileEntry) => void;
  previewFile: (entry: FileEntry) => void;
  preview: ReturnType<typeof usePreview>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setThumbnailSize: React.Dispatch<React.SetStateAction<ThumbnailSize>>;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setClipboard: (cb: ClipboardData | null) => void;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGoToFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGlobalSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleTabSelect: (id: string) => void;
  handleTabClose: (id: string) => void;
  duplicateTab: () => void;
  closeOtherTabs: () => void;
  columnView: ReturnType<typeof useColumnView>;
  setMarkdownEditorPath: (path: string | null) => void;
  handleCreateMarkdown: () => void;
  handleCompressVideo: (path: string, quality: string) => void;
  handleCompressPdf: (path: string) => void;
  handleCompressZip: (paths: string[]) => void;
  handleExtractZip: (paths: string[]) => void;
  handleAddTag: (path: string) => void;
  handlePasteImageFromClipboard: () => void;
  setFontMergePaths: (paths: string[] | null) => void;
  setFontPreviewPath: (path: string | null) => void;
  setPdfPreviewPath: (path: string | null) => void;
}

/**
 * 파일 탐색기 전역 키보드 단축키를 등록하는 훅.
 * keydown 이벤트 리스너 하나로 탭, 내비게이션, 파일 조작, 검색, 줌 등을 처리.
 */
export function useKeyboardShortcuts(config: UseKeyboardShortcutsConfig) {
  const {
    isFocused, renamingPath, currentPath, viewMode,
    entries, selectedPaths, focusedIndex, clipboard, isSearchActive,
    isMac, tabs, activeTabId, activeTab, thumbnailSize,
    gridRef, selectionAnchorRef,
    handleCopy, handleCut, handlePaste, handleDuplicate,
    handleDelete, handleCreateDirectory, handleGroupIntoFolder, handleUngroupFolder,
    handleRenameStart, handleBulkRename, handleCopyPath, handleUndo,
    selectAll, deselectAll, goBack, goForward, goUp,
    openEntry, previewFile, preview,
    setViewMode, setThumbnailSize, setFocusedIndex, setSelectedPaths,
    setClipboard, setSearchQuery, setIsSearchActive,
    setIsGoToFolderOpen, setIsGlobalSearchOpen, setError,
    searchInputRef,
    handleTabSelect, handleTabClose, duplicateTab, closeOtherTabs,
    columnView,
    setMarkdownEditorPath,
    handleCreateMarkdown,
    handleCompressVideo,
    handleCompressZip,
    handleExtractZip,
    handleAddTag,
    handlePasteImageFromClipboard,
    setFontMergePaths,
    setFontPreviewPath,
    setPdfPreviewPath,
  } = config;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 분할 뷰: 포커스된 패널만 키보드 단축키 응답
      if (!isFocused) return;
      if (renamingPath) return;
      // 마크다운 편집기 열려 있으면 모든 단축키 무시
      const active = document.activeElement;
      if (active && (active as HTMLElement).isContentEditable) return;
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (isInput && e.key !== 'Escape') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // 창 도킹 단축키(Ctrl+Alt+Shift+Arrow)는 App.tsx에서 처리
      if (ctrl && e.altKey && e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

      // --- 탭 단축키 ---
      // Ctrl+W (Cmd+W): 현재 탭 닫기 (고정 탭은 닫히지 않음)
      if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyW') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId && !activeTab?.pinned) handleTabClose(activeTabId);
        return;
      }
      // Ctrl+Alt+W (Cmd+Alt+W): 현재 탭만 남기고 나머지 모두 닫기
      if (ctrl && e.altKey && !e.shiftKey && e.code === 'KeyW') {
        e.preventDefault();
        closeOtherTabs();
        return;
      }
      // Ctrl+T (Cmd+T): 현재 탭 복제
      if (ctrl && !e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        duplicateTab();
        return;
      }

      // Tab / Shift+Tab: 탭 순환
      if (e.key === 'Tab' && !isInput) {
        e.preventDefault();
        if (tabs.length <= 1) return;
        const currentIdx = tabs.findIndex(t => t.id === activeTabId);
        if (e.shiftKey) {
          const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
          handleTabSelect(tabs[prevIdx].id);
        } else {
          const nextIdx = (currentIdx + 1) % tabs.length;
          handleTabSelect(tabs[nextIdx].id);
        }
        return;
      }

      // --- 내비게이션 ---
      if (isMac) {
        if (ctrl && e.key === '[') { e.preventDefault(); goBack(); return; }
        if (ctrl && e.key === ']') { e.preventDefault(); goForward(); return; }
        if (ctrl && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
        if (ctrl && e.key === 'ArrowDown') {
          if (selectedPaths.length === 1) {
            const entry = entries.find(en => en.path === selectedPaths[0]);
            if (entry) { e.preventDefault(); openEntry(entry); return; }
          }
        }
      } else {
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
        // Windows: Alt+↓ 로 폴더/파일 진입
        if (e.altKey && e.key === 'ArrowDown') {
          if (selectedPaths.length === 1) {
            const entry = entries.find(en => en.path === selectedPaths[0]);
            if (entry) { e.preventDefault(); openEntry(entry); return; }
          }
        }
      }

      // Ctrl+Alt+C: 선택된 항목 경로 복사 (없으면 현재 폴더 경로)
      if (ctrl && e.altKey && !e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        if (selectedPaths.length > 0) {
          // 선택된 항목이 있으면 해당 경로 복사 (여러 개면 줄바꿈 구분)
          const pathsToCopy = selectedPaths.join('\n');
          handleCopyPath(pathsToCopy);
        } else if (currentPath && currentPath !== RECENT_PATH) {
          handleCopyPath(currentPath);
        }
        return;
      }

      // Ctrl+Alt+O (Cmd+Option+O): Photoshop에서 열기
      if (ctrl && e.altKey && !e.shiftKey && e.code === 'KeyO') {
        e.preventDefault();
        const imageExts = new Set([
          'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'psd', 'psb',
          'tiff', 'tif', 'svg', 'ico', 'raw', 'cr2', 'nef', 'arw',
        ]);
        const imagePaths = selectedPaths.filter(p => {
          const ext = p.split('.').pop()?.toLowerCase() ?? '';
          return imageExts.has(ext);
        });
        if (imagePaths.length > 0) {
          invoke('open_in_photoshop', { paths: imagePaths }).catch((err: unknown) => {
            setError(`Photoshop 열기 실패: ${err}`);
          });
        }
        return;
      }

      // Ctrl+Shift+G: 폴더로 이동
      if (ctrl && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
        e.preventDefault();
        setIsGoToFolderOpen(true);
        return;
      }

      // Ctrl+Shift+F: 글로벌 검색 (하위 폴더 재귀)
      if (ctrl && e.shiftKey && !e.altKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        if (currentPath && currentPath !== RECENT_PATH) {
          setIsGlobalSearchOpen(true);
        }
        return;
      }

      // Ctrl+Shift+Alt+F: 폰트 병합 (폰트 파일 2개 선택 시)
      if (ctrl && e.shiftKey && e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        const fontPaths = selectedPaths.filter(p => /\.(ttf|otf|woff|woff2|ttc)$/i.test(p));
        if (fontPaths.length === 2) {
          setFontMergePaths(fontPaths);
        }
        return;
      }

      // Ctrl+F: 검색 토글
      if (ctrl && !e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setIsSearchActive(prev => {
          if (prev) { setSearchQuery(''); return false; }
          setTimeout(() => searchInputRef.current?.focus(), 0);
          return true;
        });
        return;
      }

      // ESC: 검색 닫기 → 클립보드 해제 → 선택 해제
      if (e.key === 'Escape') {
        if (isSearchActive) { setSearchQuery(''); setIsSearchActive(false); return; }
        if (clipboard) { setClipboard(null); return; }
        deselectAll();
        return;
      }

      // Mac: ⌫/Delete 키로 파일 삭제 (선택 있을 때), 미선택 시 뒤로 이동
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (selectedPaths.length > 0) {
          handleDelete(selectedPaths, e.shiftKey);
          return;
        }
        if (e.key === 'Backspace' && !ctrl) { goBack(); return; }
      }

      if (e.key === 'Enter') {
        if (viewMode === 'columns') {
          // 컬럼 뷰: 포커스된 항목으로 진입
          const col = columnView.columns[columnView.focusedCol];
          if (col) {
            const entry = col.entries[columnView.focusedRow];
            if (entry) {
              e.preventDefault();
              if (!entry.is_dir && !/\.(png|jpe?g|gif|bmp|webp|ico|icns|svg|psd|tiff?|mp4|mov|avi|mkv|webm|mp3|wav|aac|flac|ogg|zip|rar|7z|tar|gz|dmg|exe|dll|so|dylib|pdf|doc|docx|xls|xlsx|ppt|pptx|ttf|otf|woff2?|gsheet|gdoc|gslides|gmap)$/i.test(entry.name) && entry.name.includes('.')) {
                setMarkdownEditorPath(entry.path);
              } else {
                openEntry(entry);
              }
              return;
            }
          }
        } else if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry) {
            e.preventDefault();
            if (!entry.is_dir && !/\.(png|jpe?g|gif|bmp|webp|ico|icns|svg|psd|tiff?|mp4|mov|avi|mkv|webm|mp3|wav|aac|flac|ogg|zip|rar|7z|tar|gz|dmg|exe|dll|so|dylib|pdf|doc|docx|xls|xlsx|ppt|pptx|ttf|otf|woff2?|gsheet|gdoc|gslides|gmap)$/i.test(entry.name) && entry.name.includes('.')) {
              setMarkdownEditorPath(entry.path);
            } else {
              openEntry(entry);
            }
            return;
          }
        }
        return;
      }

      // --- Quick Look / 미리보기 (Spacebar 토글) ---
      if (e.key === ' ') {
        e.preventDefault();
        // 컬럼뷰에서는 이미 미리보기 패널이 있으므로 스페이스바 미리보기 비활성화
        if (viewMode === 'columns') return;
        // 동영상 재생 중이면 스페이스바로 닫지 않음 (플레이/스탑 역할)
        if (preview.videoPlayerPath) return;
        // 이미지/텍스트 미리보기가 열려있으면 닫기
        if (preview.isAnyPreviewOpen) {
          preview.closeAllPreviews();
          return;
        }
        // 선택된 파일이 하나일 때만 미리보기 열기 (폴더 제외)
        if (selectedPaths.length !== 1) return;
        const entry = entries.find(en => en.path === selectedPaths[0]);
        if (entry && !entry.is_dir) {
          if (/\.(ttf|otf|woff|woff2|ttc)$/i.test(entry.name)) {
            setFontPreviewPath(entry.path);
          } else if (/\.pdf$/i.test(entry.name)) {
            // PDF 파일: 내장 PDF 뷰어 모달로 미리보기
            setPdfPreviewPath(entry.path);
          } else if (/\.json$/i.test(entry.name)) {
            // JSON 파일: JSON 뷰어로 미리보기
            preview.handlePreviewJson(entry.path);
          } else {
            previewFile(entry);
          }
        }
        return;
      }

      // --- Ctrl+1~4 / Cmd+1~4: 뷰 모드 전환 ---
      if (ctrl && !e.shiftKey && !e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const modes: ViewMode[] = ['grid', 'columns', 'list', 'details'];
        setViewMode(modes[parseInt(e.key) - 1]);
        return;
      }

      // --- 탐색기 줌 (Ctrl +/-) ---
      if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.min(THUMBNAIL_SIZES.length - 1, idx + 1)];
        });
        return;
      }
      if (ctrl && e.key === '-') {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.max(0, idx - 1)];
        });
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === '0') {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(120);
        return;
      }

      // --- 파일 조작 ---
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'a') { e.preventDefault(); selectAll(); return; }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'c') { e.preventDefault(); handleCopy(); return; }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'x') { e.preventDefault(); handleCut(); return; }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'v') { handlePaste(); return; }

      // Ctrl+Shift+V: 클립보드 이미지를 PNG로 즉시 저장
      if (ctrl && e.shiftKey && e.code === 'KeyV') {
        e.preventDefault();
        if (currentPath && currentPath !== RECENT_PATH) {
          handlePasteImageFromClipboard();
        }
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.key === 'd') { e.preventDefault(); handleDuplicate(); return; }
      // Ctrl+G: 선택된 파일들을 새 폴더로 그룹화
      if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'g' || e.key === 'G' || e.code === 'KeyG')) { e.preventDefault(); handleGroupIntoFolder(); return; }
      // Ctrl+Alt+G: 폴더 해제 (선택한 폴더의 내용물을 꺼내고 폴더 삭제)
      if (ctrl && e.altKey && !e.shiftKey && e.code === 'KeyG') {
        e.preventDefault();
        if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry?.is_dir) handleUngroupFolder(selectedPaths[0]);
        }
        return;
      }
      if (ctrl && e.shiftKey && !e.altKey && (e.key === 'N' || e.key === 'n' || e.code === 'KeyN')) { e.preventDefault(); handleCreateDirectory(); return; }

      // Ctrl+Shift+M: 마크다운 파일 생성
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyM') { e.preventDefault(); handleCreateMarkdown(); return; }

      // Ctrl+Shift+P: 동영상 보통 화질 압축
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        if (selectedPaths.length === 1) {
          const ext = selectedPaths[0].split('.').pop()?.toLowerCase() ?? '';
          if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
            handleCompressVideo(selectedPaths[0], 'low');
          }
        }
        return;
      }

      // Ctrl+Shift+Z: ZIP 압축
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (selectedPaths.length > 0) handleCompressZip(selectedPaths);
        return;
      }

      // Ctrl+Shift+Alt+Z: ZIP 압축 해제
      if (ctrl && e.shiftKey && e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        const zipPaths = selectedPaths.filter(p => /\.zip$/i.test(p));
        if (zipPaths.length > 0) handleExtractZip(zipPaths);
        return;
      }

      // Ctrl+Shift+T: 폴더에 태그 추가
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry?.is_dir) handleAddTag(selectedPaths[0]);
        }
        return;
      }

      if (e.key === 'F2') {
        if (selectedPaths.length === 1) {
          handleRenameStart(selectedPaths[0]);
        } else if (selectedPaths.length > 1) {
          // 동일 베이스명(확장자만 다름) → 인라인 이름변경 (커밋 시 일괄 적용)
          // 다른 이름 섞임 → 일괄 이름변경 모달
          const baseNames = new Set(selectedPaths.map(getBaseName));
          if (baseNames.size === 1) {
            handleRenameStart(selectedPaths[0]);
          } else {
            handleBulkRename(selectedPaths);
          }
        }
        return;
      }

      // Windows: Delete 키로 파일 삭제
      if (e.key === 'Delete') {
        if (selectedPaths.length > 0) {
          handleDelete(selectedPaths, e.shiftKey);
        }
        return;
      }

      // --- 방향키 포커스 이동 ---
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();

        // 컬럼 뷰 방향키 처리
        if (viewMode === 'columns') {
          const { columns: cols, focusedCol: fc, focusedRow: fr } = columnView;
          if (cols.length === 0) return;
          const currentCol = cols[fc];
          if (!currentCol) return;

          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const nextRow = e.key === 'ArrowUp' ? fr - 1 : fr + 1;
            if (nextRow < 0 || nextRow >= currentCol.entries.length) return;
            columnView.setFocusedRow(nextRow);
            const entry = currentCol.entries[nextRow];
            if (!entry) return;

            if (e.shiftKey) {
              // Shift+위/아래: 앵커 기반 범위 선택 (컬럼 구조 변경 없음)
              if (selectionAnchorRef.current < 0) selectionAnchorRef.current = fr;
              const from = Math.min(selectionAnchorRef.current, nextRow);
              const to = Math.max(selectionAnchorRef.current, nextRow);
              setSelectedPaths(currentCol.entries.slice(from, to + 1).map(e => e.path));
            } else {
              // 일반 위/아래: 단일 선택 + 컬럼 탐색
              selectionAnchorRef.current = -1;
              columnView.selectInColumn(fc, entry);
              setSelectedPaths([entry.path]);
            }
          } else if (e.key === 'ArrowRight') {
            // 선택된 항목이 폴더면 다음 컬럼으로
            const selectedEntry = currentCol.entries[fr];
            if (selectedEntry?.is_dir) {
              const nextCol = cols[fc + 1];
              if (nextCol && nextCol.entries.length > 0) {
                // 이미 열린 컬럼이면 포커스만 이동
                columnView.setFocusedCol(fc + 1);
                columnView.setFocusedRow(0);
                const firstEntry = nextCol.entries[0];
                if (firstEntry) {
                  columnView.selectInColumn(fc + 1, firstEntry);
                  setSelectedPaths([firstEntry.path]);
                }
              } else if (!nextCol) {
                // 아직 열리지 않은 폴더: selectInColumn으로 열기
                columnView.selectInColumn(fc, selectedEntry);
                setSelectedPaths([selectedEntry.path]);
              }
            }
          } else if (e.key === 'ArrowLeft') {
            // 이전 컬럼으로 포커스 이동: 현재 컬럼의 서브 컬럼만 제거
            if (fc > 0) {
              const prevCol = cols[fc - 1];
              // 현재 컬럼(fc)까지 유지하고, 그 뒤(fc+1~)만 제거
              columnView.trimColumnsAfter(fc);
              columnView.setFocusedCol(fc - 1);
              if (prevCol?.selectedPath) {
                const rowIdx = prevCol.entries.findIndex(e => e.path === prevCol.selectedPath);
                if (rowIdx >= 0) columnView.setFocusedRow(rowIdx);
                setSelectedPaths([prevCol.selectedPath]);
              }
            }
          }
          return;
        }

        if (entries.length === 0) return;

        // list/details 뷰는 1행에 1개 항목, grid 뷰만 열 수 계산
        const cols = (() => {
          if (viewMode === 'list' || viewMode === 'details') return 1;
          if (!gridRef.current) return 4;
          // 컨테이너 패딩(p-3=24px) 차감, flex gap(gap-2=8px) 보정
          const available = gridRef.current.clientWidth - 24;
          const cardWidth = thumbnailSize + 16; // FileCard 실제 너비
          const gap = 8; // gap-2
          return Math.max(1, Math.floor((available + gap) / (cardWidth + gap)));
        })();

        // 포커스 없으면 첫 번째 항목에 포커스+선택만 (이동하지 않음)
        if (focusedIndex < 0) {
          setFocusedIndex(0);
          setSelectedPaths([entries[0].path]);
          selectionAnchorRef.current = -1;
          return;
        }

        const current = focusedIndex;
        let next = current;

        // 좌우 이동: 단순히 인덱스 ±1
        if (e.key === 'ArrowRight' && current < entries.length - 1) next = current + 1;
        else if (e.key === 'ArrowLeft' && current > 0) next = current - 1;
        // 위아래 이동: DOM 기반 행 위치 계산 (type별 정렬 구분선 대응)
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const container = gridRef.current;
          if (!container) return;
          const currentEl = container.querySelector(`[data-file-path="${CSS.escape(entries[current].path)}"]`);
          if (!currentEl) return;

          // grid 뷰: 현재 항목의 row 위치를 기준으로 다음 row의 항목 찾기
          if (viewMode === 'grid') {
            const currentRect = currentEl.getBoundingClientRect();
            const allEls = Array.from(container.querySelectorAll('[data-file-path]'));

            if (e.key === 'ArrowDown') {
              // 현재 항목보다 아래에 있고, 세로 위치가 현재보다 큰 항목 중 가장 가까운 것
              const below = allEls
                .map((el, idx) => ({ el, idx, rect: el.getBoundingClientRect() }))
                .filter(({ rect }) => rect.top > currentRect.top + 10) // 현재 행보다 확실히 아래
                .sort((a, b) => {
                  // 1차: 세로 위치 (가장 가까운 행)
                  const rowDiff = Math.abs(a.rect.top - currentRect.top) - Math.abs(b.rect.top - currentRect.top);
                  if (Math.abs(rowDiff) > 5) return rowDiff;
                  // 2차: 가로 위치 (현재 항목과 가장 가까운 열)
                  return Math.abs(a.rect.left - currentRect.left) - Math.abs(b.rect.left - currentRect.left);
                });
              if (below.length > 0) next = below[0].idx;
            } else {
              // 위로 이동
              const above = allEls
                .map((el, idx) => ({ el, idx, rect: el.getBoundingClientRect() }))
                .filter(({ rect }) => rect.top < currentRect.top - 10) // 현재 행보다 확실히 위
                .sort((a, b) => {
                  const rowDiff = Math.abs(a.rect.top - currentRect.top) - Math.abs(b.rect.top - currentRect.top);
                  if (Math.abs(rowDiff) > 5) return rowDiff;
                  return Math.abs(a.rect.left - currentRect.left) - Math.abs(b.rect.left - currentRect.left);
                });
              if (above.length > 0) next = above[0].idx;
            }
          } else {
            // list/details 뷰: 단순히 인덱스 ±1
            if (e.key === 'ArrowDown' && current < entries.length - 1) next = current + 1;
            else if (e.key === 'ArrowUp' && current > 0) next = current - 1;
          }
        }

        setFocusedIndex(next);

        if (e.shiftKey) {
          // Shift+방향키: 앵커~이동 위치까지 범위 선택 (반대 방향 이동 시 축소)
          if (selectionAnchorRef.current < 0) selectionAnchorRef.current = current;
          const from = Math.min(selectionAnchorRef.current, next);
          const to = Math.max(selectionAnchorRef.current, next);
          setSelectedPaths(entries.slice(from, to + 1).map(e => e.path));
        } else {
          selectionAnchorRef.current = -1;
          setSelectedPaths([entries[next].path]);
        }

        // 포커스된 항목이 화면에 보이도록 자동 스크롤
        requestAnimationFrame(() => {
          const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(entries[next].path)}"]`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFocused, renamingPath, selectAll, deselectAll, handleUndo, handleCopy, handleCut, handlePaste, handleDuplicate,
    handleCreateDirectory, handleGroupIntoFolder, handleUngroupFolder, handleRenameStart, handleDelete, handleCopyPath,
    goBack, goForward, goUp, selectedPaths, entries, openEntry, currentPath,
    thumbnailSize, focusedIndex, clipboard, isSearchActive,
    tabs, activeTabId, activeTab, handleTabSelect, handleTabClose, duplicateTab, closeOtherTabs,
    previewFile, preview.isAnyPreviewOpen, preview.closeAllPreviews,
    viewMode, columnView.columns, columnView.focusedCol, columnView.focusedRow,
    columnView.selectInColumn, columnView.setFocusedCol, columnView.setFocusedRow, columnView.trimColumnsAfter,
    isMac, handleBulkRename,
    handleCreateMarkdown, handleCompressVideo, handleCompressZip, handleExtractZip, handleAddTag, handlePasteImageFromClipboard,
    setFontMergePaths, setFontPreviewPath, setPdfPreviewPath,
    setViewMode, setThumbnailSize, setFocusedIndex, setSelectedPaths,
    setClipboard, setSearchQuery, setIsSearchActive, setIsGoToFolderOpen, setIsGlobalSearchOpen,
    setError, searchInputRef, gridRef, selectionAnchorRef,
  ]);
}
