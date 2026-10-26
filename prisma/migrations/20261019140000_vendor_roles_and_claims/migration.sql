-- A vendor's roles become flags instead of one choice: a distributor that sells
-- parts often takes its brand's warranty claims too. Converted before the old
-- column is dropped, so no vendor loses what it was.
ALTER TABLE `Vendor`
    ADD COLUMN `supplies_parts` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `repairs` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `handles_claims` BOOLEAN NOT NULL DEFAULT false;

UPDATE `Vendor`
SET `supplies_parts` = `kind` IN ('part_supplier', 'both'),
    `repairs` = `kind` IN ('repair_service', 'both');

ALTER TABLE `Vendor` DROP COLUMN `kind`;

-- An RMA case now points at the vendor it went to.
ALTER TABLE `RmaCase` ADD COLUMN `vendor_id` VARCHAR(191) NULL;
CREATE INDEX `RmaCase_vendor_id_idx` ON `RmaCase`(`vendor_id`);
ALTER TABLE `RmaCase` ADD CONSTRAINT `RmaCase_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every vendor the RMA desk has already typed becomes a claim vendor
-- in the list, and its cases are linked to it. Names are compared the way the
-- unique index compares them (case-insensitive) after collapsing whitespace —
-- the rule lib/rma/vendor.ts applied when they were typed — so "Asus Service
-- Center" and "ASUS SERVICE CENTER" become one vendor. A name already in the
-- list is marked as taking claims rather than duplicated.
INSERT INTO `Vendor` (`id`, `name`, `handles_claims`, `is_active`, `created_at`, `updated_at`)
SELECT UUID(), MIN(cleaned), true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
    SELECT TRIM(REGEXP_REPLACE(`vendor_name`, '[[:space:]]+', ' ')) AS cleaned
    FROM `RmaCase`
    WHERE `vendor_name` IS NOT NULL
) named
WHERE cleaned <> ''
GROUP BY cleaned
ON DUPLICATE KEY UPDATE `handles_claims` = true;

UPDATE `RmaCase` r
JOIN `Vendor` v ON v.`name` = TRIM(REGEXP_REPLACE(r.`vendor_name`, '[[:space:]]+', ' '))
SET r.`vendor_id` = v.`id`
WHERE r.`vendor_name` IS NOT NULL;
