-- In town (LKL) or out of town (ITR), from the shop's supplier list. Nullable:
-- vendors already on the list have not been marked yet. The list itself is
-- loaded by `npm run import:vendors`, not here, so it can grow without a new
-- migration.
ALTER TABLE `Vendor` ADD COLUMN `location` ENUM('in_town', 'out_of_town') NULL;
