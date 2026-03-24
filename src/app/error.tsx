'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';

function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 记录错误信息
    console.error('应用程序错误:', error);

    // 添加清理函数
    return () => {
      // 检查 console.error 是否有 mockRestore 方法（使用类型断言）
      const consoleError = console.error as unknown as { mockRestore?: () => void };
      if (typeof consoleError.mockRestore === 'function') {
        consoleError.mockRestore();
      }
    };
  }, [error]);

  return (
    <div className="container mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4">
          <div className="bg-destructive/10 text-destructive inline-flex h-20 w-20 items-center justify-center rounded-full">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">应用程序出错</h1>
          <p className="text-muted-foreground text-lg">
            很抱歉，应用程序在处理您的请求时遇到了问题。
          </p>
          <p className="text-destructive bg-destructive/10 inline-block rounded-lg px-4 py-2 text-sm">
            错误信息：{error.message}
          </p>
        </div>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button onClick={reset} size="lg">
            <RefreshCw className="mr-2 h-4 w-4" />
            重试
          </Button>
          <Button variant="light" size="lg">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回首页
            </Link>
          </Button>
        </div>

        {error.digest && (
          <div className="border-t pt-8">
            <p className="text-muted-foreground text-xs">
              错误ID: <code className="font-mono">{error.digest}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ErrorPage;
