'use client';

import type { ReactNode } from 'react';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  children: ReactNode;
};

export function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={isUser ? 'ml-auto max-w-[92%]' : 'max-w-[92%]'}>
      <div
        className={
          isUser
            ? 'rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-100'
            : 'border-border/70 bg-background/85 text-foreground rounded-2xl border px-4 py-3 text-sm leading-relaxed'
        }
      >
        {children}
      </div>
    </div>
  );
}
