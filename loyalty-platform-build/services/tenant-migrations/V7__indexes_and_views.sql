-- V7__indexes_and_views.sql
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_members_enrolled_at' AND object_id = OBJECT_ID('dbo.members'))
    CREATE INDEX ix_members_enrolled_at ON dbo.members(enrolled_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_txn_status_occurred' AND object_id = OBJECT_ID('dbo.transactions'))
    CREATE INDEX ix_txn_status_occurred ON dbo.transactions(status, occurred_at);
GO

IF OBJECT_ID('dbo.v_member_balance', 'V') IS NOT NULL
    DROP VIEW dbo.v_member_balance;
GO
CREATE VIEW dbo.v_member_balance AS
SELECT
    m.member_id,
    COALESCE(SUM(l.delta), 0) AS balance
FROM dbo.members m
LEFT JOIN dbo.points_ledger l ON l.member_id = m.member_id
GROUP BY m.member_id;
GO

IF OBJECT_ID('dbo.v_member_with_tier', 'V') IS NOT NULL
    DROP VIEW dbo.v_member_with_tier;
GO
CREATE VIEW dbo.v_member_with_tier AS
SELECT
    m.member_id,
    m.first_name,
    m.last_name,
    m.email_hash,
    m.phone_hash,
    m.status,
    m.enrolled_at,
    m.is_deleted,
    t.tier_id,
    t.name       AS tier_name,
    t.multiplier AS tier_multiplier,
    t.min_points AS tier_min_points,
    t.max_points AS tier_max_points
FROM dbo.members m
LEFT JOIN dbo.tiers t ON t.tier_id = m.tier_id;
GO
