CREATE TABLE IF NOT EXISTS `conversations` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(128) NULL,
  `title` VARCHAR(255) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `last_active_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `conversations_last_active_at_idx` (`last_active_at` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(36) NOT NULL,
  `conversation_id` VARCHAR(36) NOT NULL,
  `role` VARCHAR(16) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `seq` INTEGER NOT NULL,
  `token_count` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `messages_conversation_id_seq_key` (`conversation_id`, `seq`),
  INDEX `idx_messages_conversation_seq` (`conversation_id`, `seq`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `messages`
  ADD CONSTRAINT `messages_conversation_id_fkey`
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
