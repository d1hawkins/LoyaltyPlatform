-- V1__control_plane_init.sql
-- Control plane schema: tenants, api keys, feature flags, audit
-- Idempotent: safe to re-run.

IF OBJECT_ID('dbo.tenants', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tenants (
        tenant_id                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        name                     NVARCHAR(200)    NOT NULL,
        slug                     NVARCHAR(100)    NOT NULL,
        status                   NVARCHAR(20)     NOT NULL DEFAULT 'provisioning'
            CONSTRAINT ck_tenants_status CHECK (status IN ('provisioning','active','suspended','deleted')),
        sql_connstr_secret_name  NVARCHAR(200)    NULL,
        db_name                  NVARCHAR(200)    NULL,
        db_server                NVARCHAR(255)    NULL,
        config_json              NVARCHAR(MAX)    NULL,
        feature_flags_json       NVARCHAR(MAX)    NULL,
        created_at               DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at               DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        deleted_at               DATETIME2        NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_tenants_slug' AND object_id = OBJECT_ID('dbo.tenants'))
    CREATE UNIQUE INDEX ux_tenants_slug ON dbo.tenants(slug);
GO

IF OBJECT_ID('dbo.tenant_api_keys', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tenant_api_keys (
        key_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        tenant_id     UNIQUEIDENTIFIER NOT NULL,
        key_hash      NVARCHAR(200)    NOT NULL,  -- bcrypt hash
        label         NVARCHAR(200)    NULL,
        scope         NVARCHAR(20)     NOT NULL DEFAULT 'read-write'
            CONSTRAINT ck_api_keys_scope CHECK (scope IN ('read','read-write')),
        created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        last_used_at  DATETIME2        NULL,
        expires_at    DATETIME2        NULL,
        revoked_at    DATETIME2        NULL,
        CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(tenant_id)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_api_keys_tenant_revoked' AND object_id = OBJECT_ID('dbo.tenant_api_keys'))
    CREATE INDEX ix_api_keys_tenant_revoked ON dbo.tenant_api_keys(tenant_id, revoked_at);
GO

IF OBJECT_ID('dbo.feature_flags', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.feature_flags (
        flag_key    NVARCHAR(100)    NOT NULL,
        tenant_id   UNIQUEIDENTIFIER NOT NULL,  -- zero-guid (00000000-...) = global default
        enabled     BIT              NOT NULL DEFAULT 0,
        value_json  NVARCHAR(MAX)    NULL,
        updated_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT pk_feature_flags PRIMARY KEY (flag_key, tenant_id)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_feature_flags_tenant_key' AND object_id = OBJECT_ID('dbo.feature_flags'))
    CREATE INDEX ix_feature_flags_tenant_key ON dbo.feature_flags(tenant_id, flag_key);
GO

IF OBJECT_ID('dbo.audit_control_plane', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_control_plane (
        id             BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        actor          NVARCHAR(200)    NOT NULL,
        action         NVARCHAR(100)    NOT NULL,
        entity         NVARCHAR(100)    NOT NULL,
        entity_id      NVARCHAR(200)    NULL,
        metadata_json  NVARCHAR(MAX)    NULL,
        created_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
