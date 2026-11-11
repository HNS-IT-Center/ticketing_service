-- Finance: a read-only view of store-stock warranty claims and how long each
-- vendor takes with them, every store.
ALTER TABLE `User` MODIFY `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA', 'Pending', 'StoreSupervisor', 'StockAdmin', 'Finance') NOT NULL DEFAULT 'Customer';
