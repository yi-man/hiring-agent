import { SignInButton } from '@/components/auth/sign-in-button';
import { JDContextView } from '@/components/jd-generator/jd-context-view';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function JDContextPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  const { id } = await params;

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看 JD 生成时使用的知识库上下文。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <JDContextView jobDescriptionId={id} />
      )}
    </section>
  );
}
