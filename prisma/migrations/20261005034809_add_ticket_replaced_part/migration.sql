-- CreateTable
CREATE TABLE `TicketReplacedPart` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `part` ENUM('lcd', 'battery', 'keyboard', 'charger', 'ram', 'storage', 'motherboard', 'fan', 'speaker', 'casing', 'other') NOT NULL,
    `item_name` TEXT NULL,
    `notes` TEXT NULL,
    `recorded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketReplacedPart_ticket_id_idx`(`ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TicketReplacedPart` ADD CONSTRAINT `TicketReplacedPart_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketReplacedPart` ADD CONSTRAINT `TicketReplacedPart_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
