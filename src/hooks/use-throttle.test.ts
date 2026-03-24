import { renderHook, act } from '@testing-library/react';
import { useThrottle } from './use-throttle';

describe('useThrottle Hook', () => {
  it('returns initial value immediately', () => {
    const initialValue = 10;
    const delay = 100;

    const { result } = renderHook(() => useThrottle(initialValue, delay));
    expect(result.current).toBe(initialValue);
  });

  it('returns throttled value after delay', () => {
    jest.useFakeTimers();

    const initialValue = 10;
    const delay = 100;

    const { result, rerender } = renderHook((value) => useThrottle(value, delay), {
      initialProps: initialValue,
    });

    // Update value immediately
    rerender(20);
    expect(result.current).toBe(initialValue); // Should still be initial value

    // Fast forward time
    act(() => {
      jest.advanceTimersByTime(delay);
    });

    expect(result.current).toBe(20); // Should update after delay
  });

  it('returns latest value after multiple updates within delay', () => {
    jest.useFakeTimers();

    const initialValue = 10;
    const delay = 100;

    const { result, rerender } = renderHook((value) => useThrottle(value, delay), {
      initialProps: initialValue,
    });

    // Update value multiple times
    rerender(20);
    rerender(30);
    rerender(40);

    expect(result.current).toBe(initialValue);

    // Fast forward time
    act(() => {
      jest.advanceTimersByTime(delay);
    });

    expect(result.current).toBe(40); // Should return latest value
  });

  it('handles different delay values', () => {
    jest.useFakeTimers();

    const { result, rerender } = renderHook((props) => useThrottle(props.value, props.delay), {
      initialProps: { value: 10, delay: 100 },
    });

    rerender({ value: 20, delay: 200 });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current).toBe(10); // Should not update yet

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current).toBe(20);
  });
});
