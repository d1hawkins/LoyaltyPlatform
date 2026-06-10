-- V2__transactions.sql
IF OBJECT_ID('dbo.transactions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.transactions (
        txn_id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        member_id         UNIQUEIDENTIFIER NOT NULL,
        channel           NVARCHAR(20)     NOT NULL,
        amount            DECIMAL(12,2)    NOT NULL,
        currency          CHAR(3)          NOT NULL,
        sku_list_json     NVARCHAR(MAX)    NULL,
        location_id       NVARCHAR(100)    NULL,
        occurred_at       DATETIME2        NOT NULL,
        recorded_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        status            NVARCHAR(20)     NOT NULL DEFAULT 'posted'
            CONSTRAINT ck_txn_status CHECK (status IN ('posted','voided')),
        voided_at         DATETIME2        NULL,
        voided_by         NVARCHAR(200)    NULL,
        idempotency_key   NVARCHAR(200)    NULL,
        raw_payload_json  NVARCHAR(MAX)    NULL,
        created_at        DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at        DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT fk_transactions_member FOREIGN KEY (member_id) REFERENCES dbo.members(member_id)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_txn_member_occurred' AND object_id = OBJECT_ID('dbo.transactions'))
    CREATE INDEX ix_txn_member_occurred ON dbo.transactions(member_id, occurred_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_txn_idempotency' AND object_id = OBJECT_ID('dbo.transactions'))
    CREATE UNIQUE INDEX ux_txn_idempotency ON dbo.transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
GO
