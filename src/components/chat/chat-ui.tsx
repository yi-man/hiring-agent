'use client';

import { useState } from 'react';
import { Button, Card, CardBody, Input } from '@/components/ui';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function ChatUI() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '你好，我是招聘 AI 助手。可以先告诉我：岗位、级别、城市、预算。',
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Chat request failed');
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-12">
      <Card className="border-border/60 bg-background/70 min-h-[420px] border">
        <CardBody className="space-y-3 p-4">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {isLoading && (
            <div className="bg-secondary text-secondary-foreground max-w-[85%] rounded-xl px-4 py-3 text-sm">
              正在思考...
            </div>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex gap-3">
        <Input
          value={input}
          onValueChange={setInput}
          placeholder="输入你的招聘问题，例如：帮我写一个前端工程师 JD"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onSend();
            }
          }}
          isDisabled={isLoading}
        />
        <Button color="primary" onClick={() => void onSend()} isLoading={isLoading}>
          发送
        </Button>
      </div>
    </div>
  );
}
