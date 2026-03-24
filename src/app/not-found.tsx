'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4">
          <div className="bg-primary/10 text-primary inline-flex h-20 w-20 items-center justify-center rounded-full">
            <span className="text-4xl font-bold">404</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">页面未找到</h1>
          <p className="text-muted-foreground text-lg">很抱歉，您访问的页面不存在或已被移动。</p>
        </div>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回首页
            </Link>
          </Button>
          <Button variant="light" size="lg">
            <Link href="/contact">联系我们</Link>
          </Button>
        </div>

        <div className="pt-8">
          <h2 className="text-muted-foreground mb-4 text-sm font-medium">可能的原因：</h2>
          <ul className="text-muted-foreground space-y-1 text-left text-sm">
            <li>• 页面链接已过期</li>
            <li>• 页面已被重命名或删除</li>
            <li>• 输入的URL有误</li>
            <li>• 该页面可能需要特定权限才能访问</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
