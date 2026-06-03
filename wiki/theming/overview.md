# 테마 & 스타일링

## 역할
테마 프리셋 선택, 커스텀 강조색 설정, CSS 변수 관리, 다크/라이트 판별을 담당한다.

## 위치
`hooks/useThemeManagement.ts`

## ThemeVars 타입 (types.ts)
```typescript
interface ThemeVars {
  bg: string          // 배경
  surface: string     // 패널 배경
  surface2: string    // 보조 표면
  surfaceHover: string
  border: string
  text: string
  muted: string       // 흐린 텍스트
  accent: string      // 강조색
  accentHover: string
  accent20: string    // 강조색 20% 투명도
  accent50: string    // 강조색 50% 투명도
}
```

## useThemeManagement exports
| 이름 | 설명 |
|------|------|
| `themeVars` | 현재 ThemeVars 값 |
| `isDark` | 다크 테마 여부 |
| `presetName` | 현재 프리셋 이름 |
| `customAccent` | 커스텀 강조색 |
| `applyPreset(name)` | 프리셋 적용 |
| `setCustomAccent(color)` | 커스텀 강조색 설정 |

## 내보내는 상수
```typescript
THEME_PRESETS        // 테마 프리셋 배열
TEXT_COLOR_PRESETS   // 텍스트 색상 프리셋
COLORS               // TEXT_COLOR_PRESETS 별칭
FOLDER_TEXT_COLORS   // 폴더 텍스트 색상 목록
```

## 유틸리티 함수
```typescript
normalizeHexColor(value: string): string
// Hex 색상 정규화 (3자리→6자리, # 접두사)

adjustColorForTheme(baseColor: string, theme: Theme): string
// 다크/라이트 테마에 맞게 색상 밝기 조정
```

## UI 컴포넌트
`components/ThemeSettingsModal.tsx` — 프리셋 선택·강조색 커스터마이징  
`components/ZoomModal.tsx` — 줌 레벨 설정

## CSS 적용 방식
ThemeVars 값을 인라인 스타일로 컴포넌트에 직접 주입. TailwindCSS utility 클래스와 혼용.

## 줌
`App.tsx` — CSS `transform: scale()` 또는 `zoom`으로 전체 UI 크기 조절.
