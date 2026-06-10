-- V6__program_config.sql (singleton, id = 1)
IF OBJECT_ID('dbo.program_config', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.program_config (
        id                  INT            NOT NULL PRIMARY KEY
            CONSTRAINT ck_program_config_singleton CHECK (id = 1),
        program_name        NVARCHAR(200)  NOT NULL,
        base_earn_rate      DECIMAL(6,4)   NOT NULL DEFAULT 1.0000,
        point_value         DECIMAL(8,4)   NOT NULL DEFAULT 0.0100,
        points_expiry_days  INT            NULL,
        config_json         NVARCHAR(MAX)  NULL,
        created_at          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
