import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModelUrlModifier,
  getModelTextureFallbackPath,
} from '../components/FileExplorer/modelPreviewPaths.ts';

const modelPath = '/Users/woody/Library/CloudStorage/GoogleDrive-zzamjak@gmail.com/내 드라이브/JP_Project/Treenod/Project_CAT/90_Blender/Block(3D)/240618_Backup/Test/FBX/Bee.fbx';

test('FBX 내부의 오래된 절대 Texture 경로는 현재 FBX 형제 Texture 폴더로 보정한다', () => {
  const staleTextureUrl = 'asset://localhost/Users/woody/Library/CloudStorage/GoogleDrive-zzamjak@gmail.com/내%20드라이브/JP_Project/Treenod/Project_CAT/90_Blender/Block(3D)/240618_Backup/Test/FBX//Users/woody/Library/CloudStorage/Dropbox/Project/Treenod/Project_CAT/90_Blender/Block(3D)/Test/Texture/Bee.png';

  assert.equal(
    getModelTextureFallbackPath(modelPath, staleTextureUrl),
    '/Users/woody/Library/CloudStorage/GoogleDrive-zzamjak@gmail.com/내 드라이브/JP_Project/Treenod/Project_CAT/90_Blender/Block(3D)/240618_Backup/Test/Texture/Bee.png',
  );
});

test('FBX 텍스처 URL modifier는 보정된 로컬 경로를 asset URL로 바꾼다', () => {
  const modifier = createModelUrlModifier(modelPath, path => `asset://${path}`);

  assert.equal(
    modifier('/Users/woody/Library/CloudStorage/Dropbox/Project/Treenod/Project_CAT/90_Blender/Block(3D)/Test/Texture/Bee.png'),
    'asset:///Users/woody/Library/CloudStorage/GoogleDrive-zzamjak@gmail.com/내 드라이브/JP_Project/Treenod/Project_CAT/90_Blender/Block(3D)/240618_Backup/Test/Texture/Bee.png',
  );
});

test('이미 data URL인 텍스처는 보정하지 않는다', () => {
  const modifier = createModelUrlModifier(modelPath, path => `asset://${path}`);

  assert.equal(
    modifier('data:image/png;base64,abc'),
    'data:image/png;base64,abc',
  );
});
