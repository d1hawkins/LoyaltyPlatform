-- V3__points_ledger.sql  (append-only)
IF OBJECT_ID('dbo.points_ledger', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.points_ledger (
        ledger_id      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        member_id      UNIQUEIDENTIFIER NOT NULL,
        delta          INT              NOT NULL,
        reason_code    NVARCHAR(40)     NOT NULL,
        ref_txn_id     UNIQUEIDENTIFIER NULL,
        ref_ledger_id  BIGINT           NULL,
        balance_after  INT              NOT NULL,
        created_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        created_by     NVARCHAR(200)    NOT NULL,
        CONSTRAINT fk_ledger_member FOREIGN KEY (member_id) REFERENCES dbo.members(member_id)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_ledger_member_created' AND object_id = OBJECT_ID('dbo.points_ledger'))
    CREATE INDEX ix_ledger_member_created ON dbo.points_ledger(member_id, created_at);
GO

IF OBJECT_ID('dbo.tr_points_ledger_no_update', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_points_ledger_no_update;
GO
CREATE TRIGGER dbo.tr_points_ledger_no_update
ON dbo.points_ledger
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    RAISERROR('points_ledger is append-only: UPDATE/DELETE not permitted', 16, 1);
    ROLLBACK TRANSACTION;
END;
GO
