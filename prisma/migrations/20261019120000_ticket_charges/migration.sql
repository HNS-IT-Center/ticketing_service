-- CreateTable
CREATE TABLE `TicketCharge` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('part', 'external_service', 'service_fee', 'other') NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `replaced_part_id` VARCHAR(191) NULL,
    `vendor_id` VARCHAR(191) NULL,
    `unit_cost` INTEGER NULL,
    `unit_price` INTEGER NULL,
    `sent_at` DATETIME(3) NULL,
    `returned_at` DATETIME(3) NULL,
    `external_result` ENUM('repaired', 'not_repaired') NULL,
    `external_note` TEXT NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TicketCharge_replaced_part_id_key`(`replaced_part_id`),
    INDEX `TicketCharge_ticket_id_idx`(`ticket_id`),
    INDEX `TicketCharge_vendor_id_idx`(`vendor_id`),
    INDEX `TicketCharge_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_replaced_part_id_fkey` FOREIGN KEY (`replaced_part_id`) REFERENCES `TicketReplacedPart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every part already recorded gets its price line, unpriced, so the
-- bill of a ticket in progress is complete from the start. Same description
-- rule as the application: the item's name, else the category's label
-- (lib/service-parts.ts).
INSERT INTO `TicketCharge` (`id`, `ticket_id`, `kind`, `description`, `quantity`, `replaced_part_id`, `created_by_id`, `created_at`, `updated_at`)
SELECT
    UUID(),
    p.`ticket_id`,
    'part',
    COALESCE(NULLIF(TRIM(p.`item_name`), ''), CASE p.`part`
        WHEN 'lcd' THEN 'LCD / Layar'
        WHEN 'battery' THEN 'Baterai'
        WHEN 'keyboard' THEN 'Keyboard'
        WHEN 'charger' THEN 'Charger / Adaptor'
        WHEN 'ram' THEN 'RAM'
        WHEN 'storage' THEN 'Penyimpanan (SSD / HDD)'
        WHEN 'motherboard' THEN 'Motherboard'
        WHEN 'fan' THEN 'Kipas / Pendingin'
        WHEN 'speaker' THEN 'Speaker'
        WHEN 'casing' THEN 'Casing / Bodi'
        ELSE 'Lainnya'
    END),
    p.`quantity`,
    p.`id`,
    p.`recorded_by_id`,
    p.`created_at`,
    CURRENT_TIMESTAMP(3)
FROM `TicketReplacedPart` p;
