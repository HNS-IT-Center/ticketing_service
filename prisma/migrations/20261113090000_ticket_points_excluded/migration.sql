-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `points_excluded_at` DATETIME(3) NULL,
    ADD COLUMN `points_excluded_by` VARCHAR(191) NULL,
    ADD COLUMN `points_excluded_reason` TEXT NULL,
    ADD COLUMN `points_excluded_points` INTEGER NULL,
    ADD COLUMN `points_excluded_logs` INTEGER NULL;
