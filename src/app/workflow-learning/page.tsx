import { WorkflowLearningChat } from '@/components/workflow-learning/workflow-learning-chat';
import { SignInButton } from '@/components/auth/sign-in-button';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function WorkflowLearningPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-foreground text-3xl font-bold">Workflow Learning</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Phase 1：Agent + Playwright，SSE 流式展示执行轨迹（本机开发；需已安装 Chromium：
          <code className="bg-muted px-1">pnpm exec playwright install chromium</code>）。
        </p>
      </div>
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h2 className="text-foreground text-xl font-semibold">请先登录后继续</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可使用 Workflow Learning。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <WorkflowLearningChat />
      )}
    </section>
  );
}
