-- V1__members.sql
IF OBJECT_ID('dbo.members', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.members (
        member_id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        email_encrypted   NVARCHAR(1000)   NULL,
        email_hash        NVARCHAR(128)    NULL,
        phone_encrypted   NVARCHAR(1000)   NOT NULL,
        phone_hash        NVARCHAR(128)    NOT NULL,
        first_name        NVARCHAR(200)    NOT NULL,
        last_name         NVARCHAR(200)    NOT NULL,
        date_of_birth     DATE             NULL,
        status            NVARCHAR(20)     NOT NULL DEFAULT 'active'
            CONSTRAINT ck_members_status CHECK (status IN ('active','suspended','closed')),
        tier_id           UNIQUEIDENTIFIER NULL,
        enrolled_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        enrolled_channel  NVARCHAR(20)     NOT NULL DEFAULT 'admin',
        created_at        DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at        DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        is_deleted        BIT              NOT NULL DEFAULT 0,
        deleted_at        DATETIME2        NULL,
        pii_scrubbed_at   DATETIME2        NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_members_phone_hash' AND object_id = OBJECT_ID('dbo.members'))
    CREATE UNIQUE INDEX ux_members_phone_hash ON dbo.members(phone_hash) WHERE phone_hash IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_members_email_hash' AND object_id = OBJECT_ID('dbo.members'))
    CREATE UNIQUE INDEX ux_members_email_hash ON dbo.members(email_hash) WHERE email_hash IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_members_tier' AND object_id = OBJECT_ID('dbo.members'))
    CREATE INDEX ix_members_tier ON dbo.members(tier_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_members_status_deleted' AND object_id = OBJECT_ID('dbo.members'))
    CREATE INDEX ix_members_status_deleted ON dbo.members(status, is_deleted);
GO
