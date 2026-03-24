'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="container-custom flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="space-y-6">
        <div className="bg-primary/10 text-primary inline-flex h-20 w-20 items-center justify-center rounded-full">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">正在加载</h2>
          <p className="text-muted-foreground">请稍候，我们正在为您准备内容...</p>
        </div>
      </div>
    </div>
  );
}
