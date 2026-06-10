-- V13: Add expiry columns to points_ledger and program_config
-- Agent A-17 / Task T-17: Points Expiry Engine

-- Add expires_at to points_ledger for credit entries
IF COL_LENGTH('dbo.points_ledger', 'expires_at') IS NULL
  ALTER TABLE dbo.points_ledger ADD expires_at DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_points_ledger_expiry')
  CREATE INDEX IX_points_ledger_expiry ON dbo.points_ledger (expires_at, member_id) WHERE expires_at IS NOT NULL AND delta > 0;

-- Add expiry config to program_config
IF COL_LENGTH('dbo.program_config', 'points_expiry_months') IS NULL
  ALTER TABLE dbo.program_config ADD points_expiry_months INT NULL DEFAULT 12;

IF COL_LENGTH('dbo.program_config', 'expiry_notification_days') IS NULL
  ALTER TABLE dbo.program_config ADD expiry_notification_days NVARCHAR(50) NULL DEFAULT '30,7';
