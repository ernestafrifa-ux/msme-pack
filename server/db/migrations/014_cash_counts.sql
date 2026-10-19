-- Closing the day: count the cash (or check the MoMo balance) and compare with the records.

CREATE TABLE cash_counts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES payment_accounts(id),
    count_date      DATE NOT NULL,
    expected        NUMERIC(14,2) NOT NULL,   -- what the records say
    counted         NUMERIC(14,2) NOT NULL,   -- what was actually there
    note            TEXT,
    adjustment_txn_id UUID REFERENCES transactions(id),  -- the shortage or extra, when recorded
    counted_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_counts_business ON cash_counts(business_id, count_date DESC);

INSERT INTO categories (business_id, kind, name, is_cost_of_sales, sort_order) VALUES
 (NULL, 'expense', 'Cash shortage', FALSE, 90),
 (NULL, 'income', 'Cash over', FALSE, 90)
ON CONFLICT DO NOTHING;
