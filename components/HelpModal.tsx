import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// 탭 목록 정의 — 신규 기능까지 망라
const TABS = [
  '단축키',
  '파일 탐색기',
  '미리보기 & 편집',
  '이미지 도구',
  '미디어 & 압축',
  '마크다운',
  '사이드바',
] as const;
type TabName = (typeof TABS)[number];

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ───────── 단축키 카테고리 ─────────
const SHORTCUT_SECTIONS: { title: string; items: { key: string; description: string }[] }[] = [
  {
    title: '탭',
    items: [
      { key: 'Ctrl+T', description: '현재 탭 복제 (새 탭)' },
      { key: 'Ctrl+W', description: '현재 탭 닫기' },
      { key: 'Ctrl+Alt+W', description: '다른 탭 모두 닫기' },
      { key: 'Tab / Shift+Tab', description: '다음/이전 탭 순환' },
      { key: 'Ctrl+더블클릭', description: '폴더를 새 탭으로 열기' },
    ],
  },
  {
    title: '내비게이션',
    items: [
      { key: 'Alt+← / Alt+→', description: '뒤로/앞으로' },
      { key: 'Alt+↑', description: '상위 폴더로' },
      { key: 'Alt+↓ / Enter', description: '선택한 폴더 진입 / 파일 열기' },
      { key: 'Backspace', description: '뒤로 가기' },
      { key: 'Ctrl+Shift+G', description: '경로로 이동 (텍스트 입력)' },
    ],
  },
  {
    title: '파일 조작',
    items: [
      { key: 'Ctrl+C', description: '파일 복사' },
      { key: 'Ctrl+X', description: '파일 잘라내기' },
      { key: 'Ctrl+V', description: '파일 붙여넣기' },
      { key: 'Ctrl+Shift+V', description: '클립보드 이미지를 PNG로 저장 (스크린샷)' },
      { key: 'Ctrl+D', description: '파일 복제 (복제본으로 포커싱)' },
      { key: 'Ctrl+G', description: '선택 항목을 폴더로 그룹화' },
      { key: 'Ctrl+Alt+G', description: '폴더 해제 (내용물 부모로 꺼내기)' },
      { key: 'Ctrl+Shift+N', description: '새 폴더 만들기' },
      { key: 'Ctrl+Shift+M', description: '새 마크다운 파일 생성' },
      { key: 'Ctrl+Z', description: '실행 취소 (삭제·이름·그룹화·생성)' },
      { key: 'F2', description: '이름 변경 (다중 선택 시 일괄 변경 모달)' },
      { key: 'Delete', description: '휴지통으로 삭제 (Windows)' },
      { key: 'Backspace (Mac)', description: '휴지통으로 삭제 (Mac)' },
      { key: 'Shift+Delete', description: '영구 삭제 (복원 불가)' },
    ],
  },
  {
    title: '압축 & 변환',
    items: [
      { key: 'Ctrl+Shift+Z', description: 'ZIP 압축' },
      { key: 'Ctrl+Shift+Alt+Z', description: 'ZIP 압축 해제 (해제된 폴더로 자동 포커싱)' },
      { key: 'Ctrl+Shift+P', description: '동영상 압축 (보통 화질)' },
      { key: 'Ctrl+Shift+Alt+F', description: '폰트 병합 (폰트 2개 선택)' },
      { key: 'Ctrl+Shift+T', description: '태그 추가' },
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
      { key: 'Ctrl+2', description: '컬럼 뷰 (macOS Finder 스타일)' },
      { key: 'Ctrl+3', description: '리스트 뷰' },
      { key: 'Ctrl+4', description: '세부정보 뷰' },
      { key: 'Ctrl+휠 / Ctrl++ / Ctrl+-', description: '썸네일 크기 변경' },
      { key: 'Ctrl+0', description: '썸네일 크기 기본값' },
      { key: 'Space', description: '미리보기 (이미지·동영상·텍스트·코드·폰트·HWP·PDF)' },
    ],
  },
  {
    title: '경로 & 외부 도구',
    items: [
      { key: 'Ctrl+Alt+C', description: '선택 항목 경로 복사' },
      { key: 'Ctrl+Alt+O', description: 'Photoshop에서 열기' },
      { key: 'Ctrl+B', description: '사이드바 접기/펼치기' },
    ],
  },
];

// ───────── 파일 탐색기 (확장 컨텐츠) ─────────
const EXPLORER_SECTIONS = [
  {
    title: '뷰 모드 4종',
    bullets: [
      '그리드(Ctrl+1) — 썸네일 카드. 이미지·PSD·동영상 자동 썸네일',
      '컬럼(Ctrl+2) — Finder 스타일. 좌→우 폴더 드릴다운, 우측 끝에서 자동 미리보기',
      '리스트(Ctrl+3) — 한 줄 표시. 작은 썸네일 + 이름',
      '세부정보(Ctrl+4) — 표 형태. 이름·크기·수정시간·종류',
    ],
  },
  {
    title: '탭 시스템',
    bullets: [
      '여러 폴더를 탭으로 관리. 탭 드래그로 순서 변경',
      'Ctrl+T로 현재 탭 복제, Ctrl+W로 닫기, Ctrl+Alt+W로 나머지 모두 닫기',
      '탭 우클릭 → 핀 고정, 다른 탭 모두 닫기',
      'Ctrl+더블클릭으로 폴더를 새 탭에서 열기',
    ],
  },
  {
    title: '분할 뷰 (Split View)',
    bullets: [
      '상단 분할 버튼으로 좌우/상하 두 패널 동시 사용',
      '패널 간 드래그로 파일 이동/복사 (Ctrl 누르면 복사)',
      '클립보드(Ctrl+C/V)는 두 패널이 공유',
      '포커스되지 않은 패널의 선택은 자동 해제됨',
    ],
  },
  {
    title: '선택 동작',
    bullets: [
      '클릭 = 단일 선택, Ctrl+클릭 = 다중 선택, Shift+클릭 = 범위 선택',
      '빈 공간 드래그로 박스 선택',
      '복제(Ctrl+D)·붙여넣기·압축 해제 후 결과 항목으로 자동 포커싱',
    ],
  },
  {
    title: '드래그 앤 드롭',
    bullets: [
      '파일 → OS 탐색기/포토샵 등 외부 앱으로 드래그하여 복사/이동',
      '폴더 → 사이드바 즐겨찾기로 드래그하여 등록',
      '패널 간 드래그 이동 / Ctrl 드래그 복사',
      '파일 → 다른 폴더 위로 드래그하면 해당 폴더로 이동',
    ],
  },
  {
    title: '컨텍스트 메뉴 (우클릭)',
    bullets: [
      '파일 종류별 동적 메뉴 — 이미지·동영상·ZIP·폰트·PDF 등 맞춤 액션',
      '경로 복사, Photoshop 열기, 일괄 이름 변경, 케이스 변환(camelCase 등)',
      '빈 공간 우클릭 → 새 폴더 / 마크다운 / 클립보드 이미지 붙여넣기',
    ],
  },
];

// ───────── 미리보기 & 편집 ─────────
const PREVIEW_SECTIONS = [
  {
    title: 'Quick Look (Space)',
    bullets: [
      '이미지·PSD·동영상·텍스트·코드·폰트·HWP·PDF·JSON 즉시 미리보기',
      '미리보기 열린 상태에서 다른 파일 선택하면 자동 갱신',
      '동영상은 재생 중 자동 갱신 안 됨 (의도치 않은 전환 방지)',
      'ESC로 닫기',
    ],
  },
  {
    title: '이미지 편집 모드 (E 키)',
    bullets: [
      '미리보기에서 "편집(E)" 클릭 또는 E 키로 진입',
      '좌측 툴바: 펜 / 사각형 / 타원 / 지우개 / 색상 / 굵기 / 지우기',
      'Shift 드래그: 펜 직선 잠금, 도형 정비율',
      'Ctrl+Z: 드로잉 단계별 실행 취소',
      '헤더 우측 "PNG 저장" (녹색) 클릭으로 합성 PNG 저장',
      '원본은 유지되고 같은 폴더에 `_annotated.png` 등으로 새 파일 생성',
    ],
  },
  {
    title: '이미지 크롭',
    bullets: [
      '편집 모드가 아닐 때 이미지 미리보기에서 드래그로 영역 지정',
      '모서리 핸들로 크기 조절, 영역 내부 드래그로 이동',
      'Shift 드래그: 1:1 정사각형 고정',
      '실시간 픽셀 크기 표시 (원본 해상도 기준)',
      '헤더 "PNG 저장" 클릭 → `{파일명}_crop.png`로 저장',
    ],
  },
  {
    title: '동영상 플레이어',
    bullets: [
      '재생/일시정지·구간 자르기·썸네일 추출·캡처 PNG 저장',
      'WebM/MP4 등 일반 포맷 지원',
      '재생 위치 슬라이더 + 자세한 시간 표시',
    ],
  },
  {
    title: '코드/텍스트 미리보기',
    bullets: [
      '주요 언어 자동 구문 강조 (highlight.js)',
      'E 키로 편집 모드, Ctrl+S로 저장',
      'Ctrl+F 검색, Enter/Shift+Enter로 다음/이전 매칭',
      '코드 블록 접기/펼치기 지원',
    ],
  },
  {
    title: '특수 포맷',
    bullets: [
      'PSD/PSB — Photoshop 미리보기 썸네일 (디스크 캐시)',
      'PDF — Ghostscript 미리보기, 페이지 탐색',
      'HWP/HWPX — 한글 파일 텍스트 추출 미리보기',
      'FBX — 메쉬·텍스처 정보 표시',
      '폰트(TTF/OTF) — 글자 샘플 미리보기 + Space로 폰트 테스트 팝업',
      'JSON — 트리 뷰어로 구조 탐색',
    ],
  },
];

// ───────── 이미지 도구 ─────────
const IMAGE_TOOL_SECTIONS = [
  {
    title: '드로잉 / 주석 (편집 모드)',
    bullets: [
      '펜·사각형·타원·지우개 도구. 색상·굵기 조절',
      'Shift 키로 직선·정비율 보조',
      'PNG 합성 저장 (헤더 녹색 "PNG 저장" 버튼)',
    ],
  },
  {
    title: '크롭',
    bullets: [
      'JPG·PNG·PSD/PSB 지원',
      '드래그로 영역 선택 후 헤더 PNG 저장',
      'ESC로 선택 영역 초기화',
    ],
  },
  {
    title: '배경 제거',
    bullets: [
      '미리보기 헤더 "배경 제거" 버튼 또는 우클릭 메뉴',
      '흰 배경 자동 제거 + "여백 제거" 옵션으로 투명 가장자리 트리밍',
      '결과 PNG는 원본과 동일 폴더에 새 파일로 저장',
    ],
  },
  {
    title: '픽셀화 (Pixelate)',
    bullets: [
      '우클릭 → 픽셀화. 픽셀 크기·스케일·최대 색상 수 조절',
      '도트 그래픽 / 모자이크 / 픽셀아트 변환',
    ],
  },
  {
    title: '시트 패커 / 언패커',
    bullets: [
      '여러 이미지를 하나의 스프라이트 시트로 합치기 (격자 배치)',
      '시트 한 장을 N×M 격자로 분할 — 게임 리소스 정리에 유용',
    ],
  },
  {
    title: 'Map Maker (Normal/Parallax/Specular/Occlusion)',
    bullets: [
      'Laigter 스타일 노멀맵·시차맵 등 다양한 텍스처 맵 생성',
      '게임용 2D 라이팅·셰이딩 워크플로우 지원',
    ],
  },
  {
    title: '폰트 병합',
    bullets: [
      '폰트 2개 선택 후 Ctrl+Shift+Alt+F',
      '한 폰트의 글리프 일부를 다른 폰트로 보완 (예: 한글 + 영문 페어)',
    ],
  },
];

// ───────── 미디어 & 압축 ─────────
const MEDIA_SECTIONS = [
  {
    title: 'ZIP 압축 / 해제',
    bullets: [
      '선택 후 Ctrl+Shift+Z로 ZIP 압축. 단일 파일은 파일명, 다중은 폴더명 기반',
      '.zip 선택 후 Ctrl+Shift+Alt+Z 또는 우클릭 → "압축 풀기"',
      '동명 폴더 있으면 자동 번호 부여 — 해제 완료 후 새 폴더로 자동 포커싱·스크롤',
    ],
  },
  {
    title: '동영상 압축 (ffmpeg)',
    bullets: [
      '우클릭 → 동영상 압축 → 화질 선택 (낮음/보통/높음)',
      'ffmpeg가 없으면 자동 다운로드',
      '진행률·인코딩 시간·속도 실시간 표시',
    ],
  },
  {
    title: 'GIF 압축',
    bullets: [
      'GIF 파일 우클릭 → GIF 압축 모달',
      '프레임 수·색상·크기 조절로 용량 절감',
    ],
  },
  {
    title: 'PDF 압축 (Ghostscript)',
    bullets: [
      'PDF 우클릭 → PDF 압축. Ghostscript 자동 설치 (Windows/macOS)',
      'screen / ebook / printer / prepress 4단계 품질 옵션',
    ],
  },
  {
    title: '클립보드 이미지 저장 (스크린샷)',
    bullets: [
      'Win+Shift+S 등으로 캡처한 이미지를 Ctrl+Shift+V로 폴더에 PNG 저장',
      '저장 후 새 파일로 자동 포커싱',
    ],
  },
];

// ───────── 마크다운 ─────────
const MARKDOWN_SECTIONS = [
  {
    title: '마크다운 프리뷰 / 편집',
    bullets: [
      '.md 파일 선택 후 Space로 프리뷰, Enter로 편집 모드 열기',
      '빈 공간 우클릭 → "마크다운" → 즉시 인라인 이름 변경 + 편집',
      '같은 팝업 안에서 Tab으로 프리뷰와 마크다운 편집 전환',
      '편집 모드에서 Ctrl+S로 즉시 저장',
    ],
  },
  {
    title: '자동 저장 & 단축키',
    bullets: [
      '프리뷰로 전환하거나 닫을 때 변경사항 저장',
      'Ctrl+S로 즉시 저장',
      'ESC 또는 외부 클릭으로 닫기',
      '편집기 내부에서는 글로벌 단축키가 차단되어 충돌 없음',
    ],
  },
  {
    title: '자동 변환 & 복사',
    bullets: [
      '헤더 "복사" 버튼으로 순수 마크다운 텍스트 클립보드 복사',
      '프리뷰 렌더링은 marked 사용',
    ],
  },
  {
    title: '마크다운 미리보기 (Space)',
    bullets: [
      '.md 파일에서 Space로 렌더링된 미리보기',
      '미리보기 팝업에서 Tab으로 편집 모드 전환',
    ],
  },
];

// ───────── 사이드바 ─────────
const SIDEBAR_SECTIONS = [
  {
    title: '즐겨찾기 폴더',
    bullets: [
      'OS 탐색기에서 폴더를 드래그하여 사이드바에 등록',
      '드래그로 카테고리 간 이동 가능 (@dnd-kit)',
      '우클릭 → 이름 변경 / 제거 / 폴더 태그 / 카테고리 이동',
    ],
  },
  {
    title: '카테고리',
    bullets: [
      '카테고리 헤더 + 버튼으로 새 카테고리 추가',
      '카테고리 색상 변경, 접기/펼치기',
      '카테고리 안의 즐겨찾기는 자동 정렬 + 수동 재배치',
    ],
  },
  {
    title: '빠른 접근',
    bullets: [
      '최근 항목 — 즐겨찾기 폴더 하위에서 최근 7일 수정 파일 모음',
      '데스크탑·다운로드 등 OS 표준 폴더 바로가기',
    ],
  },
  {
    title: '폴더 태그',
    bullets: [
      '즐겨찾기 우클릭 → 태그 설정 — 프로젝트별 색상 배지 표시',
      '여러 즐겨찾기에 같은 태그 부여하여 그룹화',
    ],
  },
  {
    title: '테마',
    bullets: [
      '사이드바 하단 톱니바퀴 → 테마 프리셋 / 커스텀 색상 (accent·배경 등)',
      '줌 레벨 변경으로 전체 UI 확대/축소',
    ],
  },
];

// ───────── 컴포넌트 ─────────

function ShortcutsTab() {
  return (
    <div className="space-y-5">
      {SHORTCUT_SECTIONS.map((section) => (
        <div key={section.title}>
          <h4 className="text-xs font-bold text-[var(--qf-accent)] mb-2 px-1 uppercase tracking-wide">
            {section.title}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {section.items.map((item) => (
              <div key={item.key} className="flex items-center gap-3 py-1 px-1">
                <kbd
                  className="shrink-0 min-w-[150px] text-center font-mono text-xs bg-[var(--qf-surface-2)] text-[var(--qf-text)] border border-[var(--qf-border)] rounded px-2 py-0.5"
                >
                  {item.key}
                </kbd>
                <span className="text-sm text-[var(--qf-muted)] leading-snug">
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

function SectionList({ sections }: { sections: { title: string; bullets: string[] }[] }) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="text-sm font-bold text-[var(--qf-accent)] mb-2 px-1">
            {section.title}
          </h4>
          <ul className="space-y-1.5">
            {section.bullets.map((bullet, idx) => (
              <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-[var(--qf-accent)] shrink-0 mt-1">&bull;</span>
                <span className="text-[var(--qf-muted)]">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<TabName>('단축키');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[88vh] bg-[var(--qf-surface)] border border-[var(--qf-border)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--qf-border)] bg-[var(--qf-surface-2)] shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-[var(--qf-text)]">도움말</h3>
            <p className="text-xs text-[var(--qf-muted)] mt-0.5">
              퀵폴더 위젯의 주요 기능과 단축키를 한눈에 확인하세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 탭 버튼 */}
        <div className="flex gap-1 px-5 pt-3 pb-2 border-b border-[var(--qf-border)] overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === '단축키' && <ShortcutsTab />}
          {activeTab === '파일 탐색기' && <SectionList sections={EXPLORER_SECTIONS} />}
          {activeTab === '미리보기 & 편집' && <SectionList sections={PREVIEW_SECTIONS} />}
          {activeTab === '이미지 도구' && <SectionList sections={IMAGE_TOOL_SECTIONS} />}
          {activeTab === '미디어 & 압축' && <SectionList sections={MEDIA_SECTIONS} />}
          {activeTab === '마크다운' && <SectionList sections={MARKDOWN_SECTIONS} />}
          {activeTab === '사이드바' && <SectionList sections={SIDEBAR_SECTIONS} />}
        </div>
      </div>
    </div>
  );
}
