-- ============================================================
-- V17: Reporting Views
-- Finance + Marketing reporting views for admin portal
-- ============================================================

-- ============================================================
-- FINANCE VIEWS
-- ============================================================

-- Points Liability: outstanding points x estimated redemption value
-- Used for balance sheet recognition per ASC 606 / IFRS 15
IF OBJECT_ID('dbo.v_points_liability', 'V') IS NOT NULL DROP VIEW dbo.v_points_liability;
GO
CREATE VIEW dbo.v_points_liability AS
SELECT
  CAST(SYSUTCDATETIME() AS DATE) AS report_date,
  COUNT(DISTINCT m.member_id) AS active_members,
  SUM(CASE WHEN l.balance > 0 THEN l.balance ELSE 0 END) AS total_outstanding_points,
  -- Estimate redemption value: points x (avg redemption value per point)
  -- Default to $0.01 per point if no redemptions exist yet
  SUM(CASE WHEN l.balance > 0 THEN l.balance ELSE 0 END) *
    COALESCE(
      (SELECT CAST(SUM(r.points_used) AS DECIMAL(18,6)) / NULLIF(COUNT(*), 0) * 0.01
       FROM redemptions r WHERE r.status = 'completed'),
      0.01
    ) AS estimated_liability_usd,
  -- Breakage: estimated % that will never be redeemed (industry avg 20-30%)
  SUM(CASE WHEN l.balance > 0 THEN l.balance ELSE 0 END) * 0.25 AS estimated_breakage_points,
  SUM(CASE WHEN l.balance > 0 THEN l.balance ELSE 0 END) * 0.75 * 0.01 AS net_liability_usd
FROM members m
CROSS APPLY (
  SELECT COALESCE(SUM(delta), 0) AS balance
  FROM points_ledger pl WHERE pl.member_id = m.member_id
) l
WHERE m.is_deleted = 0 AND m.status = 'active';
GO

-- Points Issuance & Redemption by Period
IF OBJECT_ID('dbo.v_points_flow_daily', 'V') IS NOT NULL DROP VIEW dbo.v_points_flow_daily;
GO
CREATE VIEW dbo.v_points_flow_daily AS
SELECT
  CAST(pl.created_at AS DATE) AS period_date,
  SUM(CASE WHEN pl.reason_code = 'earn' THEN pl.delta ELSE 0 END) AS points_issued,
  SUM(CASE WHEN pl.reason_code = 'redeem' THEN ABS(pl.delta) ELSE 0 END) AS points_redeemed,
  SUM(CASE WHEN pl.reason_code = 'expire' THEN ABS(pl.delta) ELSE 0 END) AS points_expired,
  SUM(CASE WHEN pl.reason_code = 'void' THEN ABS(pl.delta) ELSE 0 END) AS points_voided,
  SUM(CASE WHEN pl.reason_code = 'adjust' AND pl.delta > 0 THEN pl.delta ELSE 0 END) AS points_adjusted_credit,
  SUM(CASE WHEN pl.reason_code = 'adjust' AND pl.delta < 0 THEN ABS(pl.delta) ELSE 0 END) AS points_adjusted_debit,
  COUNT(DISTINCT pl.member_id) AS unique_members
FROM points_ledger pl
GROUP BY CAST(pl.created_at AS DATE);
GO

-- Redemption Reserve (monthly)
IF OBJECT_ID('dbo.v_redemption_reserve_monthly', 'V') IS NOT NULL DROP VIEW dbo.v_redemption_reserve_monthly;
GO
CREATE VIEW dbo.v_redemption_reserve_monthly AS
SELECT
  YEAR(r.redeemed_at) AS yr,
  MONTH(r.redeemed_at) AS mo,
  COUNT(*) AS redemption_count,
  SUM(r.points_used) AS total_points_redeemed,
  SUM(r.discount_value) AS total_discount_value_usd,
  AVG(r.discount_value) AS avg_discount_per_redemption,
  CASE WHEN SUM(r.points_used) > 0
    THEN SUM(r.discount_value) / SUM(r.points_used)
    ELSE 0.01
  END AS cost_per_point_redeemed
FROM redemptions r
WHERE r.status = 'completed'
GROUP BY YEAR(r.redeemed_at), MONTH(r.redeemed_at);
GO

-- Revenue Attribution: avg spend of loyalty members vs overall
IF OBJECT_ID('dbo.v_revenue_attribution', 'V') IS NOT NULL DROP VIEW dbo.v_revenue_attribution;
GO
CREATE VIEW dbo.v_revenue_attribution AS
SELECT
  CAST(t.occurred_at AS DATE) AS txn_date,
  COUNT(*) AS total_transactions,
  SUM(t.amount) AS total_spend_cents,
  AVG(t.amount) AS avg_basket_cents,
  COUNT(DISTINCT t.member_id) AS unique_members_transacted,
  SUM(t.amount) * 1.0 / NULLIF(COUNT(DISTINCT t.member_id), 0) AS spend_per_member_cents
FROM transactions t
WHERE t.status = 'posted'
GROUP BY CAST(t.occurred_at AS DATE);
GO

-- ============================================================
-- MARKETING VIEWS
-- ============================================================

-- Engagement Funnel
IF OBJECT_ID('dbo.v_engagement_funnel', 'V') IS NOT NULL DROP VIEW dbo.v_engagement_funnel;
GO
CREATE VIEW dbo.v_engagement_funnel AS
SELECT
  (SELECT COUNT(*) FROM members WHERE is_deleted = 0) AS total_enrolled,
  (SELECT COUNT(DISTINCT member_id) FROM transactions WHERE status = 'posted') AS made_first_purchase,
  (SELECT COUNT(*) FROM (
    SELECT member_id FROM transactions WHERE status = 'posted'
    GROUP BY member_id HAVING COUNT(*) >= 2
  ) x) AS repeat_purchasers,
  (SELECT COUNT(*) FROM (
    SELECT member_id FROM transactions WHERE status = 'posted'
    GROUP BY member_id HAVING COUNT(*) >= 5
  ) x) AS frequent_purchasers,
  (SELECT COUNT(*) FROM members m
   JOIN tiers t ON m.tier_id = t.tier_id
   WHERE m.is_deleted = 0 AND t.min_points > 0) AS tier_upgraded_members,
  (SELECT COUNT(DISTINCT member_id) FROM redemptions WHERE status = 'completed') AS redeemed_members;
GO

-- At-Risk Members: no transaction in configurable window with positive balance
IF OBJECT_ID('dbo.v_at_risk_members', 'V') IS NOT NULL DROP VIEW dbo.v_at_risk_members;
GO
CREATE VIEW dbo.v_at_risk_members AS
SELECT
  m.member_id,
  m.first_name,
  m.last_name,
  m.status,
  t.name AS tier_name,
  bal.balance AS points_balance,
  last_txn.last_transaction_date,
  DATEDIFF(DAY, last_txn.last_transaction_date, SYSUTCDATETIME()) AS days_inactive
FROM members m
LEFT JOIN tiers t ON m.tier_id = t.tier_id
CROSS APPLY (
  SELECT COALESCE(SUM(delta), 0) AS balance FROM points_ledger WHERE member_id = m.member_id
) bal
OUTER APPLY (
  SELECT MAX(occurred_at) AS last_transaction_date FROM transactions WHERE member_id = m.member_id AND status = 'posted'
) last_txn
WHERE m.is_deleted = 0
  AND m.status = 'active'
  AND bal.balance > 0
  AND (last_txn.last_transaction_date IS NULL OR DATEDIFF(DAY, last_txn.last_transaction_date, SYSUTCDATETIME()) > 30);
GO

-- Tier Distribution snapshot
IF OBJECT_ID('dbo.v_tier_distribution', 'V') IS NOT NULL DROP VIEW dbo.v_tier_distribution;
GO
CREATE VIEW dbo.v_tier_distribution AS
SELECT
  t.tier_id,
  t.name AS tier_name,
  t.min_points,
  t.sort_order,
  COUNT(m.member_id) AS member_count,
  CAST(COUNT(m.member_id) AS DECIMAL(10,4)) / NULLIF((SELECT COUNT(*) FROM members WHERE is_deleted = 0), 0) * 100 AS percentage
FROM tiers t
LEFT JOIN members m ON m.tier_id = t.tier_id AND m.is_deleted = 0 AND m.status = 'active'
WHERE t.is_active = 1
GROUP BY t.tier_id, t.name, t.min_points, t.sort_order;
GO
