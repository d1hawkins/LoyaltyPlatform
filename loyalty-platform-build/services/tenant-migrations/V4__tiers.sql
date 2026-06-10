-- V4__tiers.sql
IF OBJECT_ID('dbo.tiers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tiers (
        tier_id       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        name          NVARCHAR(100)    NOT NULL,
        min_points    INT              NOT NULL,
        max_points    INT              NULL,
        multiplier    DECIMAL(4,2)     NOT NULL DEFAULT 1.00,
        benefits_json NVARCHAR(MAX)    NULL,
        sort_order    INT              NOT NULL DEFAULT 0,
        is_active     BIT              NOT NULL DEFAULT 1,
        created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- Seed default tiers (idempotent by name)
IF NOT EXISTS (SELECT 1 FROM dbo.tiers WHERE name = 'Bronze')
    INSERT INTO dbo.tiers (name, min_points, max_points, multiplier, benefits_json, sort_order)
    VALUES ('Bronze', 0, 499, 1.00, N'{"earnMultiplier":1.0}', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.tiers WHERE name = 'Silver')
    INSERT INTO dbo.tiers (name, min_points, max_points, multiplier, benefits_json, sort_order)
    VALUES ('Silver', 500, 1999, 1.25, N'{"earnMultiplier":1.25}', 2);

IF NOT EXISTS (SELECT 1 FROM dbo.tiers WHERE name = 'Gold')
    INSERT INTO dbo.tiers (name, min_points, max_points, multiplier, benefits_json, sort_order)
    VALUES ('Gold', 2000, 9999, 1.50, N'{"earnMultiplier":1.5,"freeShipping":true}', 3);

IF NOT EXISTS (SELECT 1 FROM dbo.tiers WHERE name = 'Platinum')
    INSERT INTO dbo.tiers (name, min_points, max_points, multiplier, benefits_json, sort_order)
    VALUES ('Platinum', 10000, NULL, 2.00, N'{"earnMultiplier":2.0,"freeShipping":true,"birthdayBonus":500}', 4);
GO
