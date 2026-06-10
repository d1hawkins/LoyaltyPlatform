-- Visit-based offer eligibility columns
IF COL_LENGTH('dbo.offers', 'min_visits') IS NULL
  ALTER TABLE dbo.offers ADD min_visits INT NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_window_days') IS NULL
  ALTER TABLE dbo.offers ADD visit_window_days INT NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_reset_on_redeem') IS NULL
  ALTER TABLE dbo.offers ADD visit_reset_on_redeem BIT NULL DEFAULT 0;
GO
IF COL_LENGTH('dbo.offers', 'visit_min_spend_cents') IS NULL
  ALTER TABLE dbo.offers ADD visit_min_spend_cents INT NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_min_items') IS NULL
  ALTER TABLE dbo.offers ADD visit_min_items INT NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_min_unique_sku') IS NULL
  ALTER TABLE dbo.offers ADD visit_min_unique_sku INT NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_channels_json') IS NULL
  ALTER TABLE dbo.offers ADD visit_channels_json NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.offers', 'visit_store_ids_json') IS NULL
  ALTER TABLE dbo.offers ADD visit_store_ids_json NVARCHAR(500) NULL;
GO
