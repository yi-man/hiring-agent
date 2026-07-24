import { SignInButton } from '@/components/auth/sign-in-button';
import { CompanySettingsNavigation } from '@/components/company-settings/company-settings-navigation';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function CompanySettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto max-w-7xl px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">登录本地账号后即可维护公司设置。</p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <header className="border-border border-b pb-5">
            <div className="text-primary mb-2 text-xs font-semibold tracking-[0.16em] uppercase">
              Organization settings
            </div>
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">公司设置</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              分区维护组织主体、办公地点、职位面试规则和招聘平台连接。
            </p>
          </header>
          <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <CompanySettingsNavigation />
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}
