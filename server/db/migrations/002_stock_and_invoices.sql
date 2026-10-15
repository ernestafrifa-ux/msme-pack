-- =====================================================================
-- 002: stock and invoices
--  * invoices get a share_token for the customer-facing link
--  * cost of sales now comes from the stock ledger, so goods sold on
--    invoice count toward profit as well as itemised cash/MoMo sales
-- =====================================================================

ALTER TABLE invoices ADD COLUMN share_token TEXT UNIQUE;

-- 'produced': goods the business makes itself (e.g. jars of shito
-- cooked this week) come into stock without being bought.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_reason_check;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check
    CHECK (reason IN ('opening','purchase','produced','sale','return_in','return_out',
                      'damaged','expired','own_use','count_adjustment'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_sign_check CHECK (
    (reason IN ('opening','purchase','produced','return_in') AND quantity > 0) OR
    (reason IN ('sale','return_out','damaged','expired','own_use') AND quantity < 0) OR
    (reason = 'count_adjustment')
);

-- Sales, expenses and profit per month.
-- Money in and out is counted when it moves (cash basis); cost of sales
-- is counted when goods leave stock (an itemised sale, or an invoice
-- being sent). Months appear if they have either.
CREATE OR REPLACE VIEW v_monthly_summary AS
WITH money AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(t.amount) FILTER (WHERE t.kind = 'sale')         AS sales,
        SUM(t.amount) FILTER (WHERE t.kind = 'other_income') AS other_income,
        SUM(t.amount) FILTER (WHERE t.kind = 'expense')      AS expenses,
        SUM(t.amount) FILTER (WHERE t.kind = 'purchase')     AS stock_purchases,
        SUM(t.momo_fee)                                      AS momo_fees
    FROM transactions t
    WHERE t.deleted_at IS NULL
    GROUP BY 1, 2
),
cogs AS (
    SELECT
        m.business_id,
        date_trunc('month', m.movement_date)::date AS month,
        round(SUM(-m.quantity * COALESCE(m.unit_cost, 0)), 2) AS cost_of_sales
    FROM stock_movements m
    WHERE m.reason = 'sale'
    GROUP BY 1, 2
),
months AS (
    SELECT business_id, month FROM money
    UNION
    SELECT business_id, month FROM cogs
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
      - COALESCE(m.momo_fees, 0)                                AS net_profit_estimate
FROM months k
LEFT JOIN money m ON m.business_id = k.business_id AND m.month = k.month
LEFT JOIN cogs  c ON c.business_id = k.business_id AND c.month = k.month;
