import { useState } from 'react';

/**
 * 파일 탐색기의 모달/다이얼로그 상태를 모아 관리하는 훅.
 * 각 모달의 열림 여부(또는 대상 경로)를 useState로 보관.
 */
export function useModalStates() {
  // 픽셀화 대상 경로
  const [pixelatePath, setPixelatePath] = useState<string | null>(null);
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
  // 폴더 태그 입력 프롬프트
  const [tagPrompt, setTagPrompt] = useState<{ path: string; defaultName: string } | null>(null);
  // 인라인 이름변경 대상 경로
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // 마크다운 편집기 대상 경로
  const [markdownEditorPath, setMarkdownEditorPath] = useState<string | null>(null);
  // 흰색 배경 제거 대상 이미지 경로 목록
  const [removeWhiteBgPaths, setRemoveWhiteBgPaths] = useState<string[] | null>(null);

  return {
    pixelatePath, setPixelatePath,
    sheetPackPaths, setSheetPackPaths,
    sheetUnpackPath, setSheetUnpackPath,
    bulkRenamePaths, setBulkRenamePaths,
    isGoToFolderOpen, setIsGoToFolderOpen,
    isGlobalSearchOpen, setIsGlobalSearchOpen,
    tagPrompt, setTagPrompt,
    renamingPath, setRenamingPath,
    markdownEditorPath, setMarkdownEditorPath,
    removeWhiteBgPaths, setRemoveWhiteBgPaths,
  };
}
