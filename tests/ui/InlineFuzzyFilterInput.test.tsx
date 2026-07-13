import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import InlineFuzzyFilterInput from '../../components/FileExplorer/InlineFuzzyFilterInput';
import { isFuzzyFilterBlocked } from '../../components/FileExplorer/hooks/useInlineFuzzyFilter';

describe('InlineFuzzyFilterInput', () => {
  test('비활성 상태에서는 input을 렌더링하지 않는다', () => {
    render(
      <InlineFuzzyFilterInput
        value=""
        enabled={false}
        isMac={false}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('파일 퍼지 검색')).not.toBeInTheDocument();
  });

  test('입력 변경과 Escape 초기화 콜백을 전달한다', () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <InlineFuzzyFilterInput
        value=""
        enabled
        isMac={false}
        onChange={onChange}
        onClear={onClear}
      />,
    );

    const input = screen.getByLabelText('파일 퍼지 검색');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('abc');
    expect(onChange).toHaveBeenCalledWith('abc');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('aria modal dialog가 열려 있으면 퍼지 필터를 차단한다', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(isFuzzyFilterBlocked()).toBe(true);
    document.body.innerHTML = '';
  });

  test('HWP 미리보기 팝업이 열려 있으면 퍼지 필터를 차단한다', () => {
    document.body.innerHTML = '<div data-hwp-preview="true"></div>';
    expect(isFuzzyFilterBlocked()).toBe(true);
    document.body.innerHTML = '';
  });
});
