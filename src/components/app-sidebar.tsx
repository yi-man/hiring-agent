'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BrainCircuit,
  Building2,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  Eye,
  FileCode,
  FileText,
  GitBranch,
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

type AppMenuSection = {
  label?: string;
  items: AppMenuItem[];
};

const appMenuSections: AppMenuSection[] = [
  {
    label: '招聘运营',
    items: [
      {
        label: '工作台',
        description: '招聘运营总览',
        href: '/',
        Icon: LayoutDashboard,
      },
      {
        label: '招聘统计',
        description: '目标与缺口',
        href: '/recruitment-stats',
        Icon: ChartColumn,
      },
    ],
  },
  {
    label: '招聘流程',
    items: [
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
        label: '面试记录',
        description: '反馈与结论',
        href: '/interviews',
        Icon: ClipboardList,
      },
      {
        label: 'Workflow 列表',
        description: '已发布流程',
        href: '/workflows',
        Icon: GitBranch,
      },
      {
        label: '简历列表',
        description: '简历与 JD 挂载',
        href: '/resumes',
        Icon: FileText,
      },
    ],
  },
  {
    label: '知识与自动化',
    items: [
      {
        label: '知识库',
        description: '文档与上下文',
        href: '/knowledge',
        Icon: FileCode,
      },
      {
        label: '智能对话',
        description: '对话与 RAG',
        href: '/chat',
        Icon: MessageCircle,
      },
      {
        label: 'Workflow 学习',
        description: '流程沉淀',
        href: '/workflow-learning',
        Icon: BrainCircuit,
      },
    ],
  },
  {
    label: '系统',
    items: [
      {
        label: 'LLM 可观测',
        description: '调用与趋势',
        href: '/llm-observability',
        Icon: Eye,
      },
      {
        label: '公司设置',
        description: '组织与招聘配置',
        href: '/settings/company',
        Icon: Building2,
      },
    ],
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeItem = appMenuSections
    .flatMap((section) => section.items)
    .find((item) => isActivePath(pathname, item.href));

  return (
    <aside className="bg-background/95 border-border border-b backdrop-blur lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:w-64 lg:shrink-0 lg:overflow-hidden lg:border-r lg:border-b-0">
      <div className="mx-auto max-w-screen-2xl px-4 py-3 lg:mx-0 lg:flex lg:h-full lg:max-w-none lg:flex-col lg:px-4 lg:py-5">
        <button
          type="button"
          aria-controls="app-main-navigation"
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? '收起主导航' : '展开主导航'}
          onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          className="border-border bg-muted/45 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left lg:hidden"
        >
          <span>
            <span className="text-muted-foreground block text-[11px] font-medium tracking-wide uppercase">
              当前页面
            </span>
            <span className="text-foreground mt-0.5 block text-sm font-semibold">
              {activeItem?.label ?? '未选择'}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`text-muted-foreground h-4 w-4 transition-transform ${
              isMobileMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        <nav
          id="app-main-navigation"
          aria-label="主导航"
          className={`${
            isMobileMenuOpen ? 'flex' : 'hidden'
          } mt-3 flex-col gap-3 pb-1 lg:mt-0 lg:flex lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:pb-4`}
        >
          {appMenuSections.map((section, sectionIndex) => (
            <div
              key={section.label ?? `section-${sectionIndex}`}
              className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:min-w-0 lg:flex-col ${
                section.label ? 'lg:border-border lg:mt-2 lg:border-t lg:pt-3' : ''
              }`}
            >
              {section.label ? (
                <div className="text-muted-foreground col-span-full flex shrink-0 items-center px-2 text-xs font-semibold tracking-normal uppercase lg:px-3">
                  {section.label}
                </div>
              ) : null}
              {section.items.map(({ Icon, ...item }) => {
                const isActive = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all ${
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
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
