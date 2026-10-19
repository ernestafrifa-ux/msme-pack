-- Supplies and making products.
--  * A product kind 'supply': bought and kept in stock but used in the work, not sold
--    (relaxer and shampoo in a salon, flour and sugar in a bakery, packaging).
--  * 'used': stock used up doing a service. It is part of the cost of sales, not a loss.
--  * 'used_in_production': ingredients that went into goods the business made. Their cost
--    moves into the goods made ('produced'), and counts when those goods are sold.

ALTER TABLE products DROP CONSTRAINT products_kind_check;
ALTER TABLE products ADD CONSTRAINT products_kind_check CHECK (kind IN ('product', 'service', 'supply'));
ALTER TABLE products DROP CONSTRAINT products_check;
ALTER TABLE products ADD CONSTRAINT products_check CHECK (kind IN ('product', 'supply') OR track_stock = FALSE);

ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_reason_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check
    CHECK (reason IN ('opening','purchase','produced','sale','return_in','return_out',
                      'damaged','expired','own_use','count_adjustment','used','used_in_production'));
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_sign_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_sign_check CHECK (
    (reason IN ('opening','purchase','produced','return_in') AND quantity > 0) OR
    (reason IN ('sale','return_out','damaged','expired','own_use','used','used_in_production') AND quantity < 0) OR
    (reason = 'count_adjustment')
);

-- A batch of goods made: which ingredients went in, so it can be shown and undone together.
ALTER TABLE stock_movements ADD COLUMN batch_id UUID;
CREATE INDEX idx_stock_movements_batch ON stock_movements(batch_id) WHERE batch_id IS NOT NULL;

CREATE OR REPLACE VIEW v_monthly_summary AS
WITH money AS (
    SELECT
        t.business_id,
        date_trunc('month', t.txn_date)::date AS month,
        SUM(CASE WHEN t.kind IN ('sale', 'wht')
                 THEN t.amount - COALESCE(t.amount * inv.tax_amount / NULLIF(inv.total, 0), t.tax_amount) END) AS sales,
        SUM(t.amount) FILTER (WHERE t.kind = 'other_income') AS other_income,
        COALESCE(SUM(t.amount - t.tax_amount) FILTER (WHERE t.kind = 'expense'), 0)
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
used AS (
    -- Products used up doing the work (relaxer on a client, polish on nails) are a cost of
    -- the sales they helped make, not a loss.
    SELECT m.business_id, date_trunc('month', m.movement_date)::date AS month,
           SUM(-m.quantity * COALESCE(m.unit_cost, 0)) AS cost
    FROM stock_movements m
    WHERE m.reason = 'used'
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
    FROM (SELECT * FROM direct_cogs UNION ALL SELECT * FROM invoice_cogs UNION ALL SELECT * FROM used) c
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
    round(COALESCE(l.stock_losses, 0), 2)                       AS stock_losses,
    round(COALESCE(u.cost, 0), 2)                               AS materials_used
FROM months k
LEFT JOIN money  m ON m.business_id = k.business_id AND m.month = k.month
LEFT JOIN cogs   c ON c.business_id = k.business_id AND c.month = k.month
LEFT JOIN losses l ON l.business_id = k.business_id AND l.month = k.month
LEFT JOIN (SELECT business_id, month, SUM(cost) AS cost FROM used GROUP BY 1, 2) u ON u.business_id = k.business_id AND u.month = k.month;
