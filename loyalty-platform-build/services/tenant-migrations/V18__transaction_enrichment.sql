-- Add enrichment columns to transactions table
IF COL_LENGTH('dbo.transactions', 'store_id') IS NULL
  ALTER TABLE dbo.transactions ADD store_id NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'store_name') IS NULL
  ALTER TABLE dbo.transactions ADD store_name NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'register_id') IS NULL
  ALTER TABLE dbo.transactions ADD register_id NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'associate_id') IS NULL
  ALTER TABLE dbo.transactions ADD associate_id NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'associate_name') IS NULL
  ALTER TABLE dbo.transactions ADD associate_name NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'source_channel') IS NULL
  ALTER TABLE dbo.transactions ADD source_channel NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'source_system') IS NULL
  ALTER TABLE dbo.transactions ADD source_system NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'order_ref') IS NULL
  ALTER TABLE dbo.transactions ADD order_ref NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.transactions', 'basket_size') IS NULL
  ALTER TABLE dbo.transactions ADD basket_size INT NULL;
GO
IF COL_LENGTH('dbo.transactions', 'metadata_json') IS NULL
  ALTER TABLE dbo.transactions ADD metadata_json NVARCHAR(MAX) NULL;
GO

-- Indexes for common query patterns
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_transactions_store')
  CREATE INDEX IX_transactions_store ON dbo.transactions (store_id, occurred_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_transactions_associate')
  CREATE INDEX IX_transactions_associate ON dbo.transactions (associate_id, occurred_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_transactions_source_channel')
  CREATE INDEX IX_transactions_source_channel ON dbo.transactions (source_channel, occurred_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_transactions_order_ref')
  CREATE UNIQUE INDEX IX_transactions_order_ref ON dbo.transactions (order_ref) WHERE order_ref IS NOT NULL;
GO
