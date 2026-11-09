-- The stores each kepala toko oversees.
-- CreateTable
CREATE TABLE `StoreSupervisorAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StoreSupervisorAssignment_store_id_idx`(`store_id`),
    UNIQUE INDEX `StoreSupervisorAssignment_user_id_store_id_key`(`user_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StoreSupervisorAssignment` ADD CONSTRAINT `StoreSupervisorAssignment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreSupervisorAssignment` ADD CONSTRAINT `StoreSupervisorAssignment_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `StoreLocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

