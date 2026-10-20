-- AlterTable
ALTER TABLE `TicketCharge` ADD COLUMN `job_points` INTEGER NULL,
    ADD COLUMN `service_job_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ServiceJob` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `default_price` INTEGER NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServiceJob_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `TicketCharge_service_job_id_idx` ON `TicketCharge`(`service_job_id`);

-- AddForeignKey
ALTER TABLE `TicketCharge` ADD CONSTRAINT `TicketCharge_service_job_id_fkey` FOREIGN KEY (`service_job_id`) REFERENCES `ServiceJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- A starting list, so the bill has something to pick from on day one. The six
-- "extra services" a technician could tick until now keep the points they had
-- (ExtraPointsPanel); every other job starts at 0 points and no default price,
-- for the owner to set on the Daftar Jasa page.
INSERT INTO `ServiceJob` (`id`, `name`, `default_price`, `points`, `is_active`, `created_at`, `updated_at`) VALUES
    (UUID(), 'Diagnosa / Pengecekan', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Ganti LCD', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Ganti Baterai', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Ganti Keyboard', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Perbaikan / Ganti Engsel', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Ganti Kipas', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Upgrade RAM', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Upgrade SSD / HDD', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Upgrade Part Lainnya', NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Install Ulang OS', NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Install Software', NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Thermal Repaste', NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Deep Cleaning', NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Cable Management', NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Backup / Pindah Data', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (UUID(), 'Perbaikan Motherboard', NULL, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
