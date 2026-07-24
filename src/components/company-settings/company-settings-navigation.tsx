'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronRight, ClipboardList, Globe2, MapPin } from 'lucide-react';

const settingsItems = [
  {
    label: '公司信息',
    description: '名称与组织主体',
    href: '/settings/company',
    Icon: Building2,
  },
  {
    label: '工作地点',
    description: '办公室与远程地点',
    href: '/settings/company/locations',
    Icon: MapPin,
  },
  {
    label: '面试流程',
    description: '职位类别与轮次模板',
    href: '/settings/company/interview-processes',
    Icon: ClipboardList,
  },
  {
    label: '招聘平台',
    description: '启用范围、连接与凭据',
    href: '/settings/company/recruitment-platforms',
    Icon: Globe2,
  },
];

function isActivePath(pathname: string, href: string) {
  return href === '/settings/company'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function CompanySettingsNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="公司设置导航"
      className="border-border bg-muted/15 grid gap-1 rounded-xl border p-2 sm:grid-cols-2 lg:sticky lg:top-24 lg:grid-cols-1"
    >
      {settingsItems.map(({ Icon, ...item }) => {
        const isActive = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            aria-current={isActive ? 'page' : undefined}
            href={item.href}
            className={`group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
              isActive
                ? 'border-primary/30 bg-background text-primary shadow-sm'
                : 'text-foreground/80 hover:border-border hover:bg-background/70 border-transparent'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isActive ? 'bg-primary/10' : 'bg-background border-border border'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                {item.description}
              </span>
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${
                isActive ? 'text-primary translate-x-0.5' : 'text-muted-foreground'
              }`}
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </nav>
  );
}
