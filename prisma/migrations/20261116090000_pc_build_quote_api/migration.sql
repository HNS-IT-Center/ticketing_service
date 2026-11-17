-- AlterTable
ALTER TABLE `TicketPcBuildDetail` ADD COLUMN `quote_source` ENUM('pdf', 'api') NULL,
    ADD COLUMN `quote_revision` INTEGER NULL,
    ADD COLUMN `quote_public_url` TEXT NULL,
    ADD COLUMN `quote_priced_at` DATETIME(3) NULL,
    ADD COLUMN `quote_snapshot` JSON NULL;

-- Builds opened from an uploaded PDF before this column existed.
UPDATE `TicketPcBuildDetail` SET `quote_source` = 'pdf' WHERE `quote_code` IS NOT NULL AND `quote_url` IS NOT NULL;

-- A PC build's assembly fee is the technician's job (owner, 2026-11-16). The
-- e-commerce quotation bills it as Accurate item 101048 "JASA RAKIT PC".
-- Skipped when a job of that name, or one already mapped to that Accurate
-- item, exists (names compare case-insensitively); points start at 0 for the owner to set on the
-- Daftar Jasa page.
INSERT INTO `ServiceJob` (`id`, `name`, `default_price`, `points`, `is_active`, `accurate_sku`, `accurate_name`, `created_at`, `updated_at`)
SELECT UUID(), 'Jasa Rakit PC', 150000, 0, true, '101048', 'JASA RAKIT PC', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `ServiceJob` WHERE `name` = 'Jasa Rakit PC' OR `accurate_sku` = '101048');
