-- AlterTable
ALTER TABLE `TicketPcBuildComponent` ADD COLUMN `catalog_category` VARCHAR(191) NULL,
    ADD COLUMN `catalog_item_id` INTEGER NULL,
    ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `sku` VARCHAR(191) NULL,
    MODIFY `component_name` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `TicketUpgradeDetail` ADD COLUMN `catalog_category` VARCHAR(191) NULL,
    ADD COLUMN `catalog_item_id` INTEGER NULL,
    ADD COLUMN `item_name` TEXT NULL,
    ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `sku` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `TicketPcBuildComponent_sku_idx` ON `TicketPcBuildComponent`(`sku`);

-- CreateIndex
CREATE INDEX `TicketUpgradeDetail_sku_idx` ON `TicketUpgradeDetail`(`sku`);

