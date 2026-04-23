'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, FileCode, Paperclip, RefreshCw, X } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import {
  approvePatternRun,
  createConversationApi,
  deleteConversationDocument,
  fetchConversationDocuments,
  fetchConversationMessages,
  fetchConversations,
  type ConversationDocumentDto,
  type PatternRunEvent,
  streamPatternRun,
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

type PatternMeta = { id: string; label: string };
type BranchSnapshot = {
  id: string;
  label: string;
  sourceMessageIndex: number;
  messages: ChatMessage[];
};

const PATTERNS: PatternMeta[] = [
  { id: 'basic_streaming_chat', label: 'Basic Streaming Chat' },
  { id: 'memory_persistence', label: 'Memory Persistence' },
  { id: 'rag_over_uploaded_doc', label: 'RAG over Uploaded Doc' },
  { id: 'source_grounding', label: 'Source Grounding' },
  { id: 'tool_calling', label: 'Tool Calling' },
  { id: 'agent_trace_stream', label: 'Agent Trace Stream' },
  { id: 'structured_output', label: 'Structured Output' },
  { id: 'human_approval_gate', label: 'Human Approval Gate' },
  { id: 'error_recovery_retry', label: 'Error Recovery Retry' },
];

function StreamingIndicator() {
  return (
    <div className="text-secondary-foreground inline-flex items-center gap-2 text-xs">
      <span className="relative inline-flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
      </span>
      AI 正在整理回答...
    </div>
  );
}

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
  const [selectedPatternId, setSelectedPatternId] = useState<string>('basic_streaming_chat');
  const [runEvents, setRunEvents] = useState<PatternRunEvent[]>([]);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [latestApprovalToken, setLatestApprovalToken] = useState<string | null>(null);
  const [lastRetryInput, setLastRetryInput] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<
    { id: string; label: string; messages: ChatMessage[] }[]
  >([]);
  const [branches, setBranches] = useState<BranchSnapshot[]>([]);
  const [queuePending, setQueuePending] = useState(0);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const documentPollTimerRef = useRef<number | null>(null);
  const documentPollSessionIdRef = useRef(0);
  const latestDocumentRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isQueueRunningRef = useRef(false);
  const queueRef = useRef<{ text: string; assistantIndex: number }[]>([]);

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
    setRunEvents([]);
    setLatestRunId(null);
    setLatestApprovalToken(null);
    setCheckpoints([]);
    setBranches([]);
    setQueuePending(0);
    queueRef.current = [];
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

  const pushCheckpoint = (label: string) => {
    setCheckpoints((prev) => [
      ...prev,
      {
        id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        messages,
      },
    ]);
  };

  const runPatternMode = async (
    text: string,
    options?: {
      runId?: string;
      fromSeq?: number;
      approvalToken?: string;
      replayOnly?: boolean;
      assistantIndex?: number;
    },
  ) => {
    if (!activeConversationId) return;
    const stream = await streamPatternRun(activeConversationId, {
      content: text,
      patternId: selectedPatternId,
      runId: options?.runId,
      fromSeq: options?.fromSeq,
      approvalToken: options?.approvalToken,
      replayOnly: options?.replayOnly,
    });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantAccumulated = '';
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (!block.startsWith('data:')) continue;
        const line = block.slice(5).trim();
        if (!line) continue;
        const event = JSON.parse(line) as PatternRunEvent;
        setRunEvents((prev) => [...prev, event]);
        if (event.type === 'run_start' && typeof event.runId === 'string') {
          setLatestRunId(event.runId);
        }
        if (event.type === 'approval_required' && typeof event.approvalToken === 'string') {
          setLatestApprovalToken(event.approvalToken);
        }
        if (event.type === 'queue_state' && typeof event.pending === 'number') {
          setQueuePending(event.pending);
        }
        if (event.type === 'assistant_delta' && typeof event.text === 'string') {
          assistantAccumulated += event.text;
          setMessages((prev) => {
            const next = [...prev];
            const targetIndex =
              typeof options?.assistantIndex === 'number'
                ? options.assistantIndex
                : next.length - 1;
            const target = next[targetIndex];
            if (!target || target.role !== 'assistant') return prev;
            next[targetIndex] = { ...target, content: assistantAccumulated };
            return next;
          });
        }
        if (event.type === 'assistant_final' && typeof event.text === 'string') {
          const finalText = event.text;
          setMessages((prev) => {
            const next = [...prev];
            const targetIndex =
              typeof options?.assistantIndex === 'number'
                ? options.assistantIndex
                : next.length - 1;
            const target = next[targetIndex];
            if (!target || target.role !== 'assistant') return prev;
            next[targetIndex] = { ...target, content: finalText };
            return next;
          });
          if (selectedPatternId === 'memory_persistence') {
            pushCheckpoint(`快照 ${new Date().toLocaleTimeString()}`);
          }
        }
        if (event.type === 'error' && typeof event.message === 'string') {
          if (selectedPatternId === 'error_recovery_retry') {
            setLastRetryInput(text);
          }
          throw new Error(event.message);
        }
      }
    }
    await loadConversations({ reset: true });
  };

  const enqueuePatternMessage = (text: string) => {
    let assistantIndex = -1;
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        { role: 'user', content: text, documentId: null },
        { role: 'assistant', content: '' },
      ];
      assistantIndex = next.length - 1;
      return next;
    });
    return assistantIndex;
  };

  const pumpQueue = async () => {
    if (isQueueRunningRef.current || !queueRef.current.length) return;
    isQueueRunningRef.current = true;
    try {
      while (queueRef.current.length) {
        const item = queueRef.current.shift();
        setQueuePending(queueRef.current.length);
        if (!item) break;
        await runPatternMode(item.text, { assistantIndex: item.assistantIndex });
      }
    } finally {
      isQueueRunningRef.current = false;
      setQueuePending(queueRef.current.length);
    }
  };

  const createBranchSnapshot = (sourceMessageIndex: number) => {
    const baseMessages = messages.slice(0, sourceMessageIndex + 1);
    const branch: BranchSnapshot = {
      id: `br-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `分支 ${branches.length + 1}`,
      sourceMessageIndex,
      messages: baseMessages,
    };
    setBranches((prev) => [...prev, branch]);
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !activeConversationId) return;
    setLastAssistantError(null);
    const focusedRow = focusedDocumentId
      ? documents.find((d) => d.id === focusedDocumentId)
      : undefined;
    const docForSend =
      focusedDocumentId && focusedRow?.status === 'ready' ? focusedDocumentId : undefined;

    setInput('');
    setError(null);

    try {
      if (selectedPatternId === 'memory_persistence') {
        const assistantIndex = enqueuePatternMessage(text);
        queueRef.current.push({ text, assistantIndex });
        setQueuePending(queueRef.current.length);
        void pumpQueue();
      } else if (
        selectedPatternId === 'basic_streaming_chat' ||
        selectedPatternId === 'rag_over_uploaded_doc'
      ) {
        let assistantIndex = -1;
        setMessages((prev) => {
          const next: ChatMessage[] = [
            ...prev,
            { role: 'user', content: text, documentId: docForSend ?? null },
            { role: 'assistant', content: '' },
          ];
          assistantIndex = next.length - 1;
          return next;
        });
        setIsLoading(true);
        await runPatternMode(text, { assistantIndex });
      } else {
        const assistantIndex = enqueuePatternMessage(text);
        setIsLoading(true);
        await runPatternMode(text, { assistantIndex });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败';
      setError(message);
      setLastAssistantError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onApproveLatest = async () => {
    if (!activeConversationId || !latestRunId || !latestApprovalToken || isLoading) return;
    setIsLoading(true);
    try {
      await approvePatternRun(activeConversationId, {
        runId: latestRunId,
        approvalToken: latestApprovalToken,
        approved: true,
      });
      await runPatternMode(input.trim() || '继续执行审批后的任务', {
        runId: latestRunId,
        approvalToken: latestApprovalToken,
      });
      setLatestApprovalToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '审批失败');
    } finally {
      setIsLoading(false);
    }
  };

  const onRetryPattern = async () => {
    if (!lastRetryInput || !activeConversationId || isLoading) return;
    setIsLoading(true);
    setLastAssistantError(null);
    try {
      const assistantIndex = enqueuePatternMessage(lastRetryInput.replace('fail', 'recover'));
      await runPatternMode(lastRetryInput.replace('fail', 'recover'), { assistantIndex });
      setLastRetryInput(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败');
      setLastAssistantError(e instanceof Error ? e.message : '重试失败');
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
          <div className="mb-2 flex flex-wrap gap-2">
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  selectedPatternId === pattern.id
                    ? 'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100'
                    : 'border-border/80 bg-background hover:bg-secondary/70'
                }`}
                onClick={() => setSelectedPatternId(pattern.id)}
              >
                {pattern.label}
              </button>
            ))}
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
                        {selectedPatternId === 'memory_persistence' && msg.role === 'user' ? (
                          <button
                            type="button"
                            className="mb-1 rounded-lg border border-dashed border-violet-300/80 bg-violet-50/70 px-2 py-1 text-[11px] text-violet-900 hover:opacity-90 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100"
                            onClick={() => createBranchSnapshot(idx)}
                          >
                            以这条消息创建分支
                          </button>
                        ) : null}
                        <MessageBubble role={msg.role}>
                          {msg.role === 'assistant' ? (
                            msg.content ? (
                              <AssistantMarkdown>{msg.content}</AssistantMarkdown>
                            ) : (
                              <StreamingIndicator />
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
                      <p className="font-medium">回复中断</p>
                      <p className="mt-1 opacity-90">{lastAssistantError}</p>
                      <p className="mt-2 text-xs opacity-80">你可以直接再次发送消息继续会话。</p>
                    </div>
                  ) : null}
                  {runEvents.length > 0 ? (
                    <div className="border-border/70 rounded-2xl border bg-slate-50/65 p-3 text-xs dark:bg-slate-950/30">
                      <p className="mb-2 font-medium">运行轨迹</p>
                      <div className="space-y-1.5">
                        {runEvents.slice(-10).map((event) => (
                          <div
                            key={`${event.runId}-${event.seq}`}
                            className="text-secondary-foreground"
                          >
                            <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                              {String(event.type)}
                            </span>
                            {' · '}
                            <span className="truncate">
                              {JSON.stringify(event).slice(0, 100)}
                              {JSON.stringify(event).length > 100 ? '...' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedPatternId === 'structured_output' ? (
                    <div className="bg-background/70 border-border/70 rounded-2xl border p-3 text-xs">
                      <p className="mb-2 font-medium">Structured Output</p>
                      {runEvents
                        .filter((event) => event.type === 'structured_output')
                        .slice(-1)
                        .map((event) => (
                          <pre
                            key={`${event.runId}-${event.seq}`}
                            className="overflow-x-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100"
                          >
                            {JSON.stringify(event, null, 2)}
                          </pre>
                        ))}
                    </div>
                  ) : null}
                  {selectedPatternId === 'source_grounding' ? (
                    <div className="bg-background/70 border-border/70 rounded-2xl border p-3 text-xs">
                      <p className="mb-2 font-medium">Source Grounding</p>
                      {runEvents
                        .filter((event) => event.type === 'checkpoint_created')
                        .slice(-2)
                        .map((event) => (
                          <p
                            key={`${event.runId}-${event.seq}`}
                            className="text-secondary-foreground truncate"
                          >
                            {JSON.stringify(event)}
                          </p>
                        ))}
                    </div>
                  ) : null}
                  {selectedPatternId === 'memory_persistence' ? (
                    <div className="bg-background/70 border-border/70 rounded-2xl border p-3 text-xs">
                      <p className="mb-2 font-medium">Branching</p>
                      <p className="text-secondary-foreground mb-2">
                        选择任意用户消息创建分支快照，再点击快照可切回该上下文。
                      </p>
                      {branches.length ? (
                        <div className="flex flex-wrap gap-2">
                          {branches.map((branch) => (
                            <button
                              key={branch.id}
                              type="button"
                              className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 hover:opacity-90 dark:border-violet-800 dark:bg-violet-950/35"
                              onClick={() => setMessages(branch.messages)}
                            >
                              {branch.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-secondary-foreground">暂无分支快照</p>
                      )}
                    </div>
                  ) : null}
                  {selectedPatternId === 'memory_persistence' && checkpoints.length ? (
                    <div className="bg-background/70 border-border/70 rounded-2xl border p-3 text-xs">
                      <p className="mb-2 font-medium">Memory 快照</p>
                      <div className="flex flex-wrap gap-2">
                        {checkpoints.map((cp) => (
                          <button
                            key={cp.id}
                            type="button"
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 hover:opacity-90 dark:border-sky-800 dark:bg-sky-950/40"
                            onClick={() => setMessages(cp.messages)}
                          >
                            {cp.label}
                          </button>
                        ))}
                      </div>
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
                  {selectedPatternId === 'memory_persistence' ? (
                    <span className="text-secondary-foreground rounded-md border border-sky-200/70 bg-sky-50 px-2 py-1 text-[11px] dark:border-sky-800 dark:bg-sky-950/35">
                      队列待处理: {queuePending}
                    </span>
                  ) : null}
                  {latestApprovalToken && selectedPatternId === 'human_approval_gate' ? (
                    <button
                      type="button"
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:opacity-90 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      onClick={() => void onApproveLatest()}
                    >
                      批准继续
                    </button>
                  ) : null}
                  {selectedPatternId === 'error_recovery_retry' && lastRetryInput ? (
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900 hover:opacity-90 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
                      onClick={() => void onRetryPattern()}
                    >
                      一键重试
                    </button>
                  ) : null}
                  {selectedPatternId === 'agent_trace_stream' && latestRunId ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs hover:opacity-90 dark:border-slate-700 dark:bg-slate-900"
                      onClick={() =>
                        void runPatternMode(input.trim() || '重连拉取事件', {
                          runId: latestRunId,
                          fromSeq: Math.max(0, runEvents.length - 3),
                          replayOnly: true,
                        })
                      }
                    >
                      断线重连
                    </button>
                  ) : null}
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
