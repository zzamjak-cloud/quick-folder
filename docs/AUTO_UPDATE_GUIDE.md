# Tauri 자동 업데이트 시스템 완전 가이드

QuickFolder 프로젝트에 구현된 자동 업데이트 시스템을 다른 Tauri 프로젝트에 적용하는 방법을 설명합니다.

## 빠른 시작 (Quick Start)

```bash
# QuickFolder 프로젝트에서 스크립트 복사
cp /path/to/quick-folder/scripts/setup-auto-update.sh .
cp -r /path/to/quick-folder/hooks .
cp /path/to/quick-folder/components/UpdateModal.tsx ./components/

# 자동 설정 실행
bash setup-auto-update.sh "MyApp" "GitHubUsername" "RepoName"

# 수동 단계 (스크립트 완료 후)
# 1. src-tauri/src/lib.rs에 플러그인 추가
# 2. App.tsx에 useAutoUpdate 훅 통합
# 3. GitHub Secrets 설정
# 4. 첫 릴리스 테스트
```

## 목차
1. [사전 요구사항](#사전-요구사항)
2. [설치 및 설정](#설치-및-설정)
3. [워크플로우](#워크플로우)
4. [트러블슈팅](#트러블슈팅)
5. [FAQ](#faq)

## 사전 요구사항

- Tauri 2.x 프로젝트
- GitHub 저장소
- Node.js 18+
- Rust 1.77.2+

## 설치 및 설정

### 자동 설정 (권장)

QuickFolder 프로젝트의 스크립트를 사용:

```bash
# QuickFolder에서 스크립트 복사
cp /path/to/quick-folder/scripts/setup-auto-update.sh .

# 실행
bash setup-auto-update.sh "MyApp" "GitHubUsername" "RepoName"
```

### 수동 설정

#### 1. 플러그인 설치

**npm 패키지:**
```bash
npm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

**Cargo 의존성:**
```bash
cd src-tauri
cargo add tauri-plugin-updater@2
```

#### 2. 서명 키 생성

```bash
npm run tauri signer generate -- -w ~/.tauri/myapp-update.key
```

출력된 공개키를 복사하세요. 예:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6...
```

#### 3. tauri.conf.json 설정

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

**주요 설정:**
- `endpoints`: latest.json 파일 URL (GitHub Releases 또는 CDN)
- `pubkey`: 생성한 공개키
- `windows.installMode`: `passive` (자동 설치) 또는 `basicUi` (진행률 UI)

#### 4. Cargo.toml 의존성 확인

`src-tauri/Cargo.toml`에 다음이 추가되었는지 확인:

```toml
[dependencies]
tauri-plugin-updater = "2"
```

#### 5. Rust 초기화 (lib.rs)

`src-tauri/src/lib.rs`의 `run()` 함수에 플러그인 초기화 추가:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    // 다른 플러그인들...
    .plugin(tauri_plugin_updater::Builder::new().build())  // 추가
    .invoke_handler(tauri::generate_handler![...])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

#### 6. Capabilities 권한 추가

`src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "core:default",
    // 기존 권한들...
    "updater:default",
    "updater:allow-check",
    "updater:allow-download",
    "updater:allow-install"
  ]
}
```

#### 7. 프론트엔드 구현

**types.ts에 타입 추가:**
```typescript
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface UpdateStatus {
  available: boolean;
  info?: UpdateInfo;
  error?: string;
}
```

**hooks/useAutoUpdate.ts 생성:**
QuickFolder의 `hooks/useAutoUpdate.ts` 파일을 복사하거나 참고하여 작성.

**components/UpdateModal.tsx 생성:**
QuickFolder의 `components/UpdateModal.tsx` 파일을 복사하거나 참고하여 작성.

**App.tsx (또는 main entry) 통합:**
```typescript
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { UpdateModal } from './components/UpdateModal';

function App() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const {
    updateStatus,
    isDownloading,
    downloadProgress,
    downloadAndInstall,
  } = useAutoUpdate(true, (error) => {
    // 에러 처리
    console.error('Update error:', error);
  });

  useEffect(() => {
    if (updateStatus.available && updateStatus.info) {
      setShowUpdateModal(true);
    }
  }, [updateStatus]);

  const handleInstall = async () => {
    await downloadAndInstall();
  };

  return (
    <div>
      {/* 앱 UI */}

      {updateStatus.info && (
        <UpdateModal
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          updateInfo={updateStatus.info}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          onInstall={handleInstall}
          onSkip={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
```

#### 8. GitHub Actions 설정

`.github/workflows/release.yml` 생성 또는 수정:

```yaml
name: Release Build

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

          - platform: macos-latest
            target: aarch64-apple-darwin

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        run: npm install

      - name: Build Tauri app with updater
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'MyApp v__VERSION__'
          releaseBody: |
            새로운 버전이 출시되었습니다!
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          args: --target ${{ matrix.target }}
```

**주요 설정:**
- `includeUpdaterJson: true` - latest.json 자동 생성
- `releaseDraft: true` - Draft Release 생성 (수동 배포)

#### 9. GitHub Secrets 설정

GitHub Repository → Settings → Secrets and variables → Actions:

| Secret 이름 | 값 |
|------------|-----|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/myapp-update.key` 파일 내용 전체 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 키 생성 시 설정한 비밀번호 (선택) |

**설정 방법:**
1. `cat ~/.tauri/myapp-update.key` 명령으로 내용 확인
2. GitHub Repository → Settings → Secrets → "New repository secret"
3. 이름: `TAURI_SIGNING_PRIVATE_KEY`
4. 값: 키 파일 내용 전체 복사-붙여넣기

## 워크플로우

### 개발 → 릴리스 프로세스

#### 1. 개발 및 테스트

```bash
npm run tauri dev
```

#### 2. 버전 업데이트

3개 파일의 버전을 동기화:
- `package.json`: `"version": "1.0.1"`
- `src-tauri/Cargo.toml`: `version = "1.0.1"`
- `src-tauri/tauri.conf.json`: `"version": "1.0.1"`

#### 3. 커밋 및 태그

```bash
git add .
git commit -m "chore: release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

#### 4. GitHub Actions 자동 빌드

- Windows + macOS 동시 빌드
- 코드 서명
- latest.json 생성
- Draft Release 생성

#### 5. 릴리스 배포

1. GitHub Releases에서 Draft 확인
2. 릴리스 노트 편집
3. "Publish release" 클릭

#### 6. 사용자 업데이트

- 기존 앱이 자동으로 업데이트 감지 (앱 시작 후 3초)
- 모달 표시 → 다운로드 → 설치 → 재시작

## 트러블슈팅

### **중요: 버전 불일치 오류** ⚠️

**에러 메시지:**
```
Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases:
tauri (v2.9.5) : @tauri-apps/api (v2.10.1)
tauri-plugin-updater (v2.9.0) : @tauri-apps/plugin-updater (v2.10.0)
```

**원인:**
- npm 패키지와 Rust crate의 major/minor 버전이 일치하지 않음
- 일부 패키지만 업데이트되어 버전이 뒤섞임

**해결 방법 1: 모든 패키지 최신 버전으로 업데이트 (권장)**

```bash
# npm 패키지 업데이트
npm install @tauri-apps/api@latest \
            @tauri-apps/cli@latest \
            @tauri-apps/plugin-updater@latest \
            @tauri-apps/plugin-dialog@latest \
            @tauri-apps/plugin-opener@latest \
            @tauri-apps/plugin-clipboard-manager@latest

# Cargo 의존성 업데이트
cd src-tauri
cargo update
cd ..
```

**해결 방법 2: Cargo.toml에서 버전 명시적 지정**

`src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri = { version = "2.10", features = [] }  # npm @tauri-apps/api 버전과 일치
tauri-plugin-updater = "2.10"  # npm 버전과 일치
```

**해결 방법 3: 자동화 스크립트 사용**

```bash
# setup-auto-update.sh 스크립트가 자동으로 버전 동기화
bash setup-auto-update.sh "MyApp" "username" "repo"
```

**버전 확인 명령어:**

```bash
# npm 패키지 버전 확인
npm list --depth=0 | grep @tauri-apps

# Cargo 패키지 버전 확인
cd src-tauri && cargo tree | grep tauri
```

### "No updates available" 오류

**원인:**
- latest.json URL이 잘못됨
- GitHub Release가 Draft 상태
- 버전이 동일하거나 낮음

**해결:**
```bash
# tauri.conf.json의 endpoints 확인
# GitHub Release를 Publish 상태로 변경
# 버전 번호 확인 (SemVer 형식)
```

### "Signature verification failed" 오류

**원인:**
- 공개키와 비밀키 불일치
- 코드 서명 실패

**해결:**
```bash
# 키 재생성
npm run tauri signer generate -- -w ~/.tauri/myapp-update.key

# GitHub Secrets 업데이트
# tauri.conf.json의 pubkey 업데이트
```

### macOS "App is damaged" 오류

**원인:**
- Apple 코드 서명 없음 (Gatekeeper)

**해결 (사용자 안내):**
```bash
xattr -cr /Applications/YourApp.app
```

또는 Apple Developer 코드 서명 설정 (유료):
- Apple Developer 계정 필요 ($99/year)
- Developer ID Application 인증서
- Notarization 필요

### 개발 모드에서 업데이트 체크 안 됨

**원인:**
- `import.meta.env.DEV` 체크로 개발 모드에서는 건너뜀

**해결:**
```typescript
// useAutoUpdate.ts에서 조건 제거 (테스트용)
useEffect(() => {
  if (autoCheckOnMount) {
    // if (import.meta.env.DEV) return;  // 주석 처리
    const timer = setTimeout(checkForUpdate, 3000);
    return () => clearTimeout(timer);
  }
}, [autoCheckOnMount, checkForUpdate]);
```

## FAQ

### Q: Pre-release 업데이트 지원?

A: tauri.conf.json에 채널 설정:
```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://..."],
      "pubkey": "...",
      "channel": "beta"
    }
  }
}
```

### Q: 다운로드 실패 시 재시도?

A: `useAutoUpdate.ts`에 재시도 로직 추가:
```typescript
const retryDownload = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await downloadAndInstall();
      break;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
};
```

### Q: Linux 지원?

A: Tauri Updater는 Linux에서 제한적 지원:
- AppImage 형식은 자동 업데이트 미지원
- 사용자가 수동으로 다운로드 및 설치 필요

### Q: CDN 사용?

A: endpoints를 CDN URL로 변경:
```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://cdn.example.com/myapp/latest.json"
      ]
    }
  }
}
```

GitHub Actions에서 latest.json을 CDN에 업로드하는 단계 추가 필요.

### Q: 필수 업데이트 강제?

A: UpdateModal에서 "나중에" 버튼 제거 또는 비활성화:
```typescript
// UpdateModal.tsx
{!updateInfo.required && (
  <Button onClick={onSkip}>나중에</Button>
)}
```

latest.json에 커스텀 필드 추가 가능 (Tauri에서 공식 지원 안 함, 직접 파싱 필요).

## 참고 자료

**Tauri 공식 문서:**
- [Updater Plugin v2.x](https://v2.tauri.app/plugin/updater/)
- [JavaScript API Reference](https://v2.tauri.app/reference/javascript/updater/)
- [GitHub Actions Pipeline](https://v2.tauri.app/distribute/pipelines/github/)

**커뮤니티 가이드:**
- [Tauri v2 Automatic Updates - Ratul's Blog](https://ratulmaharaj.com/posts/tauri-automatic-updates/)
- [How to make automatic updates work with Tauri v2 and GitHub](https://thatgurjot.com/til/tauri-auto-updater/)

**GitHub:**
- [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action)
- [tauri-plugin-updater Repository](https://github.com/tauri-apps/tauri-plugin-updater)

---

## 체크리스트

릴리스 전:
- [ ] 플러그인 설치 완료
- [ ] 서명 키 생성 완료
- [ ] tauri.conf.json 설정 완료
- [ ] lib.rs 플러그인 초기화 완료
- [ ] capabilities 권한 추가 완료
- [ ] 프론트엔드 구현 완료
- [ ] GitHub Actions 워크플로우 설정 완료
- [ ] GitHub Secrets 설정 완료
- [ ] 로컬 빌드 테스트 (`npm run tauri build`)

첫 릴리스:
- [ ] 버전 업데이트 (3개 파일 동기화)
- [ ] 커밋 및 태그 푸시
- [ ] GitHub Actions 빌드 성공 확인
- [ ] Draft Release 생성 확인
- [ ] latest.json 파일 확인
- [ ] Release Publish

업데이트 테스트:
- [ ] 이전 버전 앱 설치
- [ ] 앱 시작 시 업데이트 모달 표시 확인
- [ ] 다운로드 진행률 확인
- [ ] 설치 및 재시작 확인
- [ ] 새 버전으로 업데이트 확인
