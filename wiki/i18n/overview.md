# 다국어 / 언어팩

QuickFolder는 자체 언어팩을 앱 안에 포함한다. 런타임 번역 API에 의존하지 않고, 앱 업데이트로 언어 리소스를 지속 개선한다.

## 기준 파일

| 파일 | 역할 |
|------|------|
| `utils/i18n.ts` | 공개 API, 언어 감지, DOM 현지화 브리지 |
| `utils/i18n/languageOptions.ts` | 지원 언어 코드, 국기, 기본 Locale prefix |
| `utils/i18n/types.ts` | 언어팩 공통 타입 |
| `utils/i18n/packs/ko.ts` | 한국어 기준 언어팩 |
| `utils/i18n/packs/en.ts` | 영어 언어팩, 레거시 한글 문자열 매핑, 패턴 매핑 |
| `utils/i18n/packs/index.ts` | 언어팩 레지스트리와 번역 키 타입 |
| `App.tsx` | 초기 언어 결정, 언어 변경 저장, 변경 후 새로고침 |
| `components/LanguageSettingsModal.tsx` | 국가별 국기 + 언어명 선택 UI |

## 언어 선택 규칙

1. 사용자가 언어를 직접 선택하면 `localStorage['qf_language']`에 저장한다.
2. 저장된 값이 있으면 OS Locale보다 사용자의 마지막 선택을 우선한다.
3. 저장된 값이 없으면 OS Locale을 기준으로 기본 언어를 감지한다.
4. 언어 변경 시 앱을 새로고침해서 모든 UI 문자열을 같은 언어로 다시 렌더링한다.
5. 자동 업데이트 이후에도 `qf_language` 키를 유지해 마지막 사용자 선택을 보존한다.

## 현재 지원 언어

| 코드 | 표시 | 기본 Locale |
|------|------|-------------|
| `ko` | 🇰🇷 한국어 | `ko-*` |
| `en` | 🇺🇸 English | `en-*` |

## 언어팩 구조

새 UI는 `translate(language, key)` 기반 키 번역을 우선 사용한다. 이미 존재하는 UI의 한글 문자열은 각 언어팩의 `legacyTextTranslations`와 `installDomLocalization()`으로 보완한다.

| 영역 | 처리 방식 |
|------|----------|
| 설정 팝업, 언어 모달 같은 신규 UI | 언어팩 `translations` 키 기반 번역 |
| 기존 React 렌더 문자열 | 언어팩 `legacyTextTranslations` 정확 매핑 |
| 조사·숫자·파일명 포함 문장 | 언어팩 `legacyPatterns` 정규식 매핑 |
| 툴팁·placeholder·aria-label | DOM attribute 현지화 |
| 사용자 파일명·경로·문서 내용·코드/마크다운 본문 | 번역하지 않음 |

## 누락 방지 체크리스트

언어를 추가하거나 UI 문구를 수정할 때는 아래 항목을 모두 확인한다.

1. `LANGUAGE_OPTIONS`에 `{ code, flag, nativeName, localePrefixes }`를 추가한다.
2. `utils/i18n/packs/{code}.ts`를 만들고 `translations`에 모든 키를 새 언어로 채운다.
3. 기존 한글 UI 문자열은 해당 언어팩의 `legacyTextTranslations`에 정확 매핑으로 추가한다.
4. 같은 의미라도 마침표, 조사, 띄어쓰기, 괄호가 다르면 별도 문자열로 추가한다.
5. 파일명·경로·숫자·확장자처럼 동적 값이 섞인 문장은 정규식 패턴으로 처리한다.
6. 사이드바, 탐색기 상단, 검색창, 우클릭 메뉴, 도움말, 툴팁, 토스트, 모달, 빈 상태 문구를 모두 확인한다.
7. `npm run build`를 통과시킨다.
8. 브라우저에서 `localStorage.qf_language`를 대상 언어로 설정하고 새로고침한다.
9. UI 텍스트, `title`, `aria-label`, `placeholder`에 원본 한글이 남지 않는지 확인한다.
10. `utils/i18n/packs/index.ts`의 `LANGUAGE_PACKS`에 새 언어팩을 등록한다.
11. 새 문자열을 추가한 기능의 위키 문서도 함께 갱신한다.

## 필수 점검 화면

| 화면/기능 | 확인 항목 |
|----------|----------|
| 사이드바 헤더 | 설정 버튼, 섹션 추가, 설정 팝업 메뉴 |
| 사이드바 빈 상태 | 등록 폴더 없음, 드래그 안내 |
| 언어 설정 | 국기, 언어명, 선택 상태 |
| 탐색기 상단 | 이름/날짜/형식 필터, 검색 버튼, placeholder |
| 전역 검색 | `Ctrl+F`, `Ctrl+Shift+F`, 검색어 입력, 빈 결과, 결과 액션 |
| 우클릭 메뉴 | 파일/폴더/빈 공간 메뉴, 하위 메뉴, 터미널 프리셋 |
| 도움말 | 모든 탭, 단축키, 기능 설명 |
| 미리보기/편집 모달 | 버튼, 안내문, 오류 문구 |
| 특수 도구 | 마크다운 편집기, 드로잉, 스프라이트 시트, Diff |
| 작업/알림 | 진행률 패널, 토스트, 확인/오류 모달 |

## 정적 누락 점검

아래 스크립트는 코드에서 발견한 한글 UI 후보 중 언어팩에 매핑되지 않은 문자열을 출력한다.

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.cwd();
function readI18nSources(dir) {
  let text = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) text += readI18nSources(file);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) text += fs.readFileSync(file, 'utf8') + '\n';
  }
  return text;
}
const mapText = fs.readFileSync(path.join(root, 'utils/i18n.ts'), 'utf8') + '\n' + readI18nSources(path.join(root, 'utils/i18n'));
const mapped = new Set([...mapText.matchAll(/^\s*'([^']*[가-힣][^']*)':\s*'/gm)].map(m => m[1]));
const skip = new Set(['node_modules', 'dist', '.git', 'src-tauri', 'release']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(file);
  }
}
walk(root);
const found = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const re = /(?:label|title|placeholder|aria-label|description):\s*(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`)/g;
  let match;
  while ((match = re.exec(source))) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\s+/g, ' ').trim();
    if (!/[가-힣]/.test(value)) continue;
    if (mapped.has(value)) continue;
    if (/\$\{navigator\.platform/.test(value)) continue;
    const rel = path.relative(root, file);
    if (!found.has(value)) found.set(value, new Set());
    found.get(value).add(rel);
  }
}
console.log(JSON.stringify([...found].map(([text, paths]) => ({ text, files: [...paths] })), null, 2));
process.exit(found.size ? 1 : 0);
NODE
```

## 브라우저 런타임 점검

언어 변경 후 실제 DOM에 남은 한글 텍스트와 속성을 확인한다. 사용자 파일명, 문서 본문, 코드 내용은 점검 결과에서 제외해서 판단한다.

```js
() => {
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent.trim();
    if (/[가-힣]/.test(value)) texts.push(value);
  }

  const attrs = [];
  document.querySelectorAll('*').forEach(element => {
    ['title', 'aria-label', 'placeholder'].forEach(attr => {
      const value = element.getAttribute(attr);
      if (value && /[가-힣]/.test(value)) attrs.push(`${attr}:${value}`);
    });
  });

  return { texts: [...new Set(texts)], attrs: [...new Set(attrs)] };
}
```

## 반복 누락 원인

이번 언어 대응에서 누락된 항목은 대부분 같은 의미의 문자열이 여러 표기로 존재했기 때문이다. 예를 들어 `검색어를 입력하세요`와 `검색어를 입력하세요.`, `폴더를 이곳으로 드래그하세요`와 `폴더를 이곳에 드래그하세요`는 각각 별도 매핑이 필요하다. 새 UI 문구를 추가할 때는 화면에 보이는 최종 문자열 기준으로 체크리스트를 통과시킨다.
