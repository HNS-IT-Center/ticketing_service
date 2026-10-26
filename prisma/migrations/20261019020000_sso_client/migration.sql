-- AlterTable
ALTER TABLE `User` ADD COLUMN `sso_sub` VARCHAR(191) NULL,
    MODIFY `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA', 'Pending') NOT NULL DEFAULT 'Customer';

-- CreateTable
CREATE TABLE `SsoSession` (
    `id` VARCHAR(191) NOT NULL,
    `sid` VARCHAR(191) NULL,
    `sub` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `id_token` TEXT NOT NULL,
    `access_token` TEXT NOT NULL,
    `refresh_token` TEXT NULL,
    `access_expires_at` DATETIME(3) NOT NULL,
    `refresh_locked_until` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `SsoSession_sid_idx`(`sid`),
    INDEX `SsoSession_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_sso_sub_key` ON `User`(`sso_sub`);

-- AddForeignKey
ALTER TABLE `SsoSession` ADD CONSTRAINT `SsoSession_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

