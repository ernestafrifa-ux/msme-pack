-- Owner pay: money the owner takes for themselves or their home.
-- It leaves the business accounts but is not a business expense, so it does
-- not lower profit. The monthly summary now reports it on its own
-- (new column at the end, so existing queries are unaffected).
CREATE OR REPLACE VIEW v_monthly_summary AS
WITH money AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(t.amount) FILTER (WHERE t.kind = 'sale')         AS sales,
        SUM(t.amount) FILTER (WHERE t.kind = 'other_income') AS other_income,
        SUM(t.amount) FILTER (WHERE t.kind = 'expense')      AS expenses,
        SUM(t.amount) FILTER (WHERE t.kind = 'purchase')     AS stock_purchases,
        SUM(t.momo_fee)                                      AS momo_fees,
        SUM(t.amount) FILTER (WHERE t.kind = 'owner_draw')   AS owner_pay
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
      - COALESCE(m.momo_fees, 0)                                AS net_profit_estimate,
    COALESCE(m.owner_pay, 0)                                    AS owner_pay
FROM months k
LEFT JOIN money m ON m.business_id = k.business_id AND m.month = k.month
LEFT JOIN cogs  c ON c.business_id = k.business_id AND c.month = k.month;
