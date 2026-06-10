IF OBJECT_ID('dbo.device_registrations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.device_registrations (
    registration_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    member_id UNIQUEIDENTIFIER NOT NULL,
    device_token NVARCHAR(500) NOT NULL,
    platform NVARCHAR(20) NOT NULL, -- ios | android
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    INDEX IX_device_registrations_member (member_id),
    INDEX IX_device_registrations_token (device_token)
  );
END
