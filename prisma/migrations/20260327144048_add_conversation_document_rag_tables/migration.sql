-- CreateTable
CREATE TABLE `conversation_documents` (
    `id` VARCHAR(36) NOT NULL,
    `conversation_id` VARCHAR(36) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `content_markdown` LONGTEXT NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'processing',
    `error_message` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_conversation_documents_conversation_id`(`conversation_id`),
    INDEX `idx_conversation_documents_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_document_chunks` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `conversation_id` VARCHAR(36) NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `content` LONGTEXT NOT NULL,
    `token_estimate` INTEGER NULL,
    `qdrant_point_id` VARCHAR(128) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `conversation_document_chunks_qdrant_point_id_key`(`qdrant_point_id`),
    INDEX `idx_conversation_document_chunks_document_id`(`document_id`),
    INDEX `idx_conversation_document_chunks_conversation_id`(`conversation_id`),
    INDEX `idx_conversation_document_chunks_conversation_chunk_index`(`conversation_id`, `chunk_index`),
    UNIQUE INDEX `conversation_document_chunks_document_id_chunk_index_key`(`document_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_document_index_jobs` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_conversation_document_index_jobs_document_id`(`document_id`),
    INDEX `idx_conversation_document_index_jobs_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation_documents` ADD CONSTRAINT `conversation_documents_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `conversation_document_chunks` ADD CONSTRAINT `conversation_document_chunks_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `conversation_documents`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `conversation_document_chunks` ADD CONSTRAINT `conversation_document_chunks_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `conversation_document_index_jobs` ADD CONSTRAINT `conversation_document_index_jobs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `conversation_documents`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

