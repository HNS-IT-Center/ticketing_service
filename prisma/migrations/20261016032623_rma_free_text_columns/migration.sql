-- AlterTable
ALTER TABLE `RmaCase` MODIFY `stock_origin` TEXT NULL,
    MODIFY `test_result` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `TicketWarrantyDetail` MODIFY `stock_origin` TEXT NULL;
