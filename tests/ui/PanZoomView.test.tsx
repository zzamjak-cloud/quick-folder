import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import PanZoomView from '../../components/FileExplorer/ui/PanZoomView';

afterEach(cleanup);

const SRC = 'data:image/png;base64,AAAA';

describe('PanZoomView', () => {
  test('Tailwind preflight의 max-width 제약을 풀어 둔다', () => {
    // preflight의 `img { max-width: 100% }` 는 인라인 width 보다 우선한다. 풀지 않으면
    // 컨테이너보다 큰 이미지의 가로만 컨테이너 폭으로 잘려 가로로 찌그러진다.
    const { container } = render(
      <PanZoomView src={SRC} width={1007} height={613} initialFit="fit" alt="preview" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.style.maxWidth).toBe('none');
    expect(img!.style.maxHeight).toBe('none');
  });

  test('전달된 크기를 그대로 그려 비율을 보존한다', () => {
    const { container } = render(
      <PanZoomView src={SRC} width={1007} height={613} initialFit="actual" alt="preview" />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    // 배율은 transform 으로만 준다. width/height 를 각각 건드리면 비율이 깨진다.
    expect(img.style.width).toBe('1007px');
    expect(img.style.height).toBe('613px');
    expect(img.style.transform).toContain('scale(1)');
  });
});
