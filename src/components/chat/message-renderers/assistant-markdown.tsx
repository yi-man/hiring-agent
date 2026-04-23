'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AssistantMarkdownProps = {
  children: string;
};

export function AssistantMarkdown({ children }: AssistantMarkdownProps) {
  return (
    <div className="chat-markdown prose prose-sm dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:my-3 prose-blockquote:border-l-2 prose-blockquote:border-sky-300 prose-blockquote:bg-sky-50/60 prose-blockquote:py-1 prose-blockquote:pr-3 prose-blockquote:pl-3 prose-blockquote:text-sky-950 dark:prose-blockquote:border-sky-700 dark:prose-blockquote:bg-sky-950/35 dark:prose-blockquote:text-sky-100 max-w-none leading-7 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-xl border border-sky-200/70 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-sky-900 dark:bg-slate-950">
              {children}
            </pre>
          ),
          code: ({ className, children }) =>
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="bg-foreground/10 rounded px-1 py-0.5 text-[0.82em]">{children}</code>
            ),
          table: ({ children }) => (
            <div className="my-2 w-full overflow-x-auto rounded-xl border border-sky-200/70 dark:border-sky-900">
              <table className="w-full border-collapse text-left text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-sky-200 bg-sky-50 px-2 py-1 font-semibold dark:border-sky-900 dark:bg-sky-950/30">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-border/70 border-b px-2 py-1 align-top last:border-b-0">
              {children}
            </td>
          ),
          ul: ({ children }) => (
            <ul className="my-2 space-y-1 pl-5 marker:text-sky-500">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1 pl-5 marker:text-sky-500">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="[&>input]:mr-2 [&>input]:translate-y-[1px]">{children}</li>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
