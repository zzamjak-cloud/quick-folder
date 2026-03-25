import React, { useState } from 'react';
import { Modal } from './ui/Modal';

// 탭 목록 정의
const TABS = ['단축키', '파일 탐색기', '사이드바'] as const;
type TabName = (typeof TABS)[number];

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 단축키 카테고리별 데이터
const SHORTCUT_SECTIONS: { title: string; items: { key: string; description: string }[] }[] = [
  {
    title: '탭',
    items: [
      { key: 'Ctrl+T', description: '현재 탭 복제 (새 탭)' },
      { key: 'Ctrl+W', description: '현재 탭 닫기' },
      { key: 'Ctrl+Alt+W', description: '다른 탭 모두 닫기' },
      { key: 'Tab / Shift+Tab', description: '다음/이전 탭 순환' },
    ],
  },
  {
    title: '내비게이션',
    items: [
      { key: 'Alt+← / Alt+→', description: '뒤로/앞으로' },
      { key: 'Alt+↑', description: '상위 폴더로' },
      { key: 'Alt+↓', description: '선택한 폴더/파일 진입' },
      { key: 'Backspace', description: '뒤로 가기' },
      { key: 'Enter', description: '폴더 열기 / .md 편집기' },
      { key: 'Ctrl+Shift+G', description: '경로로 이동' },
    ],
  },
  {
    title: '파일 조작',
    items: [
      { key: 'Ctrl+C', description: '파일 복사' },
      { key: 'Ctrl+X', description: '파일 잘라내기' },
      { key: 'Ctrl+V', description: '파일 붙여넣기' },
      { key: 'Ctrl+D', description: '파일 복제' },
      { key: 'Ctrl+G', description: '선택 항목을 폴더로 그룹화' },
      { key: 'Ctrl+Shift+N', description: '새 폴더 만들기' },
      { key: 'Ctrl+Z', description: '실행취소' },
      { key: 'F2', description: '이름 변경 (다중 선택 시 일괄 변경)' },
      { key: 'Delete', description: '휴지통으로 삭제' },
      { key: 'Shift+Delete', description: '영구 삭제 (복원 불가)' },
    ],
  },
  {
    title: '선택 & 검색',
    items: [
      { key: 'Ctrl+A', description: '전체 선택' },
      { key: 'Ctrl+F', description: '검색 (현재 폴더)' },
      { key: 'Ctrl+Shift+F', description: '글로벌 검색 (하위 폴더 재귀)' },
      { key: 'ESC', description: '검색 닫기 / 선택 해제' },
      { key: '방향키', description: '포커스 이동 (Shift 범위 선택)' },
    ],
  },
  {
    title: '뷰 & 미리보기',
    items: [
      { key: 'Ctrl+1', description: '그리드 뷰' },
      { key: 'Ctrl+2', description: '컬럼 뷰' },
      { key: 'Ctrl+3', description: '리스트 뷰' },
      { key: 'Ctrl+4', description: '세부정보 뷰' },
      { key: 'Ctrl++ / Ctrl+-', description: '썸네일 크기 확대/축소' },
      { key: 'Ctrl+0', description: '썸네일 크기 기본값' },
      { key: 'Space', description: '미리보기 (Quick Look)' },
    ],
  },
  {
    title: '기타',
    items: [
      { key: 'Ctrl+B', description: '사이드바 접기/펼치기' },
      { key: 'Ctrl+Alt+C', description: '선택 항목 경로 복사' },
      { key: 'Ctrl+Alt+O', description: 'Photoshop에서 열기' },
      { key: 'Ctrl+더블클릭', description: '폴더를 새 탭으로 열기' },
    ],
  },
];

// 파일 탐색기 도움말 데이터
const EXPLORER_ITEMS: { title: string; description: string }[] = [
  { title: '파일 선택', description: '클릭으로 선택, Ctrl+클릭으로 다중 선택, Shift+클릭으로 범위 선택' },
  { title: '드래그 앤 드롭', description: '파일을 OS 탐색기로 드래그하여 복사/이동' },
  { title: '썸네일', description: '이미지 파일은 자동 썸네일 표시' },
  { title: '탭', description: '여러 폴더를 탭으로 관리, Ctrl+더블클릭으로 새 탭 열기' },
  { title: '컨텍스트 메뉴', description: '우클릭으로 다양한 파일 작업 수행' },
  { title: '마크다운 편집', description: '.md 파일 선택 후 Enter로 편집기 열기' },
];

// 사이드바 도움말 데이터
const SIDEBAR_ITEMS: { title: string; description: string }[] = [
  { title: '즐겨찾기', description: 'OS에서 폴더를 드래그하여 즐겨찾기 등록' },
  { title: '카테고리', description: '+ 버튼으로 카테고리 추가, 드래그로 즐겨찾기 이동' },
  { title: '빠른 접근', description: '최근항목, 데스크탑, 다운로드 바로가기' },
  { title: '폴더 태그', description: '즐겨찾기 우클릭 → 프로젝트 태그 설정' },
];

// 단축키 탭 컨텐츠 (섹션별 그룹)
function ShortcutsTab() {
  return (
    <div className="space-y-4">
      {SHORTCUT_SECTIONS.map((section) => (
        <div key={section.title}>
          <h4 className="text-xs font-semibold text-[var(--qf-accent)] mb-1.5 px-1">
            {section.title}
          </h4>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 py-1 px-1"
              >
                <kbd
                  className="shrink-0 min-w-[140px] text-center font-mono text-xs bg-[var(--qf-surface-2)] text-[var(--qf-text)] border border-[var(--qf-border)] rounded px-2 py-0.5"
                >
                  {item.key}
                </kbd>
                <span className="text-sm text-[var(--qf-muted)]">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// 불릿 포인트 목록 컨텐츠
function BulletList({ items }: { items: { title: string; description: string }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.title} className="flex gap-2 text-sm">
          <span className="text-[var(--qf-accent)] shrink-0 mt-0.5">&bull;</span>
          <span>
            <strong className="text-[var(--qf-text)]">{item.title}</strong>
            <span className="text-[var(--qf-muted)]"> &mdash; {item.description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<TabName>('단축키');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="도움말">
      {/* 탭 버튼 */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-[var(--qf-accent)] text-white'
                : 'bg-[var(--qf-surface-2)] text-[var(--qf-muted)] hover:text-[var(--qf-text)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="max-h-[400px] overflow-y-auto pr-1">
        {activeTab === '단축키' && <ShortcutsTab />}
        {activeTab === '파일 탐색기' && <BulletList items={EXPLORER_ITEMS} />}
        {activeTab === '사이드바' && <BulletList items={SIDEBAR_ITEMS} />}
      </div>
    </Modal>
  );
}
