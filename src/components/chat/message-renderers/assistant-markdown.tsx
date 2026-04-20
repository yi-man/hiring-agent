'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AssistantMarkdownProps = {
  children: string;
};

export function AssistantMarkdown({ children }: AssistantMarkdownProps) {
  return (
    <div className="chat-markdown prose prose-sm dark:prose-invert prose-p:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-foreground/5 dark:prose-pre:bg-background/70 prose-code:rounded prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.82em] prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-th:border prose-th:border-border prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1 max-w-none leading-7 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
