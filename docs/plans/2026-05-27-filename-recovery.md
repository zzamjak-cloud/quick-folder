# 파일명 복구 메뉴

- 목표: 선택 파일의 URL 퍼센트 인코딩 파일명을 우클릭 메뉴에서 원래 이름으로 복구한다.
- 범위: `useContextMenuBuilder.tsx`, `useFileOperations.ts`.
- 처리: 파일명만 `decodeURIComponent` 후 NFC 정규화, 충돌/무효 이름은 건너뛰고 기존 rename/undo/refresh 흐름을 재사용한다.
