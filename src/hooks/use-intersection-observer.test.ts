import { renderHook } from '@testing-library/react';
import { useIntersectionObserver } from './use-intersection-observer';

// 在测试之前设置全局模拟
beforeEach(() => {
  // 创建模拟的 IntersectionObserver
  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    callback: IntersectionObserverCallback;
    root: Element | null = null;
    rootMargin: string = '0px';
    thresholds: number[] = [0];

    observe() {
      // 立即触发回调
      this.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }

    unobserve() {}

    disconnect() {}

    takeRecords() {
      return [] as IntersectionObserverEntry[];
    }
  }

  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
});

// 在测试之后清除全局模拟
afterEach(() => {
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('useIntersectionObserver Hook', () => {
  it('returns ref and initial isIntersecting false', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(result.current.ref).toBeDefined();
    expect(result.current.isIntersecting).toBe(false);
    expect(result.current.entry).toBeNull();
  });

  it('uses provided options', () => {
    const mockObserver = jest.fn();
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = mockObserver;

    const testThreshold = 0.5;
    const testRootMargin = '100px';

    renderHook(() =>
      useIntersectionObserver({
        threshold: testThreshold,
        rootMargin: testRootMargin,
      }),
    );

    expect(mockObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        threshold: testThreshold,
        rootMargin: testRootMargin,
      }),
    );
  });
});
