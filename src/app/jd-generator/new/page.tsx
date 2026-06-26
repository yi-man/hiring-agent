import { SignInButton } from '@/components/auth/sign-in-button';
import { JDCreateView } from '@/components/jd-generator/jd-pages';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function NewJDPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可创建带公司上下文的 JD。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <JDCreateView />
      )}
    </section>
  );
}
