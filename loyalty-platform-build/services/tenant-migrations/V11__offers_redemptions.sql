-- V11: Offers, redemptions, and offer codes
-- Idempotent: uses IF NOT EXISTS guards

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'offers')
BEGIN
  CREATE TABLE dbo.offers (
    offer_id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    name               NVARCHAR(200)    NOT NULL,
    description        NVARCHAR(2000)   NULL,
    type               NVARCHAR(20)     NOT NULL CHECK (type IN ('percent','fixed','bogo','threshold')),
    value              DECIMAL(12,2)    NOT NULL,
    min_purchase       DECIMAL(12,2)    NULL,
    points_cost        INT              NULL,
    conditions_json    NVARCHAR(MAX)    NULL,
    targeting_json     NVARCHAR(MAX)    NULL,
    valid_from         DATETIME2        NOT NULL,
    valid_to           DATETIME2        NOT NULL,
    max_redemptions    INT              NULL,
    current_redemptions INT             NOT NULL DEFAULT 0,
    per_member_limit   INT              NOT NULL DEFAULT 1,
    is_stackable       BIT              NOT NULL DEFAULT 0,
    is_active          BIT              NOT NULL DEFAULT 1,
    created_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_offers PRIMARY KEY (offer_id)
  );

  CREATE INDEX IX_offers_active_dates ON dbo.offers (is_active, valid_from, valid_to);
  CREATE INDEX IX_offers_type ON dbo.offers (type);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'redemptions')
BEGIN
  CREATE TABLE dbo.redemptions (
    redemption_id      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    member_id          UNIQUEIDENTIFIER NOT NULL,
    offer_id           UNIQUEIDENTIFIER NOT NULL,
    channel            NVARCHAR(20)     NOT NULL,
    points_used        INT              NOT NULL DEFAULT 0,
    discount_value     DECIMAL(12,2)    NOT NULL DEFAULT 0,
    redemption_code    NVARCHAR(50)     NULL,
    status             NVARCHAR(20)     NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
    redeemed_at        DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    reversed_at        DATETIME2        NULL,
    created_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_redemptions PRIMARY KEY (redemption_id)
  );

  CREATE INDEX IX_redemptions_member ON dbo.redemptions (member_id, redeemed_at);
  CREATE INDEX IX_redemptions_offer ON dbo.redemptions (offer_id);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'offer_codes')
BEGIN
  CREATE TABLE dbo.offer_codes (
    code               NVARCHAR(50)     NOT NULL,
    offer_id           UNIQUEIDENTIFIER NOT NULL,
    member_id          UNIQUEIDENTIFIER NULL,
    status             NVARCHAR(20)     NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','redeemed','expired')),
    assigned_at        DATETIME2        NULL,
    redeemed_at        DATETIME2        NULL,
    CONSTRAINT pk_offer_codes PRIMARY KEY (code)
  );

  CREATE INDEX IX_offer_codes_offer_status ON dbo.offer_codes (offer_id, status);
END;
