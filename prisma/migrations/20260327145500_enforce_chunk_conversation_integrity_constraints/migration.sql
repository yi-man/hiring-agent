-- DropForeignKey
ALTER TABLE `conversation_document_chunks` DROP FOREIGN KEY `conversation_document_chunks_document_id_fkey`;

-- CreateIndex
CREATE UNIQUE INDEX `conversation_documents_id_conversation_id_key` ON `conversation_documents`(`id`, `conversation_id`);

-- AddForeignKey
ALTER TABLE `conversation_document_chunks` ADD CONSTRAINT `conversation_document_chunks_document_id_conversation_id_fkey` FOREIGN KEY (`document_id`, `conversation_id`) REFERENCES `conversation_documents`(`id`, `conversation_id`) ON DELETE CASCADE ON UPDATE RESTRICT;
