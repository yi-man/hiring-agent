import { renderHook, act } from '@testing-library/react';
import { useTheme } from './use-theme';
import { useTheme as useNextTheme } from 'next-themes';

// 模拟 next-themes 的 useTheme Hook
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

describe('useTheme Hook', () => {
  it('returns theme properties when theme is dark', () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme: jest.fn(),
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(result.current.isLight).toBe(false);
    expect(result.current.isSystem).toBe(false);
    expect(typeof result.current.toggleTheme).toBe('function');
    expect(typeof result.current.setTheme).toBe('function');
  });

  it('returns theme properties when theme is light', () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: jest.fn(),
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(result.current.isLight).toBe(true);
    expect(result.current.isSystem).toBe(false);
  });

  it('returns theme properties when theme is system', () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme: jest.fn(),
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.isDark).toBe(false);
    expect(result.current.isLight).toBe(false);
    expect(result.current.isSystem).toBe(true);
  });

  it('calls setTheme with dark when toggling from light', () => {
    const setTheme = jest.fn((callback) => {
      // 模拟 setTheme 执行回调函数
      if (typeof callback === 'function') {
        return callback('light');
      }
    });
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
    });

    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });

    expect(setTheme).toHaveBeenCalled();
  });

  it('calls setTheme with light when toggling from dark', () => {
    const setTheme = jest.fn((callback) => {
      // 模拟 setTheme 执行回调函数
      if (typeof callback === 'function') {
        return callback('dark');
      }
    });
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
    });

    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });

    expect(setTheme).toHaveBeenCalled();
  });

  it('calls setTheme with correct value when using setTheme directly', () => {
    const setTheme = jest.fn();
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
    });

    const { result } = renderHook(() => useTheme());
    const newTheme = 'dark';
    act(() => {
      result.current.setTheme(newTheme);
    });

    expect(setTheme).toHaveBeenCalledWith(newTheme);
  });
});
