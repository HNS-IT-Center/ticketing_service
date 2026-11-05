-- PC build: components read from an uploaded e-commerce quotation and ticked
-- against what was brought in; photos of the components; a notification for
-- the store's coordinators when a new ticket has no technician.

-- AlterTable
ALTER TABLE `TicketPcBuildDetail` ADD COLUMN `quote_code` VARCHAR(191) NULL,
    ADD COLUMN `quote_customer` VARCHAR(191) NULL,
    ADD COLUMN `quote_sales_name` VARCHAR(191) NULL,
    ADD COLUMN `quote_total` INTEGER NULL,
    ADD COLUMN `quote_url` TEXT NULL,
    ADD COLUMN `verified_at` DATETIME(3) NULL,
    ADD COLUMN `verified_by_id` VARCHAR(191) NULL,
    ADD COLUMN `verified_by_name` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TicketPcBuildComponent` ADD COLUMN `quote_label` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TicketAttachment` MODIFY `kind` ENUM('invoice', 'unit_photo', 'quotation', 'build_photo') NULL;

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('message', 'status_update', 'assigned', 'completed', 'rma_update', 'needs_assignment') NOT NULL;

-- CreateIndex
CREATE INDEX `TicketPcBuildDetail_quote_code_idx` ON `TicketPcBuildDetail`(`quote_code`);
