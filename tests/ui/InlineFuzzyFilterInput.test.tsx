import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import InlineFuzzyFilterInput from '../../components/FileExplorer/InlineFuzzyFilterInput';

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
});
