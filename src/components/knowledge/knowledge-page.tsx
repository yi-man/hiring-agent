'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import {
  deleteKnowledgeDocument,
  fetchKnowledgeDocuments,
  type KnowledgeDocumentDto,
  type KnowledgeDocumentStatus,
  uploadKnowledgeDocument,
} from '@/lib/knowledge/client';

const statusMeta: Record<KnowledgeDocumentStatus, { label: string; className: string }> = {
  processing: {
    label: 'processing',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
  },
  ready: {
    label: 'ready',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  failed: {
    label: 'failed',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
  },
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更新时间未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatContentSize(content: string) {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function documentDisplayTitle(doc: KnowledgeDocumentDto) {
  return doc.title?.trim() || doc.filename;
}

export function KnowledgePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestRequestIdRef = useRef(0);
  const [documents, setDocuments] = useState<KnowledgeDocumentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = async (options?: { silent?: boolean }) => {
    const requestId = ++latestRequestIdRef.current;
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const rows = await fetchKnowledgeDocuments();
      if (latestRequestIdRef.current === requestId) {
        setDocuments(rows);
      }
    } catch (e) {
      if (latestRequestIdRef.current === requestId) {
        setError(e instanceof Error ? e.message : '加载知识文档失败');
      }
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File | undefined) => {
    if (!file || isUploading) {
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      await uploadKnowledgeDocument(file);
      await loadDocuments({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传知识文档失败');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (doc: KnowledgeDocumentDto) => {
    if (deletingDocumentId) {
      return;
    }
    setDeletingDocumentId(doc.id);
    setError(null);
    try {
      await deleteKnowledgeDocument(doc.id);
      await loadDocuments({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除知识文档失败');
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">知识库</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            管理可被招聘对话和检索流程复用的 Markdown 知识文档。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            aria-label="上传知识文档"
            accept=".md,text/markdown"
            className="sr-only"
            type="file"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <Button
            className="gap-2"
            isDisabled={isUploading}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {isUploading ? '上传中' : '上传'}
          </Button>
          <Button
            className="gap-2"
            isDisabled={isLoading || isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadDocuments({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Card className="border-border rounded-lg border shadow-none">
        <CardBody className="p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div className="text-foreground text-sm font-medium">文档列表</div>
            <div className="text-muted-foreground text-xs">
              {isLoading ? '正在加载知识文档…' : `${documents.length} 个文档`}
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              正在加载知识文档…
            </div>
          ) : documents.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="border-border mx-auto flex h-10 w-10 items-center justify-center rounded-md border">
                <FileText className="text-muted-foreground h-5 w-5" aria-hidden />
              </div>
              <div className="text-foreground mt-3 text-sm font-medium">还没有知识文档</div>
              <p className="text-muted-foreground mt-1 text-sm">
                上传 Markdown 文件后会显示在这里。
              </p>
            </div>
          ) : (
            <div className="divide-border divide-y">
              {documents.map((doc) => {
                const meta = statusMeta[doc.status];
                return (
                  <article
                    key={doc.id}
                    className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_180px_56px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                        <div className="text-foreground min-w-0 truncate text-sm font-medium">
                          {doc.filename}
                        </div>
                      </div>
                      <div className="text-muted-foreground mt-1 min-w-0 truncate text-xs">
                        {documentDisplayTitle(doc)}
                        {doc.sourceLabel ? <span className="ml-2">{doc.sourceLabel}</span> : null}
                      </div>
                      {doc.errorMessage ? (
                        <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                          {doc.errorMessage}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 md:block">
                      <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
                        {meta.label}
                      </Chip>
                    </div>

                    <div className="text-muted-foreground text-xs">
                      <div>{formatUpdatedAt(doc.updatedAt)}</div>
                      <div className="mt-1">
                        {formatContentSize(doc.contentMarkdown)} · v{doc.version}
                      </div>
                    </div>

                    <div className="flex justify-start md:justify-end">
                      <Button
                        aria-label={`删除 ${doc.filename}`}
                        isDisabled={deletingDocumentId !== null}
                        size="sm"
                        type="button"
                        variant="light"
                        onClick={() => void handleDelete(doc)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
