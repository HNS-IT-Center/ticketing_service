-- Kepala toko (StoreSupervisor): a read-only view of their own stores' progress.
ALTER TABLE `User` MODIFY `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA', 'Pending', 'StoreSupervisor') NOT NULL DEFAULT 'Customer';
