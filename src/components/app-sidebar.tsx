'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BrainCircuit,
  Building2,
  ClipboardList,
  Eye,
  FileCode,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type AppMenuItem = {
  label: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const appMenuItems: AppMenuItem[] = [
  {
    label: '工作台',
    description: '招聘运营总览',
    href: '/',
    Icon: LayoutDashboard,
  },
  {
    label: '智能对话',
    description: '对话与 RAG',
    href: '/chat',
    Icon: MessageCircle,
  },
  {
    label: '知识库',
    description: '文档与上下文',
    href: '/knowledge',
    Icon: FileCode,
  },
  {
    label: 'JD 工作台',
    description: '生成与评估',
    href: '/jd-generator',
    Icon: FileText,
  },
  {
    label: '候选人列表',
    description: '推进与结果',
    href: '/candidates',
    Icon: Users,
  },
  {
    label: '简历列表',
    description: '简历与 JD 挂载',
    href: '/resumes',
    Icon: FileText,
  },
  {
    label: '面试记录',
    description: '反馈与结论',
    href: '/interviews',
    Icon: ClipboardList,
  },
  {
    label: 'Workflow 学习',
    description: '流程沉淀',
    href: '/workflow-learning',
    Icon: BrainCircuit,
  },
  {
    label: 'LLM 可观测',
    description: '调用与趋势',
    href: '/llm-observability',
    Icon: Eye,
  },
  {
    label: '公司设置',
    description: '公司与地点',
    href: '/settings/company',
    Icon: Building2,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-background/95 border-border border-b backdrop-blur lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="mx-auto max-w-screen-2xl px-4 py-3 lg:mx-0 lg:max-w-none lg:px-4 lg:py-5">
        <div className="text-muted-foreground mb-3 hidden px-3 text-xs font-semibold tracking-normal uppercase lg:block">
          功能菜单
        </div>
        <nav aria-label="功能菜单" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
          {appMenuItems.map(({ Icon, ...item }) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-w-36 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all lg:min-w-0 ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'text-foreground/78 hover:border-primary/25 hover:bg-primary/5 hover:text-primary border-transparent'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? 'bg-primary/15' : 'bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="text-muted-foreground mt-0.5 hidden text-xs lg:block">
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
