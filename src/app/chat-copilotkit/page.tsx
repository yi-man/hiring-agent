import { SignInButton } from '@/components/auth/sign-in-button';
import { CopilotChatUI } from '@/components/chat/copilot-chat-ui';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function CopilotChatPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-foreground text-3xl font-bold">招聘 AI Chat (Copilot UI)</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          前端兼容 CopilotKit 风格，复用现有会话与消息链路。
        </p>
      </div>
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h2 className="text-foreground text-xl font-semibold">请先登录后继续</h2>
          <p className="text-muted-foreground mt-2 text-sm">登录本地账号后即可使用 Chat 功能。</p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <CopilotChatUI />
      )}
    </section>
  );
}
