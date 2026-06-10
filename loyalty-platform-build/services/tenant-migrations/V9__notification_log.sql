-- V9__notification_log.sql
-- Notification service tables (T-10 / A-10).
-- Idempotent: guards so repeated migration runs are safe.

IF OBJECT_ID('dbo.notification_log', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.notification_log (
    notification_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    member_id UNIQUEIDENTIFIER NOT NULL,
    channel NVARCHAR(20) NOT NULL,        -- email | sms | push
    template_key NVARCHAR(100) NOT NULL,   -- welcome, tier_upgraded, points_earned_digest, etc.
    subject NVARCHAR(500) NULL,
    body_preview NVARCHAR(1000) NULL,
    recipient NVARCHAR(500) NOT NULL,      -- encrypted recipient (AES-256-GCM blob, base64)
    recipient_hash NVARCHAR(128) NOT NULL, -- hex(hmac-sha256(pepper, lower(trim(recipient))))
    status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed | suppressed
    provider NVARCHAR(50) NULL,            -- azure-comm | sendgrid | twilio | noop
    provider_message_id NVARCHAR(200) NULL,
    error NVARCHAR(MAX) NULL,
    triggered_by_event_id UNIQUEIDENTIFIER NULL,
    locale NVARCHAR(10) NOT NULL DEFAULT 'en-US',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    sent_at DATETIME2 NULL,
    INDEX IX_notification_log_member (member_id, created_at),
    INDEX IX_notification_log_status (status, created_at)
  );
END
GO

IF OBJECT_ID('dbo.notification_preferences', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.notification_preferences (
    member_id UNIQUEIDENTIFIER NOT NULL,
    template_key NVARCHAR(100) NOT NULL,
    channel NVARCHAR(20) NOT NULL,
    opted_in BIT NOT NULL DEFAULT 1,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_notification_preferences PRIMARY KEY (member_id, template_key, channel)
  );
END
GO
