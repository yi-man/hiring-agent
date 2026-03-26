'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import {
  createConversationApi,
  fetchConversationMessages,
  fetchConversations,
  streamConversationMessage,
} from '@/lib/chat/client';

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
};

type Conversation = {
  id: string;
  title?: string | null;
};

export function ChatUI() {
  const CONVERSATION_PAGE_SIZE = 20;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationHasMore, setConversationHasMore] = useState(true);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [activeConversationId, conversations],
  );

  const loadConversations = async (options?: { reset?: boolean }) => {
    const reset = options?.reset ?? false;
    const nextPage = reset ? 1 : conversationPage;
    const result = await fetchConversations({
      page: nextPage,
      limit: CONVERSATION_PAGE_SIZE,
    });

    setConversations((prev) => (reset ? result.conversations : [...prev, ...result.conversations]));
    setConversationPage(nextPage);
    setConversationHasMore(result.hasMore);

    if (!activeConversationId && result.conversations.length) {
      setActiveConversationId(result.conversations[0].id);
    }
  };

  const createConversation = async () => {
    const conversation = await createConversationApi();
    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(conversation.id);
    setMessages([]);
  };

  const loadMoreConversations = async () => {
    if (isLoadingMoreConversations || !conversationHasMore) return;
    setIsLoadingMoreConversations(true);
    try {
      const nextPage = conversationPage + 1;
      const result = await fetchConversations({
        page: nextPage,
        limit: CONVERSATION_PAGE_SIZE,
      });
      setConversations((prev) => [...prev, ...result.conversations]);
      setConversationPage(nextPage);
      setConversationHasMore(result.hasMore);
    } finally {
      setIsLoadingMoreConversations(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    const rows = await fetchConversationMessages(conversationId);
    const filtered = rows
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }));
    setMessages(filtered);
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadConversations({ reset: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : '初始化失败');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    void (async () => {
      try {
        await loadMessages(activeConversationId);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载会话失败');
      }
    })();
  }, [activeConversationId]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !activeConversationId) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const body = await streamConversationMessage(activeConversationId, text);

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          const chunk = decoder.decode(result.value, { stream: true });
          if (chunk) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== 'assistant') return prev;
              next[next.length - 1] = { ...last, content: `${last.content}${chunk}` };
              return next;
            });
          }
        }
      }
      await loadConversations({ reset: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-4 pb-12 md:h-[70vh] md:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="border-border/60 bg-background/70 h-[260px] min-h-[260px] border md:h-full md:min-h-[420px]">
        <CardBody className="flex h-full flex-col space-y-3 p-4">
          <Button
            color="primary"
            onClick={() => void createConversation()}
            className="w-full shrink-0"
          >
            新建会话
          </Button>

          <div
            ref={conversationListRef}
            className="flex-1 overflow-y-auto pr-1"
            onScroll={() => {
              const node = conversationListRef.current;
              if (!node) return;
              const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 16;
              if (nearBottom && conversationHasMore) {
                void loadMoreConversations();
              }
            }}
          >
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    conversation.id === activeConversationId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary'
                  }`}
                  onClick={() => setActiveConversationId(conversation.id)}
                >
                  {conversation.title || `会话 ${conversation.id.slice(0, 8)}`}
                </button>
              ))}
              {isLoadingMoreConversations && (
                <div className="text-secondary-foreground py-2 text-center text-xs">
                  加载更多...
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="border-border/60 bg-background/70 h-[70vh] min-h-[420px] border">
        <CardBody className="flex h-full flex-col p-4">
          <div className="min-h-0 flex-1">
            {!activeConversation ? (
              <div className="text-secondary-foreground flex flex-1 items-center justify-center text-center text-sm">
                先创建一个会话，然后开始聊天。
              </div>
            ) : (
              <div className="h-full overflow-y-auto pr-1">
                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground ml-auto'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))}
                  {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="bg-secondary text-secondary-foreground max-w-[92%] rounded-xl px-4 py-3 text-sm">
                      正在思考...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 pt-3">
            {error && <p className="text-danger mb-2 text-sm">{error}</p>}
            <div className="flex gap-3">
              <Input
                value={input}
                onValueChange={setInput}
                placeholder="输入你的问题"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                isDisabled={isLoading || !activeConversation}
              />
              <Button
                color="primary"
                onClick={() => void onSend()}
                isLoading={isLoading}
                isDisabled={!activeConversation}
              >
                发送
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
