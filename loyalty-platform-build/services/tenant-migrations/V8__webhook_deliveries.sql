-- V8__webhook_deliveries.sql
IF OBJECT_ID('dbo.webhook_deliveries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.webhook_deliveries (
    delivery_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    hook_id UNIQUEIDENTIFIER NOT NULL,
    event_id UNIQUEIDENTIFIER NOT NULL,
    event_type NVARCHAR(100) NOT NULL,
    target_url NVARCHAR(2048) NOT NULL,
    payload NVARCHAR(MAX) NOT NULL,
    attempt INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_attempt_at DATETIME2 NULL,
    last_attempt_at DATETIME2 NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|in_flight|delivered|failed|dead
    last_status_code INT NULL,
    last_error NVARCHAR(MAX) NULL,
    signature NVARCHAR(256) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    INDEX IX_webhook_deliveries_status_next_attempt (status, next_attempt_at),
    INDEX IX_webhook_deliveries_hook_id (hook_id)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_webhook_deliveries_hook_event'
    AND object_id = OBJECT_ID('dbo.webhook_deliveries')
)
  CREATE UNIQUE INDEX UX_webhook_deliveries_hook_event
    ON dbo.webhook_deliveries(hook_id, event_id);
GO
