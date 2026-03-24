import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './use-debounce';

describe('useDebounce Hook', () => {
  // 清除所有定时器
  afterEach(() => {
    jest.clearAllTimers();
  });

  test('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial value', 500));
    expect(result.current).toBe('initial value');
  });

  test('should debounce value changes', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    });

    // 初始值
    expect(result.current).toBe('initial');

    // 更新值
    rerender({ value: 'updated', delay: 500 });
    // 立即检查，值尚未更新
    expect(result.current).toBe('initial');

    // 快进 499ms，仍未更新
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current).toBe('initial');

    // 快进 1ms，到达延迟时间
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated');
  });

  test('should cancel previous timer when value changes rapidly', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'first', delay: 500 },
    });

    // 第一次更新
    rerender({ value: 'second', delay: 500 });

    // 快进 300ms 后再次更新
    act(() => {
      jest.advanceTimersByTime(300);
    });
    rerender({ value: 'third', delay: 500 });

    // 再快进 499ms（总共 799ms），值仍为初始值
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current).toBe('first');

    // 再快进 1ms（总共 800ms），值更新为第三次的值
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('third');
  });

  test('should handle different delay values', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 100 },
    });

    rerender({ value: 'fast', delay: 100 });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('fast');

    rerender({ value: 'slow', delay: 1000 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe('fast');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe('slow');
  });

  test('should handle different data types (number, boolean, object)', () => {
    jest.useFakeTimers();

    // 测试数字类型
    const { result: numberResult, rerender: numberRerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      {
        initialProps: { value: 42 },
      },
    );
    numberRerender({ value: 100 });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(numberResult.current).toBe(100);

    // 测试布尔类型
    const { result: booleanResult, rerender: booleanRerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      {
        initialProps: { value: true },
      },
    );
    booleanRerender({ value: false });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(booleanResult.current).toBe(false);

    // 测试对象类型
    const initialObj = { name: 'test', value: 123 };
    const updatedObj = { name: 'updated', value: 456 };
    const { result: objectResult, rerender: objectRerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      {
        initialProps: { value: initialObj },
      },
    );
    objectRerender({ value: updatedObj });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(objectResult.current).toEqual(updatedObj);
  });

  test('should handle zero delay', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 0), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current).toBe('updated');
  });

  test('should handle very large delay', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 1000 },
    });

    rerender({ value: 'delayed', delay: 1000 });
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current).toBe('initial');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('delayed');
  });

  test('should clean up timer when component unmounts', () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const { unmount, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    });

    rerender({ value: 'updated', delay: 500 });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
