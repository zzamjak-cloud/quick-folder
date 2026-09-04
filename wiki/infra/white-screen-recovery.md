# 흰 화면 자동 복구 (WebView2 캐시 손상)

## 증상

앱을 실행하면 **창은 뜨는데 내용이 흰 화면**으로 남는다.

- 프로세스는 살아 있고 창 핸들도 정상, 응답도 한다
- Rust 로그(`%LOCALAPPDATA%\com.quickfolder.widget\logs`)에는 아무 에러도 없다
- 같은 `dist` 번들을 브라우저에서 열면 정상 렌더링된다

## 원인

`%LOCALAPPDATA%\com.quickfolder.widget\EBWebView` 안의 **V8 code cache / HTTP cache** 가
무효 상태로 남으면 스크립트가 아예 실행되지 않는다.

WebView2 런타임 자동 업데이트와 앱 업데이트(번들 해시 변경)가 겹치는 시점에 발생하기 쉽다.
번들·앱 코드 문제가 아니므로 재설치해도 재현된다 — 프로필을 갈아야 풀린다.

**localStorage 는 원인이 아니다.** 카테고리·탭·창 상태·테마가 전부 거기 저장되므로
진단 중에도 절대 지우지 말 것.

## 자동 복구 동작

`src-tauri/src/modules/system_ops/webview_recovery.rs`

| 순서 | 동작 |
|------|------|
| 1 | 프론트엔드 마운트 시 `mark_frontend_ready` 호출 (`index.tsx` 의 `ReadySignal`) |
| 2 | 워치독이 15초 안에 신호를 못 받으면 `.webview-recovery-pending` 마커를 남기고 재시작 |
| 3 | 다음 부팅 `run()` 최상단에서 마커를 소비하고 캐시 폴더만 삭제 후 진행 |
| 4 | 정상 기동이 확인되면 `mark_frontend_ready` 가 마커를 정리 |

이력은 `%LOCALAPPDATA%\com.quickfolder.widget\webview-recovery.log` 에 남는다.
릴리스 빌드에는 로그 플러그인이 없어 `log::` 매크로가 무음이기 때문이다.

## 회귀 주의

**캐시 삭제는 반드시 `run()` 최상단에서 해야 한다.**
웹뷰가 살아 있는 동안에는 캐시 폴더가 잠겨 삭제가 실패한다.
`setup()` 훅은 이미 창·웹뷰가 만들어진 뒤라 늦다.

**삭제 대상에 사용자 데이터를 넣지 말 것.**
`CACHE_RELATIVE_PATHS` 에는 파생 캐시만 넣는다. `Local Storage`, `Session Storage`,
`IndexedDB`, `WebStorage`, `Preferences`, `Local State` 는 금지 — 테스트가 이를 강제한다.

**준비 신호는 direct 레인으로 보내야 한다.**
`systemCommands.markFrontendReady` 가 일반 큐를 타면 큐가 막혔을 때
멀쩡한 앱이 재시작된다. `tests/tauriInvoke.test.ts` 가 이를 막는다.

**재시작은 1회로 제한된다.**
`.webview-recovery-done` 마커가 있으면 워치독은 재시작하지 않고 기록만 남긴다.
캐시를 지워도 흰 화면이면 원인이 다른 곳에 있다는 뜻이다.

**Windows 릴리스 빌드에서만 동작한다.**
`EBWebView` 는 WebView2 전용이고, 디버그 빌드에서는 dev 서버가 늦게 뜨는 상황을
장애로 오인하지 않도록 워치독을 띄우지 않는다.

## 수동 복구 (자동 복구가 안 먹을 때)

1. 앱과 `msedgewebview2` 프로세스를 모두 종료
2. `EBWebView` 폴더를 **삭제하지 말고 이름만 변경** (예: `EBWebView_bak`)
3. 앱 실행 → 정상 렌더링 확인
4. 백업의 `Default\Local Storage` 를 새 프로필의 `Default` 아래로 복사 → 설정 복원

## 관련 위키
- [overview.md](overview.md) — 빌드 설정
- [testing.md](testing.md) — 테스트 실행
- [../rust/overview.md](../rust/overview.md) — Rust 모듈 구조
