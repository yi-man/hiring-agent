export type ChatRole = 'system' | 'user' | 'assistant';

export type ConversationStatus = 'active' | 'archived';

export interface Conversation {
  id: string;
  userId?: string | null;
  title?: string | null;
  status: ConversationStatus;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  documentId?: string | null;
  seq: number;
  tokenCount?: number | null;
  createdAt: string;
}

export interface CreateConversationResponse {
  conversation: Conversation;
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  total: number;
}

export interface ListMessagesResponse {
  messages: Message[];
  total: number;
}

export interface StreamMessageRequest {
  content: string;
  documentId?: string | null;
}
