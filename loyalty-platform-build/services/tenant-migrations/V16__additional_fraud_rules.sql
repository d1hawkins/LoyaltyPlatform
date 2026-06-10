-- Add three new fraud detection rules: RAPID_BALANCE_DRAIN, LOCATION_VELOCITY, DUPLICATE_EXTERNAL_REF
IF NOT EXISTS (SELECT 1 FROM dbo.fraud_rules WHERE rule_code = 'RAPID_BALANCE_DRAIN')
BEGIN
  INSERT INTO dbo.fraud_rules (rule_code, description, severity, config_json) VALUES
  ('RAPID_BALANCE_DRAIN', 'Large redemption shortly after earning points', 'warning', '{"maxDrainPercent":80,"windowMinutes":60}');
END

IF NOT EXISTS (SELECT 1 FROM dbo.fraud_rules WHERE rule_code = 'LOCATION_VELOCITY')
BEGIN
  INSERT INTO dbo.fraud_rules (rule_code, description, severity, config_json) VALUES
  ('LOCATION_VELOCITY', 'Transactions from different locations in short time window', 'warning', '{"windowMinutes":30}');
END

IF NOT EXISTS (SELECT 1 FROM dbo.fraud_rules WHERE rule_code = 'DUPLICATE_EXTERNAL_REF')
BEGIN
  INSERT INTO dbo.fraud_rules (rule_code, description, severity, config_json) VALUES
  ('DUPLICATE_EXTERNAL_REF', 'Reuse of external reference ID across transactions', 'warning', '{"windowHours":24}');
END
