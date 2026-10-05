-- CreateTable
CREATE TABLE `DeletedTicketLog` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_code` VARCHAR(191) NOT NULL,
    `ticket_type` ENUM('service', 'warranty_claim', 'pc_build', 'cleaning', 'upgrade') NOT NULL,
    `status` ENUM('waiting', 'on_progress', 'done', 'ready_for_pickup', 'waiting_pickup', 'handed_to_courier', 'delivered', 'completed', 'cancelled', 'rejected', 'rma_process') NOT NULL,
    `customer_name` TEXT NULL,
    `store_code` VARCHAR(191) NULL,
    `technician_name` TEXT NULL,
    `deleted_by_id` VARCHAR(191) NOT NULL,
    `deleted_by_name` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `snapshot` JSON NOT NULL,
    `points_reversed` INTEGER NOT NULL DEFAULT 0,
    `success_reversed` INTEGER NOT NULL DEFAULT 0,
    `failed_reversed` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeletedTicketLog_ticket_code_idx`(`ticket_code`),
    INDEX `DeletedTicketLog_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DeletedTicketLog` ADD CONSTRAINT `DeletedTicketLog_deleted_by_id_fkey` FOREIGN KEY (`deleted_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
