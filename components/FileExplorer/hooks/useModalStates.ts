import { useState } from 'react';
import type { FolderMergeRequest } from '../../../types';

/**
 * 파일 탐색기의 모달/다이얼로그 상태를 모아 관리하는 훅.
 * 각 모달의 열림 여부(또는 대상 경로)를 useState로 보관.
 */
export function useModalStates() {
  // 픽셀화 대상 경로
  const [pixelatePath, setPixelatePath] = useState<string | null>(null);
  // Map Maker (Laigter 스타일 맵 생성) 대상 경로
  const [mapMakerPath, setMapMakerPath] = useState<string | null>(null);
  // 스프라이트 시트 패킹 대상 이미지 경로 목록
  const [sheetPackPaths, setSheetPackPaths] = useState<string[] | null>(null);
  // 스프라이트 시트 언패킹 대상 경로
  const [sheetUnpackPath, setSheetUnpackPath] = useState<string | null>(null);
  // 일괄 이름변경 대상 경로 목록
  const [bulkRenamePaths, setBulkRenamePaths] = useState<string[] | null>(null);
  // 폴더로 이동 모달
  const [isGoToFolderOpen, setIsGoToFolderOpen] = useState(false);
  // 글로벌 검색 모달
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  // 중복 파일 찾기 대상 폴더 경로
  const [duplicateFinderPath, setDuplicateFinderPath] = useState<string | null>(null);
  // Diff Viewer 비교 대상 [왼쪽, 오른쪽] 경로
  const [diffViewerPaths, setDiffViewerPaths] = useState<[string, string] | null>(null);
  // 폴더 태그 입력 프롬프트
  const [tagPrompt, setTagPrompt] = useState<{ path: string; defaultName: string } | null>(null);
  // 인라인 이름변경 대상 경로
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // 마크다운 편집기 대상 경로
  const [markdownEditorPath, setMarkdownEditorPath] = useState<string | null>(null);
  // 흰색 배경 제거 대상 이미지 경로 목록
  const [removeWhiteBgPaths, setRemoveWhiteBgPaths] = useState<string[] | null>(null);
  // 폰트 병합 대상 경로 목록
  const [fontMergePaths, setFontMergePaths] = useState<string[] | null>(null);
  // 폰트 미리보기 대상 경로
  const [fontPreviewPath, setFontPreviewPath] = useState<string | null>(null);
  // PDF 미리보기 대상 경로
  const [pdfPreviewPath, setPdfPreviewPath] = useState<string | null>(null);
  // GIF 압축 대상 경로 목록
  const [gifCompressPaths, setGifCompressPaths] = useState<string[] | null>(null);
  // 오디오 미리듣기 대상 경로
  const [audioPreviewPath, setAudioPreviewPath] = useState<string | null>(null);
  // 터미널 프리셋 대상 폴더 경로
  const [terminalPresetPath, setTerminalPresetPath] = useState<string | null>(null);
  // 터미널 프리셋 모달에서 바로 편집할 프리셋 ID
  const [terminalPresetEditId, setTerminalPresetEditId] = useState<string | null>(null);
  // 스마트 폴더 병합 요청
  const [folderMergeRequest, setFolderMergeRequest] = useState<FolderMergeRequest | null>(null);

  return {
    pixelatePath, setPixelatePath,
    mapMakerPath, setMapMakerPath,
    sheetPackPaths, setSheetPackPaths,
    sheetUnpackPath, setSheetUnpackPath,
    bulkRenamePaths, setBulkRenamePaths,
    isGoToFolderOpen, setIsGoToFolderOpen,
    isGlobalSearchOpen, setIsGlobalSearchOpen,
    duplicateFinderPath, setDuplicateFinderPath,
    diffViewerPaths, setDiffViewerPaths,
    tagPrompt, setTagPrompt,
    renamingPath, setRenamingPath,
    markdownEditorPath, setMarkdownEditorPath,
    removeWhiteBgPaths, setRemoveWhiteBgPaths,
    fontMergePaths, setFontMergePaths,
    fontPreviewPath, setFontPreviewPath,
    pdfPreviewPath, setPdfPreviewPath,
    gifCompressPaths, setGifCompressPaths,
    audioPreviewPath, setAudioPreviewPath,
    terminalPresetPath, setTerminalPresetPath,
    terminalPresetEditId, setTerminalPresetEditId,
    folderMergeRequest, setFolderMergeRequest,
  };
}
