-- AlterTable
ALTER TABLE `User` ADD COLUMN `is_head_technician` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `AccessRule` (
    `id` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `audience` VARCHAR(191) NOT NULL,
    `allowed` BOOLEAN NOT NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccessRule_capability_audience_key`(`capability`, `audience`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vendor` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('part_supplier', 'repair_service', 'both') NOT NULL DEFAULT 'part_supplier',
    `contact` TEXT NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vendor_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

