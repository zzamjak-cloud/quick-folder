import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';
import { ContextMenuSection } from '../types';
import {
  ExternalLink, Folder, Copy, CopyPlus, Scissors, Clipboard as ClipboardIcon,
  Edit2, Trash2, Hash, Star, FileArchive, Eye, Film, Grid3x3, LayoutGrid, Ungroup, Tag,
  FolderPlus, FileText, Image, List, Eraser, Type,
} from 'lucide-react';
import { getFileName } from '../../../utils/pathUtils';

export interface UseContextMenuBuilderConfig {
  contextMenu: { x: number; y: number; paths: string[] } | null;
  entries: FileEntry[];
  folderTags: Record<string, string> | null;
  clipboardHook: {
    clipboard: { paths: string[]; action: 'copy' | 'cut' } | null;
    handleCopy: () => void;
    handleCut: () => void;
    handlePaste: () => void;
  };
  fileOps: {
    handleDuplicate: () => void;
    handleRenameStart: (path: string) => void;
    handleBulkRename: (paths: string[]) => void;
    handleDelete: (paths: string[], permanent: boolean) => void;
    handleCompressZip: (paths: string[]) => void;
    handleExtractZip: (paths: string[]) => void;
    handleCompressVideo: (path: string, quality: string) => void;
    handleCompressPdf: (path: string) => void;
    handleCopyPath: (path: string) => void;
    handleSpritePack: (paths: string[]) => void;
    handleCreateDirectory: () => void;
    handleCreateMarkdown: () => void;
    showCopyToast: (message: string) => void;
  };
  modals: {
    setPixelatePath: (path: string | null) => void;
    setRemoveWhiteBgPaths: (paths: string[]) => void;
    setSheetUnpackPath: (path: string | null) => void;
    setFontPreviewPath: (path: string | null) => void;
    setFontMergePaths: (paths: string[]) => void;
    setPdfPreviewPath: (path: string | null) => void;
    setGifCompressPath: (path: string | null) => void;
  };
  preview: {
    handlePreviewImage: (path: string) => void;
  };
  openEntry: (entry: FileEntry) => void;
  openInOsExplorer: (path: string) => void;
  handleAddTag: (path: string) => void;
  handleRemoveTag: (path: string) => void;
  onAddToFavorites: (path: string, name: string) => void;
  loadDirectory: (path: string) => Promise<void>;
  currentPath: string | null;
}

/**
 * 컨텍스트 메뉴 섹션 빌더 훅
 * index.tsx의 ~350줄짜리 useMemo 로직을 분리
 */
export function useContextMenuBuilder({
  contextMenu,
  entries,
  folderTags,
  clipboardHook,
  fileOps,
  modals,
  preview,
  openEntry,
  openInOsExplorer,
  handleAddTag,
  handleRemoveTag,
  onAddToFavorites,
  loadDirectory,
  currentPath,
}: UseContextMenuBuilderConfig) {
  const contextMenuSections = useMemo((): ContextMenuSection[] => {
    if (!contextMenu) return [];
    const { paths } = contextMenu;
    const isSingle = paths.length === 1;
    const singlePath = paths[0] ?? '';
    const singleEntry = isSingle ? entries.find(e => e.path === singlePath) : null;
    const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';

    const sections: ContextMenuSection[] = [];

    // 섹션 1: 열기, 미리보기, Finder에서 열기
    const openSection: ContextMenuSection = { id: 'open', items: [] };
    if (isSingle) {
      openSection.items.push({
        id: 'open',
        icon: <ExternalLink size={13} />,
        label: '열기',
        onClick: () => { const entry = entries.find(e => e.path === singlePath); if (entry) openEntry(entry); },
      });
    }
    if (isSingle && singleEntry && !singleEntry.is_dir &&
      (/\.(psd|psb)$/i.test(singleEntry.name) || singleEntry.file_type === 'image')) {
      openSection.items.push({
        id: 'preview',
        icon: <Eye size={13} />,
        label: '미리보기',
        onClick: () => preview.handlePreviewImage(singlePath),
      });
    }
    if (isSingle) {
      openSection.items.push({
        id: 'open-in-os',
        icon: <Folder size={13} />,
        label: 'Finder/탐색기에서 열기',
        onClick: () => openInOsExplorer(
          singleEntry?.is_dir ? singlePath : (singlePath.split(/[/\\]/).slice(0, -1).join('/') || singlePath)
        ),
      });
    }
    sections.push(openSection);

    // 섹션 2: 복사, 잘라내기, 붙여넣기, 복제
    sections.push({
      id: 'clipboard',
      items: [
        { id: 'copy', icon: <Copy size={13} />, label: '복사', onClick: clipboardHook.handleCopy, disabled: paths.length === 0, shortcut: `${mod}+C` },
        { id: 'cut', icon: <Scissors size={13} />, label: '잘라내기', onClick: clipboardHook.handleCut, disabled: paths.length === 0, shortcut: `${mod}+X` },
        { id: 'paste', icon: <ClipboardIcon size={13} />, label: '붙여넣기', onClick: clipboardHook.handlePaste, shortcut: `${mod}+V` },
        { id: 'duplicate', icon: <CopyPlus size={13} />, label: '복제', onClick: fileOps.handleDuplicate, disabled: paths.length === 0, shortcut: `${mod}+D` },
      ],
    });

    // 섹션 3: 이름 바꾸기, 삭제
    const editSection: ContextMenuSection = { id: 'edit', items: [] };
    if (isSingle) {
      editSection.items.push({
        id: 'rename',
        icon: <Edit2 size={13} />,
        label: '이름 바꾸기',
        onClick: () => fileOps.handleRenameStart(singlePath),
        shortcut: 'F2',
      });
    }
    if (!isSingle && paths.length > 1) {
      editSection.items.push({
        id: 'bulk-rename',
        icon: <Edit2 size={13} />,
        label: '이름 모두 바꾸기',
        onClick: () => fileOps.handleBulkRename(paths),
      });
    }
    editSection.items.push({
      id: 'delete',
      icon: <Trash2 size={13} style={{ color: '#f87171' }} />,
      label: '삭제 (휴지통)',
      onClick: () => fileOps.handleDelete(paths, false),
      disabled: paths.length === 0,
      shortcut: 'Del',
    });
    sections.push(editSection);

    // 섹션 4: ZIP 압축, 동영상 압축, 픽셀화, 시트 패킹/언패킹
    const toolSection: ContextMenuSection = { id: 'tools', items: [] };
    toolSection.items.push({
      id: 'zip',
      icon: <FileArchive size={13} />,
      label: 'ZIP으로 압축',
      onClick: () => fileOps.handleCompressZip(paths),
      disabled: paths.length === 0,
    });
    // ZIP 압축 풀기 (.zip 파일이 선택된 경우에만 표시)
    const zipPaths = paths.filter(p => /\.zip$/i.test(p));
    if (zipPaths.length > 0) {
      toolSection.items.push({
        id: 'extract-zip',
        icon: <FileArchive size={13} />,
        label: '압축 풀기',
        onClick: () => fileOps.handleExtractZip(zipPaths),
      });
    }
    // 동영상 압축 (서브메뉴)
    if (isSingle && singleEntry && singleEntry.file_type === 'video') {
      toolSection.items.push({
        id: 'compress-video',
        icon: <Film size={13} />,
        label: '동영상 압축',
        onClick: () => {}, // 부모 항목 클릭 없음 (서브메뉴 전용)
        submenu: [
          { id: 'quality-low', icon: undefined, label: '보통 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'low') },
          { id: 'quality-medium', icon: undefined, label: '좋은 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'medium') },
          { id: 'quality-high', icon: undefined, label: '최고 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'high') },
        ],
      });
    }
    // 픽셀화 (PNG/JPG)
    if (isSingle && singleEntry && /\.(png|jpe?g)$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'pixelate',
        icon: <Grid3x3 size={13} />,
        label: '픽셀화',
        onClick: () => modals.setPixelatePath(singlePath),
      });
    }
    // 배경 제거 (PNG/JPG — 단일 또는 다중 선택)
    {
      const imgPaths = paths.filter(p => /\.(png|jpe?g)$/i.test(p));
      if (imgPaths.length > 0) {
        toolSection.items.push({
          id: 'remove-white-bg',
          icon: <Eraser size={13} />,
          label: '배경 제거',
          onClick: () => modals.setRemoveWhiteBgPaths(imgPaths),
        });
      }
    }
    // 스프라이트 시트 패킹 — 폴더 단일 선택
    if (isSingle && singleEntry?.is_dir) {
      toolSection.items.push({
        id: 'sprite-pack',
        icon: <LayoutGrid size={13} />,
        label: '시트 패킹',
        onClick: () => fileOps.handleSpritePack([singlePath]),
      });
    }
    // 스프라이트 시트 패킹 — 다중 이미지 선택
    if (!isSingle && paths.length > 1) {
      const allImages = paths.every(p => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p));
      if (allImages) {
        toolSection.items.push({
          id: 'sprite-pack-multi',
          icon: <LayoutGrid size={13} />,
          label: '시트 패킹',
          onClick: () => fileOps.handleSpritePack(paths),
        });
      }
    }
    // 스프라이트 시트 언패킹 — PNG 단일 선택
    if (isSingle && singleEntry && /\.(png)$/i.test(singleEntry.name) && !singleEntry.is_dir) {
      toolSection.items.push({
        id: 'sheet-unpack',
        icon: <Ungroup size={13} />,
        label: '시트 언패킹',
        onClick: () => modals.setSheetUnpackPath(singlePath),
      });
    }
    // ICO/ICNS 변환 — PNG 단일 선택
    if (isSingle && singleEntry && /\.(png)$/i.test(singleEntry.name) && !singleEntry.is_dir) {
      toolSection.items.push({
        id: 'convert-ico',
        icon: <Image size={13} />,
        label: '.ico 변환',
        onClick: async () => {
          try {
            await invoke('convert_to_ico', { path: singlePath });
            loadDirectory(currentPath!);
          } catch (e) { console.error('ICO 변환 실패:', e); }
        },
      });
      toolSection.items.push({
        id: 'convert-icns',
        icon: <Image size={13} />,
        label: '.icns 변환',
        onClick: async () => {
          try {
            await invoke('convert_to_icns', { path: singlePath });
            loadDirectory(currentPath!);
          } catch (e) { console.error('ICNS 변환 실패:', e); }
        },
      });
    }
    // 폰트 미리보기 (단일 폰트 선택 시)
    if (isSingle && singleEntry && /\.(ttf|otf|woff|woff2|ttc)$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'font-preview',
        icon: <Type size={13} />,
        label: '폰트 미리보기',
        onClick: () => modals.setFontPreviewPath(singlePath),
      });
    }

    // PDF 미리보기 (단일 PDF 선택 시)
    if (isSingle && singleEntry && /\.pdf$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'pdf-preview',
        icon: <FileText size={13} />,
        label: 'PDF 미리보기',
        onClick: () => modals.setPdfPreviewPath(singlePath),
      });
    }

    // PDF 압축 (단일 PDF 선택 시, 고화질 설정으로 즉시 실행)
    if (isSingle && singleEntry && /\.pdf$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'compress-pdf',
        icon: <FileText size={13} />,
        label: 'PDF 압축',
        onClick: () => fileOps.handleCompressPdf(singlePath),
      });
    }

    // GIF 압축 (단일 GIF 선택 시)
    if (isSingle && singleEntry && /\.gif$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'compress-gif',
        icon: <Image size={13} />,
        label: 'GIF 압축',
        onClick: () => modals.setGifCompressPath(singlePath),
      });
    }

    // 폰트 병합 (폰트 2개 선택 시)
    {
      const fontPaths = paths.filter(p => /\.(ttf|otf|woff|woff2|ttc)$/i.test(p));
      if (fontPaths.length === 2) {
        toolSection.items.push({
          id: 'merge-fonts',
          icon: <Type size={13} />,
          label: '폰트 병합',
          onClick: () => modals.setFontMergePaths(fontPaths),
        });
      }
    }
    sections.push(toolSection);

    // 섹션 5: 경로 복사, 즐겨찾기, 태그
    const infoSection: ContextMenuSection = { id: 'info', items: [] };
    if (isSingle) {
      infoSection.items.push({
        id: 'copy-path',
        icon: <Hash size={13} />,
        label: '경로 복사',
        onClick: () => fileOps.handleCopyPath(singlePath),
      });
    }
    // 엔트리 복제 — 폴더 선택 시 내부 파일명 목록, 파일 선택 시 선택된 파일명 목록
    if (paths.length > 0) {
      infoSection.items.push({
        id: 'copy-entry-names',
        icon: <List size={13} />,
        label: '엔트리 복제',
        onClick: async () => {
          try {
            let names: string[] = [];
            if (isSingle && singleEntry?.is_dir) {
              const entries: FileEntry[] = await invoke('list_directory', { path: singlePath });
              names = entries.map(e => {
                const dot = e.name.lastIndexOf('.');
                return dot > 0 && !e.is_dir ? e.name.slice(0, dot) : e.name;
              });
            } else {
              names = paths.map(p => {
                const sep = p.includes('\\') ? '\\' : '/';
                const fileName = p.split(sep).pop() ?? p;
                const dot = fileName.lastIndexOf('.');
                return dot > 0 ? fileName.slice(0, dot) : fileName;
              });
            }
            // CRLF 구분 — 구글 시트에서 각 행에 하나씩 붙여넣기
            const text = names.join('\r\n');
            // Tauri 클립보드 플러그인 사용 (navigator.clipboard는 웹뷰에서 실패 가능)
            await invoke('copy_path', { path: text });
            fileOps.showCopyToast(`${names.length}개 파일명 복사됨`);
          } catch (e) { console.error('엔트리 복제 실패:', e); }
        },
      });
    }
    if (isSingle && singleEntry?.is_dir) {
      infoSection.items.push({
        id: 'add-favorite',
        icon: <Star size={13} />,
        label: '즐겨찾기에 추가',
        onClick: () => {
          onAddToFavorites(singlePath, getFileName(singlePath));
        },
      });
    }
    // 폴더 태그 추가/해제
    if (isSingle && singleEntry?.is_dir) {
      const hasTag = folderTags && folderTags[singlePath];
      if (hasTag) {
        infoSection.items.push({
          id: 'remove-tag',
          icon: <Tag size={13} />,
          label: '태그 해제',
          onClick: () => handleRemoveTag(singlePath),
        });
      } else {
        infoSection.items.push({
          id: 'add-tag',
          icon: <Tag size={13} />,
          label: '태그 추가',
          onClick: () => handleAddTag(singlePath),
        });
      }
    }
    sections.push(infoSection);

    // 섹션 6: 빈 공간 전용 (새로 만들기)
    if (paths.length === 0) {
      const createSection: ContextMenuSection = { id: 'create', items: [] };
      createSection.items.push({
        id: 'new-folder',
        icon: <FolderPlus size={13} />,
        label: '새 폴더',
        onClick: () => fileOps.handleCreateDirectory(),
      });
      createSection.items.push({
        id: 'new-markdown',
        icon: <FileText size={13} />,
        label: '마크다운',
        onClick: () => fileOps.handleCreateMarkdown(),
      });
      sections.push(createSection);
    }

    return sections;
  }, [
    contextMenu, entries, clipboardHook.clipboard, folderTags,
    openEntry, openInOsExplorer, preview.handlePreviewImage,
    clipboardHook.handleCopy, clipboardHook.handleCut, clipboardHook.handlePaste, fileOps.handleDuplicate,
    fileOps.handleRenameStart, fileOps.handleBulkRename, fileOps.handleDelete,
    fileOps.handleCompressZip, fileOps.handleCompressVideo, fileOps.handleCompressPdf, fileOps.handleCopyPath,
    fileOps.handleSpritePack, fileOps.handleCreateDirectory, fileOps.handleCreateMarkdown,
    handleAddTag, handleRemoveTag,
    onAddToFavorites, modals.setPixelatePath, modals.setSheetUnpackPath,
    modals.setFontPreviewPath, modals.setFontMergePaths,
    modals.setPdfPreviewPath,
  ]);

  return { contextMenuSections };
}
