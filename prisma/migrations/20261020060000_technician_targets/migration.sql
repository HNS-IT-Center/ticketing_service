-- CreateTable
CREATE TABLE `TechnicianTarget` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `effective_month` VARCHAR(191) NOT NULL,
    `jobs` INTEGER NULL,
    `revenue` INTEGER NULL,
    `points` INTEGER NULL,
    `use_default` BOOLEAN NOT NULL DEFAULT false,
    `updated_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TechnicianTarget_scope_effective_month_key`(`scope`, `effective_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

