# 키보드 단축키

## 위치
`components/FileExplorer/hooks/useKeyboardShortcuts.ts`

## 전체 단축키 목록

### 탭
| 단축키 | 기능 |
|--------|------|
| `Ctrl+T` | 탭 복제 |
| `Ctrl+W` | 탭 닫기. 분할 화면에서는 마지막 탭 닫기 시 분할 해제 |
| `Ctrl+Alt+W` | 다른 탭 모두 닫기 |
| `Tab` | 다음 탭 |
| `Shift+Tab` | 이전 탭 |

### 내비게이션
| 단축키 | 기능 |
|--------|------|
| `Ctrl+F` | 현재 폴더 검색 |
| `Ctrl+Shift+F` | 전역 검색 |
| `Ctrl+Shift+G` | 폴더로 이동 |

### 파일 조작
| 단축키 | 기능 |
|--------|------|
| `F2` | 이름 변경 |
| `Delete` | 삭제 (휴지통, Windows) |
| `Backspace` / `Delete` | 삭제 (휴지통, Mac) |
| `Backspace` | 뒤로 가기 (선택 없을 때) |
| `Ctrl+D` | 복제 |
| `Ctrl+G` | 선택 파일 → 새 폴더로 그룹화 |
| `Ctrl+Alt+G` | 폴더 해제 (내용물 꺼내기) |
| `Ctrl+Z` | 실행취소 |
| `Ctrl+A` | 전체 선택 |
| `Enter` | 열기 / 마크다운 편집기 |

### 클립보드
| 단축키 | 기능 |
|--------|------|
| `Ctrl+C` | 복사 |
| `Ctrl+X` | 잘라내기 |
| `Ctrl+V` | 붙여넣기 |
| `Ctrl+Shift+V` | 클립보드 이미지 → PNG 저장 |
| `Ctrl+Alt+C` | 경로 복사 |

### 생성
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Shift+N` | 새 폴더 |
| `Ctrl+Shift+M` | 마크다운 파일 생성 |

### 처리
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Shift+P` | 비디오 압축 |
| `Ctrl+Shift+Z` | ZIP 압축 |
| `Ctrl+Shift+Alt+Z` | ZIP 해제 |
| `Ctrl+Shift+T` | 태그 추가 |
| `Ctrl+Shift+Alt+F` | 폰트 병합 (2개 선택) |

### 외부 앱
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Alt+O` | Photoshop에서 열기 |
| `Space` | 미리보기 |

### 뷰
| 단축키 | 기능 |
|--------|------|
| `Ctrl+1` | 그리드 뷰 |
| `Ctrl+2` | 컬럼 뷰 |
| `Ctrl+3` | 리스트 뷰 |
| `Ctrl+4` | 상세 뷰 |
| `Ctrl+0` | 줌 초기화 |
| `Ctrl++` | 줌 확대 |
| `Ctrl+-` | 줌 축소 |
| `Ctrl+L` | 좌우 분할 → 상하 분할 → 분할 해제 |

---

## 충돌 방지 규칙 (신규 단축키 추가 시 필수)

### 원칙
`Ctrl+T` 와 `Ctrl+Shift+T` 는 별개의 단축키다. 수식키를 명시적으로 체크하지 않으면 상위 조합이 하위 조합을 가로챈다.

```typescript
// ✅ 올바름
if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyT') { /* Ctrl+T */ }
if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyT')  { /* Ctrl+Shift+T */ }

// ❌ 잘못됨 — Ctrl+Shift+T도 여기에 걸림
if (ctrl && e.code === 'KeyT') { /* ... */ }
```

### 추가 체크리스트
1. `grep "e.code === 'Key?'"` 로 같은 키 기존 단축키 확인
2. 기존 단축키에 `!e.shiftKey`, `!e.altKey` 가드 없으면 추가
3. 새 단축키는 수식키 조합 모두 명시

## 마크다운 편집기 단축키 격리
`MarkdownEditor.tsx` — capture 단계 리스너로 글로벌 단축키 차단:
```typescript
document.addEventListener('keydown', handler, { capture: true })
e.stopImmediatePropagation()
```
