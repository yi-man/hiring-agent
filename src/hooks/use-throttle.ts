'use client';

import { useState, useEffect, useRef } from 'react';

export function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastExecuted = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();

    if (now - lastExecuted.current >= delay) {
      lastExecuted.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(
        () => {
          lastExecuted.current = Date.now();
          setThrottledValue(value);
        },
        delay - (now - lastExecuted.current),
      );

      return () => {
        clearTimeout(timer);
      };
    }
  }, [value, delay]);

  return throttledValue;
}
