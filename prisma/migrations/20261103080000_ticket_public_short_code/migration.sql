-- A short public link for the customer, /t/[code], next to the long
-- /[date]/[share token] one, which keeps working for links already sent.
ALTER TABLE `Ticket` ADD COLUMN `public_short_code` VARCHAR(16) NULL;

-- Every existing ticket gets a code too, so the WhatsApp buttons can send the
-- short link for old tickets as well. 12 random bytes as url-safe base64 is
-- exactly 16 characters with no padding; at 96 random bits a repeat among a
-- few thousand rows is not a practical concern, and the unique index below
-- would refuse the migration rather than let one through.
UPDATE `Ticket`
SET `public_short_code` = REPLACE(REPLACE(TO_BASE64(RANDOM_BYTES(12)), '+', '-'), '/', '_')
WHERE `public_short_code` IS NULL;

CREATE UNIQUE INDEX `Ticket_public_short_code_key` ON `Ticket`(`public_short_code`);
