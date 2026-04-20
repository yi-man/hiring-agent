'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, FileCode, Paperclip, RefreshCw, X } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import {
  createConversationApi,
  deleteConversationDocument,
  fetchConversationDocuments,
  fetchConversationMessages,
  fetchConversations,
  type ConversationDocumentDto,
  streamConversationMessage,
  uploadConversationDocument,
} from '@/lib/chat/client';
import { AssistantMarkdown } from './message-renderers/assistant-markdown';
import { MessageBubble } from './message-renderers/message-bubble';

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  documentId?: string | null;
};

type Conversation = {
  id: string;
  title?: string | null;
};

export function CopilotChatUI() {
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
  const [documents, setDocuments] = useState<ConversationDocumentDto[]>([]);
  const [isRefreshingDocuments, setIsRefreshingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
  const [lastAssistantError, setLastAssistantError] = useState<string | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const documentPollTimerRef = useRef<number | null>(null);
  const documentPollSessionIdRef = useRef(0);
  const latestDocumentRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const clearDocumentPollTimer = () => {
    if (documentPollTimerRef.current !== null) {
      window.clearTimeout(documentPollTimerRef.current);
      documentPollTimerRef.current = null;
    }
  };

  const startDocumentPolling = () => {
    const sessionId = ++documentPollSessionIdRef.current;
    clearDocumentPollTimer();
    documentPollTimerRef.current = window.setTimeout(function tick() {
      const currentConversationId = activeConversationIdRef.current;
      if (!currentConversationId) {
        clearDocumentPollTimer();
        return;
      }
      void (async () => {
        try {
          const nextRows = await loadDocuments(currentConversationId, { silent: true });
          const isCurrentSession = sessionId === documentPollSessionIdRef.current;
          const isCurrentConversation = activeConversationIdRef.current === currentConversationId;
          if (!isCurrentSession || !isCurrentConversation) return;
          const shouldContinue = nextRows.some((doc) => doc.status === 'processing');
          if (shouldContinue) {
            clearDocumentPollTimer();
            documentPollTimerRef.current = window.setTimeout(tick, 2500);
          } else {
            clearDocumentPollTimer();
          }
        } catch {
          const isCurrentSession = sessionId === documentPollSessionIdRef.current;
          const isCurrentConversation = activeConversationIdRef.current === currentConversationId;
          if (!isCurrentSession || !isCurrentConversation) return;
          clearDocumentPollTimer();
          documentPollTimerRef.current = window.setTimeout(tick, 2500);
        }
      })();
    }, 2500);
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [activeConversationId, conversations],
  );

  const loadConversations = async (options?: { reset?: boolean }) => {
    const reset = options?.reset ?? false;
    const nextPage = reset ? 1 : conversationPage;
    const result = await fetchConversations({ page: nextPage, limit: CONVERSATION_PAGE_SIZE });

    setConversations((prev) => {
      if (!reset) return [...prev, ...result.conversations];
      const activeId = activeConversationIdRef.current;
      if (!activeId) return result.conversations;
      const hasActiveInResult = result.conversations.some((c) => c.id === activeId);
      if (hasActiveInResult) return result.conversations;
      const activeInPrev = prev.find((c) => c.id === activeId);
      if (!activeInPrev) return result.conversations;
      return [activeInPrev, ...result.conversations];
    });
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
    setFocusedDocumentId(null);
  };

  const loadMoreConversations = async () => {
    if (isLoadingMoreConversations || !conversationHasMore) return;
    setIsLoadingMoreConversations(true);
    try {
      const nextPage = conversationPage + 1;
      const result = await fetchConversations({ page: nextPage, limit: CONVERSATION_PAGE_SIZE });
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
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        documentId: m.documentId ?? null,
      }));
    setMessages(filtered);
  };

  const loadDocuments = async (conversationId: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const requestId = ++latestDocumentRequestIdRef.current;
    if (!silent) setIsRefreshingDocuments(true);
    try {
      const rows = await fetchConversationDocuments(conversationId);
      const isStillLatest =
        requestId === latestDocumentRequestIdRef.current &&
        activeConversationIdRef.current === conversationId;
      if (isStillLatest) setDocuments(rows);
      return rows;
    } finally {
      if (!silent && requestId === latestDocumentRequestIdRef.current)
        setIsRefreshingDocuments(false);
    }
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
    clearDocumentPollTimer();
    setDocuments([]);
    setFocusedDocumentId(null);
    setLastAssistantError(null);
    void (async () => {
      try {
        await loadMessages(activeConversationId);
        const rows = await loadDocuments(activeConversationId);
        if (rows.some((doc) => doc.status === 'processing')) startDocumentPolling();
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载会话失败');
      }
    })();
    return () => clearDocumentPollTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !activeConversationId) return;
    setLastAssistantError(null);
    const focusedRow = focusedDocumentId
      ? documents.find((d) => d.id === focusedDocumentId)
      : undefined;
    const docForSend =
      focusedDocumentId && focusedRow?.status === 'ready' ? focusedDocumentId : undefined;

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, documentId: docForSend ?? null },
    ]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const body = docForSend
        ? await streamConversationMessage(activeConversationId, text, { documentId: docForSend })
        : await streamConversationMessage(activeConversationId, text);
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
      const message = e instanceof Error ? e.message : '请求失败';
      setError(message);
      setLastAssistantError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onUploadDocument = async (file: File | null) => {
    if (!file || !activeConversationId || isUploadingDocument) return;
    setError(null);
    setIsUploadingDocument(true);
    try {
      const uploaded = await uploadConversationDocument(activeConversationId, file);
      setFocusedDocumentId(uploaded.id);
      const rows = await loadDocuments(activeConversationId);
      if (uploaded.status === 'failed' && uploaded.errorMessage) setError(uploaded.errorMessage);
      if (rows.some((doc) => doc.status === 'processing')) startDocumentPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传文档失败');
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const onRefreshDocuments = async () => {
    if (!activeConversationId) return;
    try {
      const rows = await loadDocuments(activeConversationId);
      if (rows.some((doc) => doc.status === 'processing')) startDocumentPolling();
      else clearDocumentPollTimer();
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新文档失败');
    }
  };

  const onDeleteDocument = async (documentId: string) => {
    if (!activeConversationId) return;
    setError(null);
    try {
      await deleteConversationDocument(activeConversationId, documentId);
      if (focusedDocumentId === documentId) setFocusedDocumentId(null);
      const rows = await loadDocuments(activeConversationId);
      if (rows.some((doc) => doc.status === 'processing')) startDocumentPolling();
      else clearDocumentPollTimer();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除文档失败');
    }
  };

  const dismissComposerDocument = async () => {
    if (!focusedDocumentId || !activeConversationId) return;
    if (messages.length === 0) {
      await onDeleteDocument(focusedDocumentId);
      return;
    }
    setFocusedDocumentId(null);
  };

  const focusedDocumentRow = focusedDocumentId
    ? documents.find((d) => d.id === focusedDocumentId)
    : undefined;
  const focusedDocumentLabel = focusedDocumentRow?.filename;
  const hasProcessingDocuments = documents.some((d) => d.status === 'processing');
  const markdownByteLabel = (md: string) => {
    const n = new TextEncoder().encode(md).length;
    if (n < 1024) return `${n} B`;
    return `${Math.round(n / 1024)} KB`;
  };

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-4 pb-12 md:h-[72vh] md:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="border-border/50 bg-background/70 h-[260px] min-h-[260px] border md:h-full md:min-h-[420px]">
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
              if (nearBottom && conversationHasMore) void loadMoreConversations();
            }}
          >
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    conversation.id === activeConversationId
                      ? 'border-sky-300/80 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950/35 dark:text-sky-100'
                      : 'bg-secondary/70 hover:bg-secondary border-transparent'
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

      <Card className="border-border/50 bg-background/70 h-[72vh] min-h-[420px] border">
        <CardBody className="flex h-full flex-col p-4">
          <div className="text-secondary-foreground mb-2 text-xs">
            CopilotKit-style UI (frontend compatible)
          </div>
          <div className="min-h-0 flex-1">
            {!activeConversation ? (
              <div className="text-secondary-foreground flex h-full items-center justify-center text-center text-sm">
                先创建一个会话，然后开始聊天。
              </div>
            ) : (
              <div className="h-full overflow-y-auto pr-1">
                <div className="space-y-3">
                  {messages.map((msg, idx) => {
                    const docLabel =
                      msg.role === 'user' && msg.documentId
                        ? (documents.find((d) => d.id === msg.documentId)?.filename ?? '已引用文档')
                        : null;
                    return (
                      <div
                        key={msg.id ?? `${msg.role}-${idx}`}
                        className={msg.role === 'user' ? 'ml-auto' : ''}
                      >
                        {docLabel ? (
                          <button
                            type="button"
                            aria-label={`将 ${docLabel} 作为下文上下文`}
                            className="bg-secondary text-secondary-foreground mb-1 flex w-full max-w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs"
                            onClick={() => setFocusedDocumentId(msg.documentId!)}
                          >
                            <span className="truncate font-medium">{docLabel}</span>
                            <span className="shrink-0 opacity-70">
                              Markdown · 点击作为下文上下文
                            </span>
                          </button>
                        ) : null}
                        <MessageBubble role={msg.role}>
                          {msg.role === 'assistant' ? (
                            msg.content ? (
                              <AssistantMarkdown>{msg.content}</AssistantMarkdown>
                            ) : (
                              <span className="text-secondary-foreground">正在思考...</span>
                            )
                          ) : (
                            msg.content
                          )}
                        </MessageBubble>
                      </div>
                    );
                  })}
                  {lastAssistantError ? (
                    <div className="max-w-[92%] rounded-2xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-700/70 dark:bg-rose-950/30 dark:text-rose-200">
                      回复中断：{lastAssistantError}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 pt-3">
            {error && <p className="text-danger mb-2 text-sm">{error}</p>}
            {activeConversation ? (
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 p-3 shadow-sm dark:border-sky-900 dark:bg-sky-950/20">
                {hasProcessingDocuments ? (
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                    <span>有文档正在索引…</span>
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      disabled={isRefreshingDocuments}
                      onClick={() => void onRefreshDocuments()}
                    >
                      刷新状态
                    </button>
                  </p>
                ) : null}
                {focusedDocumentId ? (
                  <div className="bg-background/70 mb-2 flex items-start gap-2 rounded-xl px-3 py-2.5">
                    <FileCode
                      className="mt-0.5 size-9 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-tight font-medium">
                        {focusedDocumentLabel ?? '文档'}
                      </p>
                      {focusedDocumentRow ? (
                        <>
                          <p className="text-secondary-foreground mt-0.5 text-xs">
                            Markdown · {markdownByteLabel(focusedDocumentRow.contentMarkdown)}
                          </p>
                          {focusedDocumentRow.status !== 'ready' ? (
                            <p className="text-secondary-foreground mt-1 text-[11px] leading-snug opacity-90">
                              索引未完成，发送时不会按该文档检索。
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-secondary-foreground mt-0.5 text-xs opacity-80">
                          正在同步文档信息…
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-secondary-foreground hover:text-foreground mt-0.5 shrink-0 rounded-full p-1"
                      aria-label={messages.length === 0 ? '移除上传' : '不作为上下文'}
                      onClick={() => void dismissComposerDocument()}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}
                <Input
                  value={input}
                  onValueChange={setInput}
                  placeholder="发消息…"
                  variant="bordered"
                  classNames={{
                    inputWrapper:
                      'border-0 bg-transparent px-0 shadow-none min-h-10 data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent',
                    input: 'text-sm',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                  isDisabled={isLoading}
                />
                <div className="border-border/50 mt-1 flex items-center gap-2 border-t pt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,text/markdown"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="上传 Markdown"
                    disabled={isUploadingDocument}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void onUploadDocument(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="text-secondary-foreground hover:text-foreground rounded-lg p-2"
                    aria-label="打开文件选择"
                    disabled={isUploadingDocument}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-5" />
                  </button>
                  <button
                    type="button"
                    className="text-secondary-foreground hover:text-foreground rounded-lg p-2"
                    aria-label="刷新文档状态"
                    disabled={isRefreshingDocuments}
                    onClick={() => void onRefreshDocuments()}
                  >
                    <RefreshCw
                      className={`size-4 ${isRefreshingDocuments ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white hover:opacity-90 disabled:opacity-40"
                    aria-label="发送"
                    disabled={isLoading || !input.trim()}
                    onClick={() => void onSend()}
                  >
                    {isLoading ? (
                      <span className="size-5 animate-pulse rounded-sm bg-white/40" />
                    ) : (
                      <ArrowUp className="size-5" strokeWidth={2.25} />
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
