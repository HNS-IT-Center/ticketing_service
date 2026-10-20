-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `device_catalog_category` VARCHAR(191) NULL,
    ADD COLUMN `device_catalog_item_id` INTEGER NULL,
    ADD COLUMN `device_sku` VARCHAR(191) NULL,
    MODIFY `device_name` TEXT NULL;

-- CreateIndex
CREATE INDEX `Ticket_device_sku_idx` ON `Ticket`(`device_sku`);

