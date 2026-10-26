-- AlterTable
ALTER TABLE `ServiceJob` ADD COLUMN `accurate_item_id` INTEGER NULL,
    ADD COLUMN `accurate_name` TEXT NULL,
    ADD COLUMN `accurate_sku` VARCHAR(191) NULL;

