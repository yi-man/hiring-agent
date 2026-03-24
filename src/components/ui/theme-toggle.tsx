'use client';

import { Switch } from '@heroui/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(theme === 'dark');
  }, [theme]);

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return <Switch checked={isDark} onChange={handleToggle} size="sm" aria-label="切换主题" />;
}
