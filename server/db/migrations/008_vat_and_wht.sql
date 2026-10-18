-- VAT (NHIL + GETFund + VAT, 20% from January 2026) on invoices, VAT paid to GRA,
-- and tax withheld by customers (WHT).
--
-- Tax on an invoice belongs to GRA: it is not income. Each invoice payment brings in its
-- share of the invoice's tax, which is left out of sales. A 'wht' record is the part of an
-- invoice the customer kept back as withholding tax: it settles the invoice and counts as
-- income, but no money moves (it is a tax credit). A 'vat_payment' is money paid to GRA.

ALTER TABLE businesses ADD COLUMN vat_registered BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE invoices ADD COLUMN tax_scheme TEXT NOT NULL DEFAULT 'none' CHECK (tax_scheme IN ('none', 'vat', 'custom'));
ALTER TABLE invoices ADD COLUMN nhil_amount    NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN getfund_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN vat_amount     NUMERIC(14,2) NOT NULL DEFAULT 0;
UPDATE invoices SET tax_scheme = 'custom' WHERE tax_amount > 0;

ALTER TABLE transactions DROP CONSTRAINT transactions_kind_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_kind_check CHECK (kind IN (
    'sale','other_income','expense','purchase','transfer','owner_draw','owner_capital',
    'loan_received','loan_repayment','equipment','wht','vat_payment'));

-- Balances: VAT paid to GRA goes out; withheld tax never touches an account.
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
            WHEN t.account_id = a.id AND t.kind IN ('expense','purchase','owner_draw','loan_repayment','equipment','vat_payment')
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

-- Monthly summary: sales exclude the tax on invoices and include withheld tax.
CREATE OR REPLACE VIEW v_monthly_summary AS
WITH money AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(CASE WHEN t.kind IN ('sale', 'wht')
                 THEN t.amount - COALESCE(t.amount * inv.tax_amount / NULLIF(inv.total, 0), 0) END) AS sales,
        SUM(t.amount) FILTER (WHERE t.kind = 'other_income') AS other_income,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)
          + COALESCE(SUM(t.interest_amount) FILTER (WHERE t.kind = 'loan_repayment'), 0) AS expenses,
        SUM(t.amount) FILTER (WHERE t.kind = 'purchase')     AS stock_purchases,
        SUM(t.momo_fee)                                      AS momo_fees,
        SUM(t.amount) FILTER (WHERE t.kind = 'owner_draw')   AS owner_pay
    FROM transactions t
    LEFT JOIN invoices inv ON inv.id = t.invoice_id
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
    WHERE t.deleted_at IS NULL AND t.kind IN ('sale', 'wht')
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
    round(m.sales, 2) AS sales,
    m.other_income,
    m.expenses,
    m.stock_purchases,
    m.momo_fees,
    COALESCE(c.cost_of_sales, 0)                                AS cost_of_sales,
    round(COALESCE(m.sales, 0), 2) - COALESCE(c.cost_of_sales, 0) AS gross_profit,
    round(COALESCE(m.sales, 0), 2) + COALESCE(m.other_income, 0)
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
