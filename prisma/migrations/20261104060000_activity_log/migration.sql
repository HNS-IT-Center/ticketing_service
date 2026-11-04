-- Who did what in the application, read on /admin/activity. No foreign keys:
-- the row outlives the user and the record it names (see schema.prisma).
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor_id` VARCHAR(191) NULL,
    `actor_name` TEXT NOT NULL,
    `actor_role` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NULL,
    `entity_id` VARCHAR(191) NULL,
    `entity_label` TEXT NULL,
    `summary` TEXT NOT NULL,

    INDEX `ActivityLog_created_at_idx`(`created_at`),
    INDEX `ActivityLog_actor_id_created_at_idx`(`actor_id`, `created_at`),
    INDEX `ActivityLog_action_created_at_idx`(`action`, `created_at`),
    INDEX `ActivityLog_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
