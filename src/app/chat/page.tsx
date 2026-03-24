import { ChatUI } from '@/components/chat/chat-ui';

export default function ChatPage() {
  return (
    <section className="mx-auto w-full max-w-5xl py-8">
      <div className="mb-6 px-4">
        <h1 className="text-foreground text-3xl font-bold">招聘 AI Chat</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          基于 LangChain + OpenAI 兼容接口，先打通最小可用对话链路。
        </p>
      </div>
      <ChatUI />
    </section>
  );
}
