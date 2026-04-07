-- CreateTable
CREATE TABLE `workflow_learning_workflows` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `goal` TEXT NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `steps` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `idx_workflow_learning_workflows_user_id`(`user_id`),
  INDEX `idx_workflow_learning_workflows_user_updated_at`(`user_id`, `updated_at` DESC),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_learning_workflow_versions` (
  `id` VARCHAR(36) NOT NULL,
  `workflow_id` VARCHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `steps` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_workflow_learning_workflow_versions_workflow_id`(`workflow_id`),
  INDEX `idx_workflow_learning_workflow_versions_workflow_version`(`workflow_id`, `version`),
  UNIQUE INDEX `workflow_learning_workflow_versions_workflow_id_version_key`(`workflow_id`, `version`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_learning_runs` (
  `id` VARCHAR(36) NOT NULL,
  `workflow_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `error_message` TEXT NULL,
  `recovered` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `idx_workflow_learning_runs_workflow_id`(`workflow_id`),
  INDEX `idx_workflow_learning_runs_user_id`(`user_id`),
  INDEX `idx_workflow_learning_runs_status`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_learning_run_steps` (
  `id` VARCHAR(36) NOT NULL,
  `run_id` VARCHAR(36) NOT NULL,
  `step_id` VARCHAR(128) NOT NULL,
  `tool` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `args` JSON NOT NULL,
  `result` LONGTEXT NULL,
  `error` TEXT NULL,
  `duration_ms` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_workflow_learning_run_steps_run_id`(`run_id`),
  INDEX `idx_workflow_learning_run_steps_run_created_at`(`run_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workflow_learning_workflows`
  ADD CONSTRAINT `workflow_learning_workflows_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `workflow_learning_workflow_versions`
  ADD CONSTRAINT `workflow_learning_workflow_versions_workflow_id_fkey`
  FOREIGN KEY (`workflow_id`) REFERENCES `workflow_learning_workflows`(`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `workflow_learning_runs`
  ADD CONSTRAINT `workflow_learning_runs_workflow_id_fkey`
  FOREIGN KEY (`workflow_id`) REFERENCES `workflow_learning_workflows`(`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `workflow_learning_runs`
  ADD CONSTRAINT `workflow_learning_runs_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `workflow_learning_run_steps`
  ADD CONSTRAINT `workflow_learning_run_steps_run_id_fkey`
  FOREIGN KEY (`run_id`) REFERENCES `workflow_learning_runs`(`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;
