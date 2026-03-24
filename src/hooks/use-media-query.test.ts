import { renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

// 创建模拟的 matchMedia
const createMockMatchMedia = (matches: boolean) => {
  const mediaQueryList = {
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  return jest.fn(() => mediaQueryList);
};

describe('useMediaQuery Hook', () => {
  it('returns initial matches state', () => {
    const mockMatchMedia = createMockMatchMedia(false);
    (window as unknown as { matchMedia: unknown }).matchMedia = mockMatchMedia;

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('returns true when media query matches', () => {
    const mockMatchMedia = createMockMatchMedia(true);
    (window as unknown as { matchMedia: unknown }).matchMedia = mockMatchMedia;

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('registers and unregisters event listener', () => {
    const mockAddEventListener = jest.fn();
    const mockRemoveEventListener = jest.fn();
    const mediaQueryList = {
      matches: false,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    };

    (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(() => mediaQueryList);

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    unmount();

    expect(mockAddEventListener).toHaveBeenCalled();
    expect(mockRemoveEventListener).toHaveBeenCalled();
  });

  it('handles different media queries', () => {
    const mockMatchMedia = jest.fn((query: string) => ({
      matches: query.includes('dark'),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    (window as unknown as { matchMedia: unknown }).matchMedia = mockMatchMedia;

    const { result: result1 } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'));
    const { result: result2 } = renderHook(() => useMediaQuery('(prefers-color-scheme: light)'));

    expect(result1.current).toBe(true);
    expect(result2.current).toBe(false);
  });
});
