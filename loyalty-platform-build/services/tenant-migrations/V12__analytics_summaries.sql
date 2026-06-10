-- V12: Analytics summary tables (T-16 / A-16)
-- Idempotent: uses IF OBJECT_ID checks

IF OBJECT_ID('dbo.analytics_daily_summary', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.analytics_daily_summary (
    summary_date DATE NOT NULL,
    metric_key NVARCHAR(100) NOT NULL,
    metric_value DECIMAL(18,4) NOT NULL DEFAULT 0,
    dimensions_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_analytics_daily_summary PRIMARY KEY (summary_date, metric_key)
  );
  CREATE INDEX IX_analytics_summary_key ON dbo.analytics_daily_summary (metric_key, summary_date);
END

IF OBJECT_ID('dbo.analytics_member_cohort', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.analytics_member_cohort (
    cohort_month DATE NOT NULL,
    days_since_enroll INT NOT NULL,
    active_count INT NOT NULL DEFAULT 0,
    total_count INT NOT NULL DEFAULT 0,
    retention_rate AS (CAST(active_count AS DECIMAL(8,4)) / NULLIF(total_count, 0)),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_analytics_member_cohort PRIMARY KEY (cohort_month, days_since_enroll)
  );
END
