-- Planning: a monthly sales target and spending budget, and savings goals.

CREATE TABLE month_plans (
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    month           DATE NOT NULL,                       -- first day of the month
    sales_target    NUMERIC(14,2),
    expense_limit   NUMERIC(14,2),
    category_limits JSONB NOT NULL DEFAULT '{}',         -- {"<category id>": amount}
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, month)
);

-- A goal is saved up in one of the places money is kept (a savings box, a susu, a bank account):
-- progress is that account's balance.
CREATE TABLE savings_goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    target_amount   NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
    target_date     DATE,
    account_id      UUID NOT NULL REFERENCES payment_accounts(id),
    reached_on      DATE,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_savings_goals_business ON savings_goals(business_id) WHERE deleted_at IS NULL;
