-- V10__audit_log.sql
-- Admin API audit log (per-tenant).
-- Idempotent.

IF OBJECT_ID('dbo.audit_log', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_log (
    audit_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    actor_user_id NVARCHAR(200) NOT NULL,
    actor_role NVARCHAR(50) NOT NULL,
    action NVARCHAR(100) NOT NULL,        -- member.update, points.adjust, program.update, tier.override, apikey.create, webhook.update, offer.update, etc.
    entity NVARCHAR(100) NOT NULL,
    entity_id NVARCHAR(200) NULL,
    before_json NVARCHAR(MAX) NULL,
    after_json NVARCHAR(MAX) NULL,
    reason NVARCHAR(500) NULL,
    ip_address NVARCHAR(45) NULL,
    user_agent NVARCHAR(500) NULL,
    correlation_id NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    INDEX IX_audit_log_actor (actor_user_id, created_at),
    INDEX IX_audit_log_entity (entity, entity_id, created_at)
  );
END
