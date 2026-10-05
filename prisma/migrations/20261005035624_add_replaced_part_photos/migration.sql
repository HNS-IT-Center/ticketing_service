-- CreateTable
CREATE TABLE `TicketReplacedPartPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `part_id` VARCHAR(191) NOT NULL,
    `file_url` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketReplacedPartPhoto_part_id_idx`(`part_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TicketReplacedPartPhoto` ADD CONSTRAINT `TicketReplacedPartPhoto_part_id_fkey` FOREIGN KEY (`part_id`) REFERENCES `TicketReplacedPart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
