-- CreateTable
CREATE TABLE `Leaderboard` (
    `id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `total_points` INTEGER NOT NULL,
    `tickets_handled` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Leaderboard_technician_id_fkey`(`technician_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `type` ENUM('message', 'status_update', 'assigned', 'completed', 'rma_update') NOT NULL,
    `reference_id` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Notification_ticket_id_fkey`(`ticket_id` ASC),
    INDEX `Notification_user_id_idx`(`user_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `RmaCase` (
    `id` VARCHAR(191) NOT NULL,
    `rma_code` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending_verification', 'on_hold', 'verified', 'submitted_to_vendor', 'in_vendor_process', 'vendor_decided', 'unit_received', 'closed', 'ineligible', 'cancelled') NOT NULL DEFAULT 'pending_verification',
    `unit_ownership` ENUM('customer', 'store_stock') NOT NULL,
    `stock_origin` VARCHAR(191) NULL,
    `purchase_invoice_url` TEXT NULL,
    `sn_verified` BOOLEAN NOT NULL DEFAULT false,
    `physical_condition` TEXT NOT NULL,
    `fault_description` TEXT NOT NULL,
    `test_result` VARCHAR(191) NOT NULL,
    `handed_over_by_id` VARCHAR(191) NOT NULL,
    `handed_over_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recommended_eligible` BOOLEAN NULL,
    `recommendation_note` TEXT NULL,
    `handler_id` VARCHAR(191) NULL,
    `hold_reason` TEXT NULL,
    `vendor_name` VARCHAR(191) NULL,
    `vendor_rma_number` VARCHAR(191) NULL,
    `shipping_tracking` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `decision` ENUM('repaired', 'replaced', 'refund', 'rejected') NULL,
    `decision_notes` TEXT NULL,
    `replacement_sn` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `unit_received_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `stock_transfer_number` VARCHAR(191) NULL,
    `customer_ticket_number` VARCHAR(191) NULL,
    `hold_reason_code` ENUM('missing_damage_video', 'missing_damage_photo', 'missing_purchase_invoice', 'other') NULL,
    INDEX `RmaCase_handed_over_by_id_fkey`(`handed_over_by_id` ASC),
    INDEX `RmaCase_handler_id_idx`(`handler_id` ASC),
    UNIQUE INDEX `RmaCase_rma_code_key`(`rma_code` ASC),
    INDEX `RmaCase_status_idx`(`status` ASC),
    UNIQUE INDEX `RmaCase_ticket_id_key`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `RmaEvent` (
    `id` VARCHAR(191) NOT NULL,
    `rma_case_id` VARCHAR(191) NOT NULL,
    `from_status` ENUM('pending_verification', 'on_hold', 'verified', 'submitted_to_vendor', 'in_vendor_process', 'vendor_decided', 'unit_received', 'closed', 'ineligible', 'cancelled') NULL,
    `to_status` ENUM('pending_verification', 'on_hold', 'verified', 'submitted_to_vendor', 'in_vendor_process', 'vendor_decided', 'unit_received', 'closed', 'ineligible', 'cancelled') NOT NULL,
    `note` TEXT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `RmaEvent_actor_id_fkey`(`actor_id` ASC),
    INDEX `RmaEvent_rma_case_id_idx`(`rma_case_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `ShiftOverride` (
    `id` VARCHAR(191) NOT NULL,
    `original_tech_id` VARCHAR(191) NOT NULL,
    `override_tech_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `shift` ENUM('morning', 'noon') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ShiftOverride_original_tech_id_date_key`(`original_tech_id` ASC, `date` ASC),
    INDEX `ShiftOverride_override_tech_id_fkey`(`override_tech_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `StoreLocation` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `StoreLocation_code_key`(`code` ASC),
    UNIQUE INDEX `StoreLocation_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TechnicianLeave` (
    `id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `reason` TEXT NULL,
    `is_off_day` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `TechnicianLeave_technician_id_date_key`(`technician_id` ASC, `date` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TechnicianPerformance` (
    `id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `tickets_handled` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `total_points_completed` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `TechnicianPerformance_technician_id_key`(`technician_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TechnicianStoreAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TechnicianStoreAssignment_store_id_fkey`(`store_id` ASC),
    INDEX `TechnicianStoreAssignment_technician_id_idx`(`technician_id` ASC),
    UNIQUE INDEX `TechnicianStoreAssignment_technician_id_store_id_key`(`technician_id` ASC, `store_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TechnicianWorkload` (
    `id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `current_points` INTEGER NOT NULL DEFAULT 0,
    `max_points` INTEGER NOT NULL DEFAULT 7,
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `TechnicianWorkload_technician_id_key`(`technician_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_code` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `ticket_type` ENUM('service', 'warranty_claim', 'pc_build', 'cleaning', 'upgrade') NOT NULL,
    `service_category` ENUM('service', 'build_pc', 'upgrade', 'diagnostic', 'on_site', 'others') NULL,
    `status` ENUM('waiting', 'on_progress', 'done', 'ready_for_pickup', 'waiting_pickup', 'handed_to_courier', 'delivered', 'completed', 'cancelled', 'rejected', 'rma_process') NOT NULL DEFAULT 'waiting',
    `device_type` ENUM('PC_Office', 'PC_Gaming', 'Laptop_Office', 'Laptop_Gaming', 'Printer', 'Other_Device') NOT NULL,
    `technician_id` VARCHAR(191) NULL,
    `sales_id` VARCHAR(191) NULL,
    `store_location_id` VARCHAR(191) NULL,
    `notes` LONGTEXT NULL,
    `technician_notes` TEXT NULL,
    `is_for_self` BOOLEAN NOT NULL DEFAULT true,
    `customer_name` VARCHAR(191) NULL,
    `customer_phone` VARCHAR(191) NULL,
    `customer_email` VARCHAR(191) NULL,
    `customer_address` TEXT NULL,
    `customer_type` ENUM('User', 'Internet_Cafe', 'Company', 'Dealer') NOT NULL DEFAULT 'User',
    `accessories` TEXT NULL,
    `device_condition` TEXT NULL,
    `device_name` VARCHAR(191) NULL,
    `device_sn` VARCHAR(191) NULL,
    `warranty_status` VARCHAR(191) NULL,
    `is_overnight` BOOLEAN NOT NULL DEFAULT false,
    `is_overnight_check` BOOLEAN NOT NULL DEFAULT false,
    `checking_fee` DECIMAL(12, 2) NULL,
    `pickup_method` ENUM('self_pickup', 'courier') NULL,
    `terms_accepted` BOOLEAN NOT NULL DEFAULT false,
    `payment_proof_url` TEXT NULL,
    `delivery_proof_url` TEXT NULL,
    `progress_proof_url` TEXT NULL,
    `revision_proof_url` TEXT NULL,
    `extra_services` LONGTEXT NOT NULL,
    `public_chat_enabled` BOOLEAN NOT NULL DEFAULT false,
    `public_share_token` VARCHAR(191) NULL,
    `work_started_at` DATETIME(3) NULL,
    `work_completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `Ticket_public_share_token_idx`(`public_share_token` ASC),
    UNIQUE INDEX `Ticket_public_share_token_key`(`public_share_token` ASC),
    INDEX `Ticket_sales_id_fkey`(`sales_id` ASC),
    INDEX `Ticket_store_location_id_idx`(`store_location_id` ASC),
    INDEX `Ticket_technician_id_idx`(`technician_id` ASC),
    UNIQUE INDEX `Ticket_ticket_code_key`(`ticket_code` ASC),
    INDEX `Ticket_user_id_idx`(`user_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketAssignmentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `technician_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `TicketAssignmentRequest_technician_id_fkey`(`technician_id` ASC),
    UNIQUE INDEX `TicketAssignmentRequest_ticket_id_technician_id_key`(`ticket_id` ASC, `technician_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `file_url` TEXT NOT NULL,
    `file_type` ENUM('image', 'video', 'pdf') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TicketAttachment_ticket_id_fkey`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketCleaningDetail` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `service_package` ENUM('Deep_Clean', 'Repaste', 'Basic_Cleaning', 'Full_Repaste', 'Full_Repaste_CPU_GPU') NOT NULL,
    UNIQUE INDEX `TicketCleaningDetail_ticket_id_key`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketMessage` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NULL,
    `sender_name` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TicketMessage_sender_id_fkey`(`sender_id` ASC),
    INDEX `TicketMessage_ticket_id_idx`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketPcBuildComponent` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `component_name` VARCHAR(191) NOT NULL,
    INDEX `TicketPcBuildComponent_ticket_id_fkey`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketPcBuildDetail` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `first_build_url` TEXT NULL,
    `revision_build_url` TEXT NULL,
    UNIQUE INDEX `TicketPcBuildDetail_ticket_id_key`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketServiceDetail` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    UNIQUE INDEX `TicketServiceDetail_ticket_id_key`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketStatusLog` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `old_status` ENUM('waiting', 'on_progress', 'done', 'ready_for_pickup', 'waiting_pickup', 'handed_to_courier', 'delivered', 'completed', 'cancelled', 'rejected', 'rma_process') NULL,
    `new_status` ENUM('waiting', 'on_progress', 'done', 'ready_for_pickup', 'waiting_pickup', 'handed_to_courier', 'delivered', 'completed', 'cancelled', 'rejected', 'rma_process') NOT NULL,
    `reason` TEXT NULL,
    `changed_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TicketStatusLog_changed_by_fkey`(`changed_by` ASC),
    INDEX `TicketStatusLog_ticket_id_fkey`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketTimeLog` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `event` ENUM('START', 'PAUSE', 'RESUME', 'DONE') NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TicketTimeLog_ticket_id_idx`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketUpgradeDetail` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `upgrade_id` VARCHAR(191) NOT NULL,
    INDEX `TicketUpgradeDetail_ticket_id_fkey`(`ticket_id` ASC),
    INDEX `TicketUpgradeDetail_upgrade_id_fkey`(`upgrade_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `TicketWarrantyDetail` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `purchase_date` DATETIME(3) NOT NULL,
    `claim_eligible` BOOLEAN NOT NULL DEFAULT true,
    `ineligibility_reason` TEXT NULL,
    UNIQUE INDEX `TicketWarrantyDetail_ticket_id_key`(`ticket_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Upgrade` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 2,
    UNIQUE INDEX `Upgrade_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA') NOT NULL DEFAULT 'Customer',
    `password` VARCHAR(191) NULL,
    `shift` ENUM('morning', 'noon') NULL,
    `work_days` LONGTEXT NULL,
    `is_team_leader` BOOLEAN NOT NULL DEFAULT false,
    `active_title` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `User_email_idx`(`email` ASC),
    UNIQUE INDEX `User_email_key`(`email` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UserTitle` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title_key` VARCHAR(191) NOT NULL,
    `title_label` VARCHAR(191) NOT NULL,
    `title_type` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL DEFAULT '?',
    `awarded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `UserTitle_user_id_idx`(`user_id` ASC),
    UNIQUE INDEX `UserTitle_user_id_title_key_key`(`user_id` ASC, `title_key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `Leaderboard` ADD CONSTRAINT `Leaderboard_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `RmaCase` ADD CONSTRAINT `RmaCase_handed_over_by_id_fkey` FOREIGN KEY (`handed_over_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `RmaCase` ADD CONSTRAINT `RmaCase_handler_id_fkey` FOREIGN KEY (`handler_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `RmaCase` ADD CONSTRAINT `RmaCase_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `RmaEvent` ADD CONSTRAINT `RmaEvent_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `RmaEvent` ADD CONSTRAINT `RmaEvent_rma_case_id_fkey` FOREIGN KEY (`rma_case_id`) REFERENCES `RmaCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ShiftOverride` ADD CONSTRAINT `ShiftOverride_original_tech_id_fkey` FOREIGN KEY (`original_tech_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ShiftOverride` ADD CONSTRAINT `ShiftOverride_override_tech_id_fkey` FOREIGN KEY (`override_tech_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TechnicianLeave` ADD CONSTRAINT `TechnicianLeave_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TechnicianPerformance` ADD CONSTRAINT `TechnicianPerformance_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TechnicianStoreAssignment` ADD CONSTRAINT `TechnicianStoreAssignment_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `StoreLocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TechnicianStoreAssignment` ADD CONSTRAINT `TechnicianStoreAssignment_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TechnicianWorkload` ADD CONSTRAINT `TechnicianWorkload_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_sales_id_fkey` FOREIGN KEY (`sales_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_store_location_id_fkey` FOREIGN KEY (`store_location_id`) REFERENCES `StoreLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketAssignmentRequest` ADD CONSTRAINT `TicketAssignmentRequest_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketAssignmentRequest` ADD CONSTRAINT `TicketAssignmentRequest_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketAttachment` ADD CONSTRAINT `TicketAttachment_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketCleaningDetail` ADD CONSTRAINT `TicketCleaningDetail_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketPcBuildComponent` ADD CONSTRAINT `TicketPcBuildComponent_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketPcBuildDetail` ADD CONSTRAINT `TicketPcBuildDetail_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketServiceDetail` ADD CONSTRAINT `TicketServiceDetail_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketStatusLog` ADD CONSTRAINT `TicketStatusLog_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketStatusLog` ADD CONSTRAINT `TicketStatusLog_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketTimeLog` ADD CONSTRAINT `TicketTimeLog_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketUpgradeDetail` ADD CONSTRAINT `TicketUpgradeDetail_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketUpgradeDetail` ADD CONSTRAINT `TicketUpgradeDetail_upgrade_id_fkey` FOREIGN KEY (`upgrade_id`) REFERENCES `Upgrade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `TicketWarrantyDetail` ADD CONSTRAINT `TicketWarrantyDetail_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `UserTitle` ADD CONSTRAINT `UserTitle_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
