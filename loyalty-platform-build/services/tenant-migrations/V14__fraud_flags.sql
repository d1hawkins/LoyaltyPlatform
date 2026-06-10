IF OBJECT_ID('dbo.fraud_flags', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.fraud_flags (
    flag_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    member_id UNIQUEIDENTIFIER NOT NULL,
    txn_id UNIQUEIDENTIFIER NULL,
    rule_code NVARCHAR(50) NOT NULL,
    severity NVARCHAR(20) NOT NULL DEFAULT 'warning', -- warning | block | quarantine
    details_json NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'open', -- open | reviewed | dismissed | confirmed
    reviewed_by NVARCHAR(200) NULL,
    reviewed_at DATETIME2 NULL,
    review_notes NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    INDEX IX_fraud_flags_member (member_id, created_at),
    INDEX IX_fraud_flags_status (status, severity, created_at)
  );
END

IF OBJECT_ID('dbo.fraud_rules', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.fraud_rules (
    rule_code NVARCHAR(50) NOT NULL PRIMARY KEY,
    description NVARCHAR(500) NOT NULL,
    severity NVARCHAR(20) NOT NULL DEFAULT 'warning',
    is_enabled BIT NOT NULL DEFAULT 1,
    config_json NVARCHAR(MAX) NOT NULL, -- thresholds, windows, etc.
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  -- Seed default rules
  INSERT INTO dbo.fraud_rules (rule_code, description, severity, config_json) VALUES
  ('VELOCITY_TXN_COUNT', 'Too many transactions in time window', 'warning', '{"maxCount":10,"windowMinutes":60}'),
  ('VELOCITY_TXN_AMOUNT', 'Spend exceeds threshold in time window', 'warning', '{"maxAmount":1000,"windowMinutes":60}'),
  ('RAPID_ENROLLMENT_REDEEM', 'Redemption too soon after enrollment', 'block', '{"minHoursAfterEnroll":24}'),
  ('DUPLICATE_AMOUNT_PATTERN', 'Repeated identical amounts in short window', 'warning', '{"maxRepeats":3,"windowMinutes":30}'),
  ('BULK_ENROLLMENT', 'Excessive enrollments from same source', 'quarantine', '{"maxEnrollments":20,"windowMinutes":60}');
END
