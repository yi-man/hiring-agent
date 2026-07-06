import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { SignInButton } from '@/components/auth/sign-in-button';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function Home() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return (
      <main className="bg-background text-foreground min-h-screen">
        <div className="container mx-auto flex min-h-screen items-center px-4 py-10">
          <section className="border-border bg-card w-full max-w-xl rounded-lg border p-6">
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              请先登录后继续
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              登录后可查看 JD 发布状态、平台异常、候选人跟进与最近任务数据。
            </p>
            <div className="mt-5">
              <SignInButton />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return <DashboardPage />;
}
