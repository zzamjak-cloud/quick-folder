# QuickFolder UI 개선 디자인 스펙

## 개요
8가지 UI/UX 개선 사항을 구현한다.

## 1. Ctrl(Cmd)+클릭 → 신규 탭 열기
- `SortableShortcutItem.tsx`: 클릭 이벤트에서 `ctrlKey`/`metaKey` 감지
- App.tsx에서 `handleOpenInNewTab` 콜백 전달
- 커스텀 이벤트 `qf-open-new-tab`으로 FileExplorer에 전달
- `useTabManagement`에서 이벤트 수신 → 새 탭 생성 + 활성화

## 2. "데스크탑" 기본 항목 추가
- `desktopDir()` API로 플랫폼별 경로 취득
- "최근항목"과 "다운로드" 사이에 배치
- 아이콘: `Monitor`, 핸들러 패턴은 `handleOpenDownloads`와 동일

## 3. 테마 전환 시 카테고리 색상 자동 조정
- `adjustColorForTheme(hexColor, isDark): string` 함수 구현
- HSL 색공간에서 명도(L)만 조정, 채도(S) 유지
- 다크 배경: L < 55% → 55%로 올림
- 라이트 배경: L > 45% → 45%로 내림
- 저장값은 원본 유지, 렌더링 시에만 적용
- `useThemeManagement`에서 `isDark` 노출

## 4. 사이드바 검색 기능 제거
- `searchQuery` 상태, `filteredCategories` useMemo, 검색 input 삭제
- `CategoryColumn`에서 `searchQuery` prop 제거

## 5. 마크다운 편집기 ESC/외부 클릭 닫기
- 캡처 단계 키 리스너에서 Escape → `handleClose()`
- 오버레이 onClick → `handleClose()`, 내부 컨텐츠 onClick stopPropagation

## 6. 화살표 프리셋 + 자동 변환
- 툴바에 화살표 드롭다운: → ← ↔
- TipTap InputRule: `->` space → `→`, `<-` space → `←`, `<->` space → `↔`

## 7. 마크다운 원본 복사 버튼
- 툴바 오른쪽 끝에 Copy 아이콘 버튼
- `turndown`으로 HTML→MD 변환 후 `navigator.clipboard.writeText()`
- 순수 텍스트만 복사 (리치 텍스트 없음)

## 8. 개발 빌드 실행
- 모든 구현 완료 후 `npm run tauri dev`
