-- Owner: the boss. Everything an Administrator may, always, and the only one
-- who changes Pengaturan Akses and the Administrator / Owner accounts.
ALTER TABLE `User` MODIFY `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA', 'Pending', 'StoreSupervisor', 'StockAdmin', 'Finance', 'Owner') NOT NULL DEFAULT 'Customer';
