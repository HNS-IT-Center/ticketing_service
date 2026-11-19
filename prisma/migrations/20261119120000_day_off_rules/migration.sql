-- Libur tetap (docs: lib/day-off.ts): who covers a technician on their days off,
-- notices without a ticket, and the new "Kelola jadwal teknisi" capability.

-- AlterTable
ALTER TABLE `Notification` MODIFY `ticket_id` VARCHAR(191) NULL,
    MODIFY `type` ENUM('message', 'status_update', 'assigned', 'completed', 'rma_update', 'needs_assignment', 'schedule') NOT NULL;

-- CreateTable
CREATE TABLE `TechnicianDayOffRule` (
    `technician_id` VARCHAR(191) NOT NULL,
    `replacement_id` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `updated_by_name` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `TechnicianDayOffRule_replacement_id_idx`(`replacement_id`),
    PRIMARY KEY (`technician_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TechnicianDayOffRule` ADD CONSTRAINT `TechnicianDayOffRule_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TechnicianDayOffRule` ADD CONSTRAINT `TechnicianDayOffRule_replacement_id_fkey` FOREIGN KEY (`replacement_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Grant "Kelola jadwal teknisi" to the roles that held it by default before it
-- was a capability (Admin and store coordinators). Other roles start without
-- it; the Owner ticks it where wanted.
INSERT IGNORE INTO `AccessRoleGrant` (`role_id`, `capability`)
SELECT `id`, 'manage_schedule' FROM `AccessRole` WHERE `id` IN ('role_admin', 'role_coordinator', 'role_coordinator_head');
