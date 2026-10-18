-- Profit fixes found in the bookshop test run (October 2026).
--
-- 1. Goods sold on an invoice: their cost now counts when the customer pays,
--    in proportion to each payment, so a sent-but-unpaid invoice no longer
--    pulls profit down. (Stock still leaves when the invoice is sent.)
-- 2. Stock losses: damaged, expired and own-use stock, and stock-count
--    differences, now count against profit at cost. A count that finds more
--    than the records reduces the losses.
-- New column stock_losses at the end; cost_of_sales keeps its name.
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
-- Goods sold directly (a sale with products): cost counts the day of the sale.
direct_cogs AS (
    SELECT
        m.business_id,
        date_trunc('month', m.movement_date)::date AS month,
        SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
    FROM stock_movements m
    WHERE m.reason = 'sale' AND m.invoice_item_id IS NULL
    GROUP BY 1, 2
),
-- Cost of the goods on each invoice (only invoices that have been sent have movements).
invoice_cost AS (
    SELECT ii.invoice_id, SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
    FROM stock_movements m
    JOIN invoice_items ii ON ii.id = m.invoice_item_id
    WHERE m.reason = 'sale'
    GROUP BY ii.invoice_id
),
-- Each payment brings its share of that cost into the month it was received.
invoice_cogs AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(ic.cost * t.amount / NULLIF(inv.total, 0)) AS cost
    FROM transactions t
    JOIN invoices inv ON inv.id = t.invoice_id
    JOIN invoice_cost ic ON ic.invoice_id = t.invoice_id
    WHERE t.deleted_at IS NULL AND t.kind = 'sale'
    GROUP BY 1, 2
),
losses AS (
    SELECT
        m.business_id,
        date_trunc('month', m.movement_date)::date AS month,
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
