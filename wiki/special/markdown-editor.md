# 마크다운 편집기

## 역할
`.md` 파일을 WYSIWYG 방식으로 편집한다. TipTap(ProseMirror) 기반 독립 모달.

## 위치
`components/FileExplorer/MarkdownEditor.tsx`

## 주요 기능
- MD→HTML 변환 (로드): `marked` 라이브러리
- HTML→MD 변환 (저장): `turndown` 라이브러리
- 자동 저장: 1.5초 디바운스
- 즉시 저장: `Ctrl+S`
- 복사 버튼: 순수 마크다운 텍스트 클립보드 복사

## TipTap 확장
```
StarterKit
TaskList
TaskItem
Placeholder
ArrowReplace (커스텀)  ← -> → / <- ← / <-> ↔ 자동 변환
```

## 단축키 격리 (중요)
글로벌 단축키가 편집기 내부로 침입하지 않도록 capture 단계에서 차단:
```typescript
document.addEventListener('keydown', handler, { capture: true })
e.stopImmediatePropagation()  // 글로벌 핸들러 도달 방지
```

## 열기 / 생성

| 방법 | 설명 |
|------|------|
| `.md` 파일 선택 후 `Enter` | 기존 파일 편집 |
| 빈 공간 우클릭 → "마크다운" | 새 .md 파일 생성 후 인라인 이름변경 |
| `Ctrl+Shift+M` | 마크다운 파일 생성 |

## 사용하는 Rust 명령
| 명령 | 시점 | 설명 |
|------|------|------|
| `read_text_file` | 열기 | MD 내용 로드 |
| `write_text_file` | 저장 | MD 내용 저장 |

## 주의사항
- `ModalShell` 미사용 — ESC·외부 클릭으로 직접 닫기 구현
- 저장 전 HTML→MD 변환 품질이 `turndown` 설정에 의존함. 복잡한 HTML 구조는 변환 손실 발생 가능.
