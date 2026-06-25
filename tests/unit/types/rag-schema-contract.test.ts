import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('rag schema contract', () => {
  it('includes rag model and key constraint contracts', () => {
    const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
    const schema = readFileSync(schemaPath, 'utf8');

    const requiredSnippets = [
      'model ConversationDocument {',
      'model ConversationDocumentChunk {',
      'model ConversationDocumentIndexJob {',
      '@@map("conversation_documents")',
      '@@map("conversation_document_chunks")',
      '@@map("conversation_document_index_jobs")',
      '@@unique([documentId, chunkIndex]',
      '@@unique([id, conversationId]',
      '@relation(fields: [documentId, conversationId], references: [id, conversationId]',
      'model KnowledgeDocument {',
      'model KnowledgeDocumentChunk {',
      'model KnowledgeDocumentIndexJob {',
      '@@map("knowledge_documents")',
      '@@map("knowledge_document_chunks")',
      '@@map("knowledge_document_index_jobs")',
      'Unsupported("vector")',
      '@@unique([documentId, chunkIndex]',
      '@relation(fields: [userId], references: [id]',
    ];

    for (const snippet of requiredSnippets) {
      expect(schema).toContain(snippet);
    }
    expect(schema).toMatch(/\bdocuments\s+ConversationDocument\[\]/);
    expect(schema).toMatch(/\bknowledgeDocuments\s+KnowledgeDocument\[\]/);
    expect(schema).toMatch(/\bknowledgeDocumentChunks\s+KnowledgeDocumentChunk\[\]/);
  });
});
