-- Admin Stok (StockAdmin): a read-only view of PC builds and the parts that go
-- out on tickets, every store.
ALTER TABLE `User` MODIFY `role` ENUM('Administrator', 'Technician', 'Sales', 'Customer', 'RMA', 'Pending', 'StoreSupervisor', 'StockAdmin') NOT NULL DEFAULT 'Customer';
