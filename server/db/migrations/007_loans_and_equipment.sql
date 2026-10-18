-- Loans, supplier credit and equipment, so the business can produce an honest
-- balance sheet (what it owns and what it owes).
--
-- Money borrowed into an account and repayments are cash book records
-- (kinds loan_received and loan_repayment). Equipment paid for from an account is
-- kind 'equipment'. None of these are income or expenses, except the interest
-- part of a repayment, which counts as an expense.
-- Goods bought on credit are a purchase with is_credit = TRUE plus a supplier debt.

CREATE TABLE debts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lender          TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('bank','microfinance','susu','supplier','family','other')),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    start_date      DATE NOT NULL,
    purchase_txn_id UUID REFERENCES transactions(id),   -- goods bought on credit
    note            TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_debts_business ON debts(business_id) WHERE deleted_at IS NULL;

CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    cost            NUMERIC(14,2) NOT NULL CHECK (cost >= 0),
    current_value   NUMERIC(14,2) NOT NULL CHECK (current_value >= 0),  -- the owner's estimate
    bought_on       DATE NOT NULL,
    disposed_on     DATE,
    note            TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_assets_business ON assets(business_id) WHERE deleted_at IS NULL;

ALTER TABLE transactions DROP CONSTRAINT transactions_kind_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_kind_check CHECK (kind IN (
    'sale','other_income','expense','purchase','transfer','owner_draw','owner_capital',
    'loan_received','loan_repayment','equipment'));
ALTER TABLE transactions ADD COLUMN debt_id UUID REFERENCES debts(id);
ALTER TABLE transactions ADD COLUMN asset_id UUID REFERENCES assets(id);
ALTER TABLE transactions ADD COLUMN interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (interest_amount >= 0 AND interest_amount <= amount);

-- Balances: money borrowed comes in; repayments and equipment go out.
CREATE OR REPLACE VIEW v_account_balances AS
SELECT
    a.business_id,
    a.id   AS account_id,
    a.name AS account_name,
    a.kind,
    a.opening_balance
      + COALESCE(SUM(CASE
            WHEN t.account_id = a.id AND t.kind IN ('sale','other_income','owner_capital','loan_received')
                 THEN t.amount - t.momo_fee
            WHEN t.account_id = a.id AND t.kind IN ('expense','purchase','owner_draw','loan_repayment','equipment')
                 THEN -(t.amount + t.momo_fee)
            WHEN t.account_id = a.id AND t.kind = 'transfer'
                 THEN -(t.amount + t.momo_fee)
            WHEN t.to_account_id = a.id AND t.kind = 'transfer'
                 THEN t.amount
        END), 0) AS balance
FROM payment_accounts a
LEFT JOIN transactions t
       ON (t.account_id = a.id OR t.to_account_id = a.id)
      AND t.deleted_at IS NULL
      AND t.is_credit = FALSE
      AND t.txn_date >= a.opening_date
WHERE a.deleted_at IS NULL
GROUP BY a.business_id, a.id, a.name, a.kind, a.opening_balance;

-- Monthly summary: loan interest counts as an expense.
CREATE OR REPLACE VIEW v_monthly_summary AS
WITH money AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(t.amount) FILTER (WHERE t.kind = 'sale')         AS sales,
        SUM(t.amount) FILTER (WHERE t.kind = 'other_income') AS other_income,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)
          + COALESCE(SUM(t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0) AS expenses,
        SUM(t.amount) FILTER (WHERE t.kind = 'purchase')     AS stock_purchases,
        SUM(t.momo_fee)                                      AS momo_fees,
        SUM(t.amount) FILTER (WHERE t.kind = 'owner_draw')   AS owner_pay
    FROM transactions t
    WHERE t.deleted_at IS NULL AND t.is_credit = FALSE
    GROUP BY 1, 2
),
direct_cogs AS (
    SELECT m.business_id, date_trunc('month', m.movement_date)::date AS month,
           SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
    FROM stock_movements m
    WHERE m.reason = 'sale' AND m.invoice_item_id IS NULL
    GROUP BY 1, 2
),
invoice_cost AS (
    SELECT ii.invoice_id, SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
    FROM stock_movements m
    JOIN invoice_items ii ON ii.id = m.invoice_item_id
    WHERE m.reason = 'sale'
    GROUP BY ii.invoice_id
),
invoice_cogs AS (
    SELECT t.business_id, date_trunc('month', t.txn_date)::date AS month,
           SUM(ic.cost * t.amount / NULLIF(inv.total, 0)) AS cost
    FROM transactions t
    JOIN invoices inv ON inv.id = t.invoice_id
    JOIN invoice_cost ic ON ic.invoice_id = t.invoice_id
    WHERE t.deleted_at IS NULL AND t.kind = 'sale'
    GROUP BY 1, 2
),
losses AS (
    SELECT m.business_id, date_trunc('month', m.movement_date)::date AS month,
           SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS stock_losses
    FROM stock_movements m
    WHERE m.reason IN ('damaged', 'expired', 'own_use', 'count_adjustment')
    GROUP BY 1, 2
),
cogs AS (
    SELECT business_id, month, round(SUM(cost), 2) AS cost_of_sales
    FROM (SELECT * FROM direct_cogs UNION ALL SELECT * FROM invoice_cogs) c
    GROUP BY 1, 2
),
months AS (
    SELECT business_id, month FROM money
    UNION SELECT business_id, month FROM cogs
    UNION SELECT business_id, month FROM losses
)
SELECT
    k.business_id,
    k.month,
    m.sales,
    m.other_income,
    m.expenses,
    m.stock_purchases,
    m.momo_fees,
    COALESCE(c.cost_of_sales, 0)                                AS cost_of_sales,
    COALESCE(m.sales, 0) - COALESCE(c.cost_of_sales, 0)         AS gross_profit,
    COALESCE(m.sales, 0) + COALESCE(m.other_income, 0)
      - COALESCE(c.cost_of_sales, 0)
      - COALESCE(m.expenses, 0)
      - COALESCE(m.momo_fees, 0)
      - round(COALESCE(l.stock_losses, 0), 2)                   AS net_profit_estimate,
    COALESCE(m.owner_pay, 0)                                    AS owner_pay,
    round(COALESCE(l.stock_losses, 0), 2)                       AS stock_losses
FROM months k
LEFT JOIN money  m ON m.business_id = k.business_id AND m.month = k.month
LEFT JOIN cogs   c ON c.business_id = k.business_id AND c.month = k.month
LEFT JOIN losses l ON l.business_id = k.business_id AND l.month = k.month;
