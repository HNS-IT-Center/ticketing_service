-- AlterTable
ALTER TABLE `TicketReplacedPart` ADD COLUMN `catalog_category` VARCHAR(191) NULL,
    ADD COLUMN `catalog_item_id` INTEGER NULL,
    ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `sku` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `TicketReplacedPart_sku_idx` ON `TicketReplacedPart`(`sku`);

-- CreateIndex
CREATE INDEX `TicketReplacedPart_created_at_idx` ON `TicketReplacedPart`(`created_at`);

