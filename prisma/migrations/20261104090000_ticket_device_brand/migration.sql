-- The make of the unit picked from the Accurate catalogue (lib/catalog/brand.ts).
-- Older tickets are filled by `npm run backfill:device-brand`.
ALTER TABLE `Ticket` ADD COLUMN `device_brand` VARCHAR(191) NULL;
CREATE INDEX `Ticket_device_brand_idx` ON `Ticket`(`device_brand`);
