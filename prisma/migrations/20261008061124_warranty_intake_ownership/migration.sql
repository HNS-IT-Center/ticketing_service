-- AlterTable
ALTER TABLE `TicketWarrantyDetail` ADD COLUMN `stock_origin` VARCHAR(191) NULL,
    ADD COLUMN `unit_ownership` ENUM('customer', 'store_stock') NULL,
    MODIFY `purchase_date` DATETIME(3) NULL;
