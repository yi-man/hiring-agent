import { useTheme as useNextTheme } from 'next-themes';
import type { Theme } from '@/types';

export function useTheme() {
  const { theme, setTheme } = useNextTheme();

  const toggleTheme = () => {
    setTheme((prev: string) => (prev === 'light' ? 'dark' : 'light'));
  };

  const isDark = theme === 'dark';
  const isLight = theme === 'light';
  const isSystem = theme === 'system';

  return {
    theme: theme as Theme,
    setTheme: (newTheme: Theme) => setTheme(newTheme),
    toggleTheme,
    isDark,
    isLight,
    isSystem,
  };
}
