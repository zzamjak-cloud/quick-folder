import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EXT_ICON, FileTypeIcon } from '../../components/FileExplorer/fileUtils';
import { SKIP_NATIVE_EXTS } from '../../components/FileExplorer/hooks/useNativeIcon';

describe('확장자 전용 아이콘 매핑', () => {
  it('EXT_ICON의 모든 확장자는 네이티브 셸 아이콘을 건너뛴다', () => {
    // 누락되면 OS 셸 아이콘이 우선 표시돼 전용 SVG가 보이지 않는다(회귀 주의)
    const missing = Object.keys(EXT_ICON).filter(ext => !SKIP_NATIVE_EXTS.has(ext));
    expect(missing).toEqual([]);
  });

  it('주요 확장자는 lucide 기본 아이콘이 아닌 전용 SVG를 렌더한다', () => {
    for (const name of ['a.py', 'a.js', 'a.cs', 'a.html', 'a.json', 'a.toml', 'a.ps1', 'a.bat', 'a.txt', 'a.md', 'a.db', 'a.bin', 'a.unitypackage']) {
      const { container } = render(<FileTypeIcon fileType="code" size={32} fileName={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).toBeTruthy();
      // 전용 아이콘은 128 뷰박스 기준으로 작성됨 (lucide는 0 0 24 24)
      expect(svg!.getAttribute('viewBox'), name).toBe('0 0 128 128');
    }
  });
});
