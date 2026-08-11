import test from 'node:test';
import assert from 'node:assert/strict';

import { getGoogleDriveLocalizedVariants } from '../utils/pathUtils.ts';

const MOUNT = '/Users/woody/Library/CloudStorage/GoogleDrive-user@example.com';

test('영어 My Drive 경로 → 한국어 내 드라이브 후보 생성', () => {
  const variants = getGoogleDriveLocalizedVariants(`${MOUNT}/My Drive/Projects/Assets`);
  assert.ok(variants.includes(`${MOUNT}/내 드라이브/Projects/Assets`));
});

test('한국어 공유 드라이브 경로 → 영어 Shared drives 후보 생성', () => {
  const variants = getGoogleDriveLocalizedVariants(`${MOUNT}/공유 드라이브/팀문서`);
  assert.ok(variants.includes(`${MOUNT}/Shared drives/팀문서`));
});

test('마운트 루트 자체(하위 세그먼트 없음)는 후보 없음', () => {
  assert.deepEqual(getGoogleDriveLocalizedVariants(MOUNT), []);
});

test('구글 드라이브 경로가 아니면 후보 없음', () => {
  assert.deepEqual(getGoogleDriveLocalizedVariants('/Users/woody/My Drive-ish/문서'), []);
});

test('특수 폴더명 세그먼트가 없으면 후보 없음', () => {
  assert.deepEqual(getGoogleDriveLocalizedVariants(`${MOUNT}/RandomFolder/Sub`), []);
});

test('원본 경로 자신은 후보에 포함되지 않음', () => {
  const path = `${MOUNT}/My Drive`;
  assert.ok(!getGoogleDriveLocalizedVariants(path).includes(path));
});

test('Windows 가상 드라이브 경로도 구분자 보존하며 치환', () => {
  const variants = getGoogleDriveLocalizedVariants('G:\\My Drive\\문서');
  assert.ok(variants.includes('G:\\내 드라이브\\문서'));
});

// macOS 파일시스템은 한글 경로를 NFD(자모 분해형)로 반환한다.
// NFC 리터럴과 정규화 없이 비교하면 매칭이 실패해 자가 치유가 전혀 동작하지 않는다. (v1.0.7 실사용 회귀)
test('NFD로 저장된 한국어 세그먼트도 후보 생성', () => {
  const nfdPath = `${MOUNT}/${'내 드라이브'.normalize('NFD')}/Jinpyoung`;
  const variants = getGoogleDriveLocalizedVariants(nfdPath);
  assert.ok(variants.includes(`${MOUNT}/My Drive/Jinpyoung`));
});

test('NFD 다른 컴퓨터 세그먼트 → Other computers 후보 생성', () => {
  const nfdPath = `${MOUNT}/${'다른 컴퓨터'.normalize('NFD')}/회사 컴퓨터`;
  const variants = getGoogleDriveLocalizedVariants(nfdPath);
  assert.ok(variants.some(v => v.startsWith(`${MOUNT}/Other computers/`)));
});
