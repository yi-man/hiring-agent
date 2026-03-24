import { renderHook, act } from '@testing-library/react';
import { useViewportSize } from './use-viewport-size';

describe('useViewportSize Hook', () => {
  it('returns initial viewport size', () => {
    const { result } = renderHook(() => useViewportSize());
    expect(typeof result.current.width).toBe('number');
    expect(typeof result.current.height).toBe('number');
    expect(result.current.width).toBeGreaterThan(0);
    expect(result.current.height).toBeGreaterThan(0);
  });

  it('updates viewport size when window is resized', () => {
    const testWidth = 1024;
    const testHeight = 768;

    const { result } = renderHook(() => useViewportSize());

    // 模拟窗口大小变化
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: testWidth });
      Object.defineProperty(window, 'innerHeight', { value: testHeight });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.width).toBe(testWidth);
    expect(result.current.height).toBe(testHeight);
  });

  it('registers and unregisters resize event listener', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useViewportSize());
    unmount();

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
