export type ConversationDto = {
  id: string;
  title?: string | null;
};

export type MessageDto = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ConversationPageDto = {
  conversations: ConversationDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type ConversationDocumentStatus = 'processing' | 'ready' | 'failed';

export type ConversationDocumentDto = {
  id: string;
  conversationId: string;
  filename: string;
  contentMarkdown: string;
  status: ConversationDocumentStatus;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchConversations(params?: {
  page?: number;
  limit?: number;
}): Promise<ConversationPageDto> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const res = await fetch(`/api/conversations?page=${page}&limit=${limit}`);
  const data = (await res.json()) as ConversationPageDto & { error?: string };
  if (!res.ok || !data.conversations) throw new Error(data.error || '加载会话失败');
  return data;
}

export async function createConversationApi(): Promise<ConversationDto> {
  const res = await fetch('/api/conversations', { method: 'POST' });
  const data = (await res.json()) as { conversation?: ConversationDto; error?: string };
  if (!res.ok || !data.conversation) throw new Error(data.error || '创建会话失败');
  return data.conversation;
}

export async function fetchConversationMessages(conversationId: string): Promise<MessageDto[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  const data = (await res.json()) as { messages?: MessageDto[]; error?: string };
  if (!res.ok || !data.messages) throw new Error(data.error || '加载消息失败');
  return data.messages;
}

export async function streamConversationMessage(
  conversationId: string,
  content: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Chat request failed');
  }
  return res.body;
}

export async function uploadConversationDocument(
  conversationId: string,
  file: File,
): Promise<ConversationDocumentDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/conversations/${conversationId}/documents`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json()) as { document?: ConversationDocumentDto; error?: string };
  if (!res.ok || !data.document) {
    throw new Error(data.error || '上传文档失败');
  }
  return data.document;
}

export async function fetchConversationDocuments(
  conversationId: string,
): Promise<ConversationDocumentDto[]> {
  const res = await fetch(`/api/conversations/${conversationId}/documents`);
  const data = (await res.json()) as { documents?: ConversationDocumentDto[]; error?: string };
  if (!res.ok || !data.documents) {
    throw new Error(data.error || '加载文档列表失败');
  }
  return data.documents;
}

export async function fetchConversationDocumentDetail(
  conversationId: string,
  documentId: string,
): Promise<ConversationDocumentDto> {
  const res = await fetch(`/api/conversations/${conversationId}/documents/${documentId}`);
  const data = (await res.json()) as { document?: ConversationDocumentDto; error?: string };
  if (!res.ok || !data.document) {
    throw new Error(data.error || '加载文档详情失败');
  }
  return data.document;
}

export async function deleteConversationDocument(
  conversationId: string,
  documentId: string,
): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}/documents/${documentId}`, {
    method: 'DELETE',
  });
  const data = (await res.json()) as { deleted?: boolean; error?: string };
  if (!res.ok || !data.deleted) {
    throw new Error(data.error || '删除文档失败');
  }
}
