# Tauri 자동 업데이트 설정 - 빠른 가이드

다른 Tauri 프로젝트에 QuickFolder의 자동 업데이트 시스템을 적용하는 빠른 가이드입니다.

## 🚀 한 번에 설정하기 (5분)

### 1단계: 파일 복사

```bash
# 새 프로젝트 디렉토리로 이동
cd /path/to/your-tauri-project

# QuickFolder에서 필요한 파일 복사
cp /path/to/quick-folder/scripts/setup-auto-update.sh ./scripts/
cp -r /path/to/quick-folder/hooks ./
cp /path/to/quick-folder/components/UpdateModal.tsx ./components/

# (선택) 타입 정의 복사
# types.ts에 UpdateInfo, UpdateStatus 추가
```

### 2단계: 자동 설정 실행

```bash
bash scripts/setup-auto-update.sh "MyApp" "YourGitHubUsername" "your-repo-name"
```

**스크립트가 자동으로 수행하는 작업:**
- ✅ npm 패키지 설치 (`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`)
- ✅ Cargo 의존성 추가 (`tauri-plugin-updater`)
- ✅ 모든 Tauri 패키지 버전 동기화 (중요!)
- ✅ 설정 방법 안내 출력

### 3단계: 서명 키 생성

```bash
npm run tauri signer generate -- -w ~/.tauri/myapp-update.key
```

**출력된 공개키를 복사하세요!** 예:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6...
```

### 4단계: Rust 코드 수정

**`src-tauri/src/lib.rs`**에 플러그인 초기화 추가:

```rust
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    // 다른 플러그인들...
    .plugin(tauri_plugin_updater::Builder::new().build())  // 이 줄 추가
    .invoke_handler(tauri::generate_handler![...])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

### 5단계: 설정 파일 업데이트

**`src-tauri/tauri.conf.json`**에 updater 설정 추가:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/YourUsername/your-repo/releases/latest/download/latest.json"
      ],
      "pubkey": "여기에_3단계에서_복사한_공개키_붙여넣기",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

**`src-tauri/capabilities/default.json`**에 권한 추가:

```json
{
  "permissions": [
    // 기존 권한들...
    "updater:default",
    "updater:allow-check",
    "updater:allow-download",
    "updater:allow-install"
  ]
}
```

### 6단계: 프론트엔드 통합

**`types.ts`**에 타입 추가:

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

**`App.tsx`** (또는 main entry)에 통합:

```typescript
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { UpdateModal } from './components/UpdateModal';

function App() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const { updateStatus, isDownloading, downloadProgress, downloadAndInstall } =
    useAutoUpdate(true, (error) => console.error(error));

  useEffect(() => {
    if (updateStatus.available && updateStatus.info) {
      setShowUpdateModal(true);
    }
  }, [updateStatus]);

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
          onInstall={downloadAndInstall}
          onSkip={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
```

### 7단계: GitHub Actions 워크플로우 설정

**`.github/workflows/release.yml`** 생성:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

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

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install dependencies
        run: npm install

      - name: Build with updater
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'MyApp v__VERSION__'
          releaseBody: '새로운 버전이 출시되었습니다!'
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          args: --target ${{ matrix.target }}
```

### 8단계: GitHub Secrets 설정

1. GitHub Repository → Settings → Secrets and variables → Actions
2. "New repository secret" 클릭
3. **TAURI_SIGNING_PRIVATE_KEY**:
   ```bash
   # private key 파일 내용 확인
   cat ~/.tauri/myapp-update.key

   # 전체 내용을 복사해서 Secret에 붙여넣기
   ```

### 9단계: 첫 릴리스 테스트

```bash
# 버전 업데이트 (3개 파일)
# - package.json: "version": "1.0.0"
# - src-tauri/Cargo.toml: version = "1.0.0"
# - src-tauri/tauri.conf.json: "version": "1.0.0"

git add .
git commit -m "feat: 자동 업데이트 시스템 추가"
git tag v1.0.0
git push origin main --tags
```

### 10단계: 릴리스 배포

1. GitHub Actions 빌드 완료 대기 (~10-15분)
2. GitHub Releases에서 Draft Release 확인
3. 릴리스 노트 편집 (선택)
4. **"Publish release"** 클릭
5. 기존 앱에서 자동 업데이트 테스트!

---

## ⚠️ 주의사항

### 버전 불일치 문제 (자주 발생!)

**에러 발생 시:**
```
Found version mismatched Tauri packages...
```

**해결 방법:**
```bash
# 모든 Tauri 패키지 최신 버전으로 업데이트
npm install @tauri-apps/api@latest \
            @tauri-apps/cli@latest \
            @tauri-apps/plugin-updater@latest

# Cargo 의존성 업데이트
cd src-tauri && cargo update && cd ..
```

### Private Key 보안

- ❌ **절대** Git에 커밋하지 말 것
- ✅ GitHub Secrets에만 저장
- ✅ `.gitignore`에 `*.key` 추가

### 개발 모드

- 개발 모드(`npm run tauri dev`)에서는 업데이트 체크가 **자동으로 건너뛰어집니다**
- 프로덕션 빌드에서만 작동

---

## 📚 추가 자료

- **상세 가이드**: [AUTO_UPDATE_GUIDE.md](./AUTO_UPDATE_GUIDE.md)
- **공식 문서**: [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- **GitHub Actions**: [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action)

---

## ✅ 체크리스트

- [ ] 자동 설정 스크립트 실행 완료
- [ ] 서명 키 생성 완료
- [ ] 공개키를 tauri.conf.json에 설정
- [ ] lib.rs에 플러그인 초기화 추가
- [ ] capabilities에 권한 추가
- [ ] 프론트엔드 통합 완료
- [ ] GitHub Actions 워크플로우 생성
- [ ] GitHub Secrets 설정 완료
- [ ] 로컬 빌드 테스트 (`npm run tauri build`)
- [ ] 첫 릴리스 태그 푸시
- [ ] GitHub Actions 빌드 성공 확인
- [ ] Release 배포 완료
- [ ] 자동 업데이트 테스트 완료

---

## 🎯 다음 릴리스부터는

```bash
# 1. 버전 업데이트 (3개 파일 동기화)
# 2. 커밋 및 태그
git add .
git commit -m "chore: release v1.0.1"
git tag v1.0.1
git push origin main --tags

# 3. GitHub Actions 자동 빌드
# 4. Draft Release 검토 및 Publish
# 5. 기존 앱에서 자동 업데이트!
```

**끝! 이제 사용자는 앱을 실행하면 자동으로 업데이트를 확인하고 설치할 수 있습니다.** 🎉
