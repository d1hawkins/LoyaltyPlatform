-- V5__webhooks.sql
IF OBJECT_ID('dbo.webhook_configs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.webhook_configs (
        hook_id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        event_type         NVARCHAR(100)    NOT NULL,
        target_url         NVARCHAR(1000)   NOT NULL,
        secret_encrypted   NVARCHAR(1000)   NOT NULL,
        retry_policy_json  NVARCHAR(MAX)    NULL,
        is_active          BIT              NOT NULL DEFAULT 1,
        created_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_webhook_event_active' AND object_id = OBJECT_ID('dbo.webhook_configs'))
    CREATE INDEX ix_webhook_event_active ON dbo.webhook_configs(event_type, is_active);
GO
