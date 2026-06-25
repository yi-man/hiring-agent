export type KnowledgeDocumentStatus = 'processing' | 'ready' | 'failed';

export type KnowledgeDocumentDto = {
  id: string;
  userId?: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
  contentMarkdown: string;
  status: KnowledgeDocumentStatus;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchKnowledgeDocuments(): Promise<KnowledgeDocumentDto[]> {
  const res = await fetch('/api/knowledge/documents');
  const data = await readJson<{ documents?: KnowledgeDocumentDto[] }>(res);
  if (!res.ok || !Array.isArray(data.documents)) {
    throw new Error(data.error || '加载知识文档失败');
  }
  return data.documents;
}

export async function uploadKnowledgeDocument(file: File): Promise<KnowledgeDocumentDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/knowledge/documents', {
    method: 'POST',
    body: form,
  });
  const data = await readJson<{ document?: KnowledgeDocumentDto }>(res);
  if (!res.ok || !data.document) {
    throw new Error(data.error || '上传知识文档失败');
  }
  return data.document;
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/knowledge/documents/${documentId}`, {
    method: 'DELETE',
  });
  const data = await readJson<{ deleted?: boolean }>(res);
  if (!res.ok || !data.deleted) {
    throw new Error(data.error || '删除知识文档失败');
  }
}
