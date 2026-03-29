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
  const [documents, setDocuments] = useState<ConversationDocumentDto[]>([]);
  const [isRefreshingDocuments, setIsRefreshingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  /** When set, the next message scopes RAG to this document; X clears selection (or deletes upload if the thread is still empty). */
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
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
          if (!isCurrentSession || !isCurrentConversation) {
            return;
          }
          const shouldContinue = nextRows.some((doc) => doc.status === 'processing');
          if (shouldContinue) {
            clearDocumentPollTimer();
            documentPollTimerRef.current = window.setTimeout(tick, 2500);
          } else {
            clearDocumentPollTimer();
          }
        } catch {
          // Keep retrying on transient refresh failures while processing may still be ongoing.
          const isCurrentSession = sessionId === documentPollSessionIdRef.current;
          const isCurrentConversation = activeConversationIdRef.current === currentConversationId;
          if (!isCurrentSession || !isCurrentConversation) {
            return;
          }
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
    const result = await fetchConversations({
      page: nextPage,
      limit: CONVERSATION_PAGE_SIZE,
    });

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
    if (!silent) {
      setIsRefreshingDocuments(true);
    }
    try {
      const rows = await fetchConversationDocuments(conversationId);
      const isStillLatest =
        requestId === latestDocumentRequestIdRef.current &&
        activeConversationIdRef.current === conversationId;
      if (isStillLatest) {
        setDocuments(rows);
      }
      return rows;
    } finally {
      if (!silent && requestId === latestDocumentRequestIdRef.current) {
        setIsRefreshingDocuments(false);
      }
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
    void (async () => {
      try {
        await loadMessages(activeConversationId);
        const rows = await loadDocuments(activeConversationId);
        if (rows.some((doc) => doc.status === 'processing')) {
          startDocumentPolling();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载会话失败');
      }
    })();
    return () => {
      clearDocumentPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !activeConversationId) return;

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
      setError(e instanceof Error ? e.message : '请求失败');
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
      if (uploaded.status === 'failed' && uploaded.errorMessage) {
        setError(uploaded.errorMessage);
      }
      if (rows.some((doc) => doc.status === 'processing')) {
        startDocumentPolling();
      }
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
      if (rows.some((doc) => doc.status === 'processing')) {
        startDocumentPolling();
      } else {
        clearDocumentPollTimer();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新文档失败');
    }
  };

  const onDeleteDocument = async (documentId: string) => {
    if (!activeConversationId) return;
    setError(null);
    try {
      await deleteConversationDocument(activeConversationId, documentId);
      if (focusedDocumentId === documentId) {
        setFocusedDocumentId(null);
      }
      const rows = await loadDocuments(activeConversationId);
      if (rows.some((doc) => doc.status === 'processing')) {
        startDocumentPolling();
      } else {
        clearDocumentPollTimer();
      }
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
                  {messages.map((msg, idx) => {
                    const docLabel =
                      msg.role === 'user' && msg.documentId
                        ? (documents.find((d) => d.id === msg.documentId)?.filename ?? '已引用文档')
                        : null;
                    return (
                      <div
                        key={msg.id ?? `${msg.role}-${idx}`}
                        className={msg.role === 'user' ? 'ml-auto max-w-[92%]' : 'max-w-[92%]'}
                      >
                        {docLabel ? (
                          <button
                            type="button"
                            aria-label={`将 ${docLabel} 作为下文上下文`}
                            className="bg-secondary text-secondary-foreground mb-1 flex w-full max-w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs"
                            onClick={() => setFocusedDocumentId(msg.documentId!)}
                          >
                            <span className="truncate font-medium">{docLabel}</span>
                            <span className="text-secondary-foreground shrink-0 opacity-70">
                              Markdown · 点击作为下文上下文
                            </span>
                          </button>
                        ) : null}
                        <div
                          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
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
            {activeConversation ? (
              <div className="border-primary/25 bg-background/90 rounded-2xl border p-3 shadow-sm">
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

                {messages.length === 0 && documents.length > 0 ? (
                  <div className="border-border/60 mb-2 max-h-28 space-y-1.5 overflow-y-auto rounded-lg border border-dashed px-2 py-2">
                    <p className="text-secondary-foreground text-[11px] font-medium">
                      本会话文档（未发送消息前可删除）
                    </p>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="text-secondary-foreground flex items-center justify-between gap-2 text-xs"
                      >
                        <button
                          type="button"
                          className="text-foreground min-w-0 truncate text-left underline-offset-2 hover:underline"
                          onClick={() => setFocusedDocumentId(doc.id)}
                        >
                          {doc.filename}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            title={
                              doc.status === 'failed' && doc.errorMessage
                                ? doc.errorMessage
                                : undefined
                            }
                          >
                            {doc.status}
                            {doc.status === 'failed' && doc.errorMessage ? (
                              <span className="text-danger ml-1">
                                （
                                {doc.errorMessage.length > 40
                                  ? `${doc.errorMessage.slice(0, 40)}…`
                                  : doc.errorMessage}
                                ）
                              </span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="underline"
                            aria-label={`删除 ${doc.filename}`}
                            onClick={() => void onDeleteDocument(doc.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {focusedDocumentId ? (
                  <div className="bg-secondary/50 mb-2 flex items-start gap-2 rounded-xl px-3 py-2.5">
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
                      'border-0 bg-transparent shadow-none px-0 min-h-10 data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent',
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
                    className="bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:opacity-90 disabled:opacity-40"
                    aria-label="发送"
                    disabled={isLoading || !input.trim()}
                    onClick={() => void onSend()}
                  >
                    {isLoading ? (
                      <span className="bg-primary-foreground/30 size-5 animate-pulse rounded-sm" />
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
