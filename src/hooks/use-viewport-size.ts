'use client';

import { useState, useEffect } from 'react';

export function useViewportSize() {
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // 设置初始值
    handleResize();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return viewportSize;
}
