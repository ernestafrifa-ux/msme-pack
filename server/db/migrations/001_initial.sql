-- =====================================================================
--  MSME Enterprise Resource Pack — MVP data model
--  Target: PostgreSQL 14+  (gen_random_uuid is built in from v13)
--
--  Design principles
--  * UUID primary keys so the PWA can create records offline and sync
--    later without ID clashes.
--  * Every business-owned row carries business_id (multi-tenancy) and
--    created_at / updated_at / deleted_at (soft delete, needed for sync).
--  * Money is NUMERIC(14,2) in Ghana cedis (GHS). Never FLOAT.
--  * Stock levels and account balances are DERIVED (views), never stored,
--    so they can't drift out of step with the records.
--
--  Modules
--    1. Users, businesses, membership
--    2. Business health check
--    3. Guides (resource library) and recommendations
--    4. Money: payment accounts, categories, contacts, transactions
--    5. Products and stock
--    6. Invoices, receipts, quotations
--    7. Reminders (compliance calendar stub) and audit log
--    8. Views for the dashboard
-- =====================================================================

-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is needed.

-- ---------------------------------------------------------------------
-- 0. Lookups
-- ---------------------------------------------------------------------
CREATE TABLE regions (
    code        TEXT PRIMARY KEY,          -- e.g. 'ASH'
    name        TEXT NOT NULL UNIQUE       -- e.g. 'Ashanti'
);

CREATE TABLE sectors (
    code        TEXT PRIMARY KEY,          -- e.g. 'AGRO'
    name        TEXT NOT NULL UNIQUE       -- e.g. 'Agro-processing'
);

CREATE TABLE languages (
    code        TEXT PRIMARY KEY,          -- 'en', 'tw', 'ee', 'gaa', 'dag', 'ha'
    name        TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- 1. Users, businesses, membership
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT NOT NULL,
    phone               TEXT NOT NULL UNIQUE,      -- primary login, e.g. +233241234567
    email               TEXT UNIQUE,
    password_hash       TEXT NOT NULL,
    preferred_language  TEXT NOT NULL DEFAULT 'en' REFERENCES languages(code),
    platform_role       TEXT NOT NULL DEFAULT 'user'
                        CHECK (platform_role IN ('user','advisor','admin')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    trading_name            TEXT,
    legal_form              TEXT NOT NULL DEFAULT 'unregistered'
                            CHECK (legal_form IN ('unregistered','sole_proprietorship',
                                   'partnership','company_ltd_shares',
                                   'company_ltd_guarantee','cooperative')),
    size_tier               TEXT NOT NULL DEFAULT 'micro'
                            CHECK (size_tier IN ('micro','small','medium')),
    sector_code             TEXT REFERENCES sectors(code),
    description             TEXT,
    region_code             TEXT REFERENCES regions(code),
    district                TEXT,
    town                    TEXT,
    digital_address         TEXT,                 -- GhanaPostGPS, e.g. AK-039-5028
    phone                   TEXT,
    email                   TEXT,
    orc_registration_no     TEXT,                 -- Office of the Registrar of Companies
    tin                     TEXT,                 -- GRA Taxpayer Identification Number
    is_vat_registered       BOOLEAN NOT NULL DEFAULT FALSE,
    ssnit_employer_no       TEXT,
    employee_count          INTEGER NOT NULL DEFAULT 0 CHECK (employee_count >= 0),
    year_started            SMALLINT,
    currency                CHAR(3) NOT NULL DEFAULT 'GHS',
    invoice_prefix          TEXT NOT NULL DEFAULT 'INV',
    next_invoice_no         INTEGER NOT NULL DEFAULT 1,
    logo_url                TEXT,
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

-- Who can see/act on a business. An owner can add staff; an advisor
-- (e.g. a GEA Business Advisory Centre officer) can be granted view access.
CREATE TABLE business_members (
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner','manager','staff','advisor')),
    invited_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, user_id)
);
CREATE INDEX idx_business_members_user ON business_members(user_id);

-- ---------------------------------------------------------------------
-- 2. Business health check
--    areas -> questions -> options; an assessment stores answers and
--    a score per area. Questions are versioned by is_active rather than
--    edited, so old assessments stay comparable.
-- ---------------------------------------------------------------------
CREATE TABLE hc_areas (
    code            TEXT PRIMARY KEY,      -- 'FIN','COMP','OPS','MKT','PEOPLE','FUND'
    name            TEXT NOT NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE hc_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_code       TEXT NOT NULL REFERENCES hc_areas(code),
    prompt          TEXT NOT NULL,
    help_text       TEXT,
    applies_to_tier TEXT[] NOT NULL DEFAULT ARRAY['micro','small','medium'],
    weight          NUMERIC(4,2) NOT NULL DEFAULT 1.0,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE hc_options (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id     UUID NOT NULL REFERENCES hc_questions(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    score           SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 4),  -- 0 = not at all, 4 = fully
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE hc_assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    taken_by        UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','completed')),
    overall_score   NUMERIC(5,2),          -- 0–100, filled on completion
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_hc_assessments_business ON hc_assessments(business_id, completed_at DESC);

CREATE TABLE hc_answers (
    assessment_id   UUID NOT NULL REFERENCES hc_assessments(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES hc_questions(id),
    option_id       UUID NOT NULL REFERENCES hc_options(id),
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE hc_area_scores (
    assessment_id   UUID NOT NULL REFERENCES hc_assessments(id) ON DELETE CASCADE,
    area_code       TEXT NOT NULL REFERENCES hc_areas(code),
    score           NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (assessment_id, area_code)
);

-- ---------------------------------------------------------------------
-- 3. Guides (resource library) and recommendations
-- ---------------------------------------------------------------------
CREATE TABLE guides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL,
    language_code   TEXT NOT NULL DEFAULT 'en' REFERENCES languages(code),
    area_code       TEXT NOT NULL REFERENCES hc_areas(code),
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    body_md         TEXT NOT NULL,          -- Markdown, editable without redeploy
    audio_url       TEXT,                   -- local-language audio version
    video_url       TEXT,
    pdf_url         TEXT,                   -- printable version
    read_minutes    SMALLINT,
    applies_to_tier TEXT[] NOT NULL DEFAULT ARRAY['micro','small','medium'],
    linked_tool     TEXT CHECK (linked_tool IN ('sales','expenses','invoices','stock',
                                'pricing_calc','break_even_calc','health_check')),
    version         INTEGER NOT NULL DEFAULT 1,
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_at     DATE,                   -- when facts (tax rules etc.) were last checked
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (slug, language_code)
);

-- Rule: a low score on a question recommends a guide.
CREATE TABLE hc_question_guides (
    question_id     UUID NOT NULL REFERENCES hc_questions(id) ON DELETE CASCADE,
    guide_slug      TEXT NOT NULL,
    max_score       SMALLINT NOT NULL DEFAULT 2,   -- recommend if answer score <= this
    PRIMARY KEY (question_id, guide_slug)
);

-- Materialised recommendations for one assessment (what the user sees).
CREATE TABLE recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    assessment_id   UUID REFERENCES hc_assessments(id) ON DELETE SET NULL,
    guide_slug      TEXT NOT NULL,
    priority        SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','done','dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, guide_slug)
);

CREATE TABLE guide_progress (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guide_id        UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'started'
                    CHECK (status IN ('started','completed','bookmarked')),
    downloaded_offline BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, guide_id)
);

-- ---------------------------------------------------------------------
-- 4. Money
-- ---------------------------------------------------------------------
-- Where money sits: the cash box, a MoMo wallet, a bank account.
-- Store only a nickname and last digits, never full account numbers.
CREATE TABLE payment_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                    -- 'Cash box', 'MTN MoMo', 'GCB current'
    kind            TEXT NOT NULL CHECK (kind IN ('cash','mobile_money','bank')),
    provider        TEXT,                             -- 'MTN','Telecel','AT', bank name
    last_digits     TEXT CHECK (last_digits ~ '^[0-9]{0,4}$'),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    opening_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (business_id, name)
);

-- Income/expense categories. business_id NULL = system default shared by all.
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('income','expense')),
    name            TEXT NOT NULL,
    is_cost_of_sales BOOLEAN NOT NULL DEFAULT FALSE,  -- stock purchases, raw materials
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_categories ON categories (COALESCE(business_id::text,'system'), kind, name);

CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('customer','supplier','both')),
    name            TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_contacts_business ON contacts(business_id, kind) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. Products and stock
-- ---------------------------------------------------------------------
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    sku             TEXT,
    kind            TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product','service')),
    unit            TEXT NOT NULL DEFAULT 'piece',   -- piece, bag, crate, kg, litre, carton
    cost_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    selling_price   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    track_stock     BOOLEAN NOT NULL DEFAULT TRUE,
    reorder_level   NUMERIC(12,3) NOT NULL DEFAULT 0,
    image_url       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CHECK (kind = 'product' OR track_stock = FALSE)
);
CREATE UNIQUE INDEX uq_products_sku ON products(business_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 6. Invoices, receipts, quotations
--    Declared before transactions because a payment can point to one.
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    doc_type        TEXT NOT NULL DEFAULT 'invoice'
                    CHECK (doc_type IN ('invoice','quotation','receipt')),
    number          TEXT NOT NULL,                    -- 'INV-0001'
    contact_id      UUID REFERENCES contacts(id),
    issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','part_paid','paid','overdue',
                                      'accepted','declined','void')),
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    tax_label       TEXT,                             -- e.g. 'VAT & levies'
    tax_rate        NUMERIC(6,3) NOT NULL DEFAULT 0,  -- percent, configured by business
    tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    payment_terms   TEXT,
    converted_from  UUID REFERENCES invoices(id),     -- quotation -> invoice
    sent_via        TEXT CHECK (sent_via IN ('whatsapp','sms','email','print')),
    sent_at         TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (business_id, number),
    CHECK (total = subtotal - discount + tax_amount)
);
CREATE INDEX idx_invoices_business ON invoices(business_id, status, issue_date DESC);

CREATE TABLE invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id),     -- NULL = free-text line
    description     TEXT NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    line_total      NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 4b. Transactions — the cash book. One row = money in, money out,
--     or a transfer between accounts (e.g. cash deposited to MoMo).
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('sale','other_income','expense',
                                                  'purchase','transfer','owner_draw',
                                                  'owner_capital')),
    txn_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    account_id      UUID NOT NULL REFERENCES payment_accounts(id),      -- money moves in/out of here
    to_account_id   UUID REFERENCES payment_accounts(id),               -- transfers only
    category_id     UUID REFERENCES categories(id),
    contact_id      UUID REFERENCES contacts(id),
    invoice_id      UUID REFERENCES invoices(id),                       -- payment against an invoice
    payment_ref     TEXT,                    -- MoMo transaction ID, cheque no.
    momo_fee        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (momo_fee >= 0),
    is_credit       BOOLEAN NOT NULL DEFAULT FALSE,   -- sold on credit / bought on credit, no cash yet
    note            TEXT,
    receipt_photo_url TEXT,
    client_ref      UUID UNIQUE,             -- id generated on the phone, for idempotent offline sync
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
    CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);
CREATE INDEX idx_txn_business_date ON transactions(business_id, txn_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_invoice ON transactions(invoice_id) WHERE invoice_id IS NOT NULL;

-- Line items for a sale or purchase, so stock can move automatically.
CREATE TABLE transaction_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    unit_cost       NUMERIC(14,2),            -- cost at time of sale, for profit
    line_total      NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED
);

-- Stock ledger. Positive qty = into stock, negative = out of stock.
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    movement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    reason          TEXT NOT NULL CHECK (reason IN ('opening','purchase','sale','return_in',
                                         'return_out','damaged','expired','own_use',
                                         'count_adjustment')),
    quantity        NUMERIC(12,3) NOT NULL CHECK (quantity <> 0),
    unit_cost       NUMERIC(14,2),
    transaction_item_id UUID REFERENCES transaction_items(id) ON DELETE CASCADE,
    invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE CASCADE,
    note            TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (reason IN ('opening','purchase','return_in') AND quantity > 0) OR
        (reason IN ('sale','return_out','damaged','expired','own_use') AND quantity < 0) OR
        (reason = 'count_adjustment')
    )
);
CREATE INDEX idx_stock_product ON stock_movements(product_id, movement_date);

-- Keep stock in step with sale/purchase line items automatically.
CREATE OR REPLACE FUNCTION trg_txn_item_stock() RETURNS TRIGGER AS $$
DECLARE
    t   transactions%ROWTYPE;
    p   products%ROWTYPE;
BEGIN
    SELECT * INTO t FROM transactions WHERE id = NEW.transaction_id;
    SELECT * INTO p FROM products     WHERE id = NEW.product_id;
    IF p.business_id <> t.business_id THEN
        RAISE EXCEPTION 'Product % does not belong to this business', p.id;
    END IF;
    IF NOT p.track_stock THEN
        RETURN NEW;
    END IF;
    IF t.kind = 'sale' THEN
        INSERT INTO stock_movements (business_id, product_id, movement_date, reason,
                                     quantity, unit_cost, transaction_item_id, created_by)
        VALUES (t.business_id, p.id, t.txn_date, 'sale', -NEW.quantity,
                COALESCE(NEW.unit_cost, p.cost_price), NEW.id, t.created_by);
    ELSIF t.kind = 'purchase' THEN
        INSERT INTO stock_movements (business_id, product_id, movement_date, reason,
                                     quantity, unit_cost, transaction_item_id, created_by)
        VALUES (t.business_id, p.id, t.txn_date, 'purchase', NEW.quantity,
                NEW.unit_price, NEW.id, t.created_by);
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER txn_item_stock AFTER INSERT ON transaction_items
    FOR EACH ROW EXECUTE FUNCTION trg_txn_item_stock();

-- Capture cost at time of sale if the app didn't send it.
CREATE OR REPLACE FUNCTION trg_txn_item_cost() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unit_cost IS NULL THEN
        SELECT cost_price INTO NEW.unit_cost FROM products WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER txn_item_cost BEFORE INSERT ON transaction_items
    FOR EACH ROW EXECUTE FUNCTION trg_txn_item_cost();

-- Goods sold on invoice leave stock when the invoice is first sent,
-- and come back if it is voided. Payments against the invoice are then
-- recorded as 'sale' transactions WITHOUT line items, so stock isn't
-- deducted twice.
CREATE OR REPLACE FUNCTION trg_invoice_stock() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.doc_type <> 'invoice' THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('sent','part_paid','paid','overdue')
       AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        INSERT INTO stock_movements (business_id, product_id, movement_date, reason,
                                     quantity, unit_cost, invoice_item_id, created_by)
        SELECT NEW.business_id, p.id, NEW.issue_date, 'sale', -ii.quantity,
               p.cost_price, ii.id, NEW.created_by
        FROM invoice_items ii JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = NEW.id AND p.track_stock;
    ELSIF NEW.status = 'void' AND OLD.status <> 'void' THEN
        DELETE FROM stock_movements
        WHERE invoice_item_id IN (SELECT id FROM invoice_items WHERE invoice_id = NEW.id);
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_stock AFTER UPDATE OF status ON invoices
    FOR EACH ROW EXECUTE FUNCTION trg_invoice_stock();

-- ---------------------------------------------------------------------
-- 7. Reminders and audit
-- ---------------------------------------------------------------------
-- MVP: user-created and system-suggested reminders. Phase 2 grows this
-- into the full compliance calendar.
CREATE TABLE reminders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,                    -- 'File monthly SSNIT contribution'
    kind            TEXT NOT NULL DEFAULT 'custom'
                    CHECK (kind IN ('tax','ssnit','permit','annual_return','invoice_due',
                                    'reorder','custom')),
    due_date        DATE NOT NULL,
    repeat_rule     TEXT CHECK (repeat_rule IN ('monthly','quarterly','yearly')),
    guide_slug      TEXT,                             -- 'How to file SSNIT'
    channel         TEXT NOT NULL DEFAULT 'in_app'
                    CHECK (channel IN ('in_app','sms','whatsapp')),
    done_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminders_due ON reminders(business_id, due_date) WHERE done_at IS NULL;

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,                    -- 'create','update','delete','login','export'
    entity          TEXT NOT NULL,                    -- 'transaction','invoice', ...
    entity_id       UUID,
    changes         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_business ON audit_log(business_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 8. Views for the dashboard
-- ---------------------------------------------------------------------
-- Current balance of each cash/MoMo/bank account.
CREATE VIEW v_account_balances AS
SELECT
    a.business_id,
    a.id   AS account_id,
    a.name AS account_name,
    a.kind,
    a.opening_balance
      + COALESCE(SUM(CASE
            WHEN t.account_id = a.id AND t.kind IN ('sale','other_income','owner_capital')
                 THEN t.amount - t.momo_fee
            WHEN t.account_id = a.id AND t.kind IN ('expense','purchase','owner_draw')
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

-- Stock on hand, value at cost, and low-stock flag.
CREATE VIEW v_stock_levels AS
SELECT
    p.business_id,
    p.id   AS product_id,
    p.name,
    p.unit,
    COALESCE(SUM(m.quantity), 0)                      AS on_hand,
    p.reorder_level,
    round(COALESCE(SUM(m.quantity), 0) * p.cost_price, 2) AS value_at_cost,
    COALESCE(SUM(m.quantity), 0) <= p.reorder_level   AS is_low
FROM products p
LEFT JOIN stock_movements m ON m.product_id = p.id
WHERE p.track_stock AND p.deleted_at IS NULL AND p.is_active
GROUP BY p.id;

-- Monthly money in / money out / gross profit, for the dashboard chart.
-- Simple cash-basis view suited to micro businesses: cost of sales is
-- counted for itemised sales only. Phase 2 can add accrual reporting.
CREATE VIEW v_monthly_summary AS
WITH cogs AS (
    SELECT t.business_id, date_trunc('month', t.txn_date)::date AS month,
           round(SUM(i.quantity * COALESCE(i.unit_cost, 0)), 2) AS cost_of_sales
    FROM transactions t
    JOIN transaction_items i ON i.transaction_id = t.id
    WHERE t.kind = 'sale' AND t.deleted_at IS NULL
    GROUP BY 1, 2
)
SELECT
    t.business_id,
    date_trunc('month', t.txn_date)::date AS month,
    SUM(t.amount) FILTER (WHERE t.kind = 'sale')                    AS sales,
    SUM(t.amount) FILTER (WHERE t.kind = 'other_income')            AS other_income,
    SUM(t.amount) FILTER (WHERE t.kind = 'expense')                 AS expenses,
    SUM(t.amount) FILTER (WHERE t.kind = 'purchase')                AS stock_purchases,
    SUM(t.momo_fee)                                                 AS momo_fees,
    COALESCE(MAX(c.cost_of_sales), 0)                               AS cost_of_sales,
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'sale'), 0)
      - COALESCE(MAX(c.cost_of_sales), 0)                           AS gross_profit,
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'sale'), 0)
      + COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'other_income'), 0)
      - COALESCE(MAX(c.cost_of_sales), 0)
      - COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)
      - COALESCE(SUM(t.momo_fee), 0)                                AS net_profit_estimate
FROM transactions t
LEFT JOIN cogs c ON c.business_id = t.business_id
                AND c.month = date_trunc('month', t.txn_date)::date
WHERE t.deleted_at IS NULL
GROUP BY t.business_id, date_trunc('month', t.txn_date);

-- What each invoice is still owed.
CREATE VIEW v_invoice_balances AS
SELECT
    inv.business_id,
    inv.id     AS invoice_id,
    inv.number,
    inv.contact_id,
    inv.issue_date,
    inv.due_date,
    inv.total,
    COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit), 0) AS paid,
    inv.total - COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit), 0) AS outstanding,
    CASE
        WHEN inv.status = 'void' THEN 'void'
        WHEN inv.total - COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit), 0) <= 0 THEN 'paid'
        WHEN inv.due_date < CURRENT_DATE THEN 'overdue'
        WHEN COALESCE(SUM(t.amount) FILTER (WHERE t.deleted_at IS NULL AND NOT t.is_credit), 0) > 0 THEN 'part_paid'
        ELSE inv.status
    END AS computed_status
FROM invoices inv
LEFT JOIN transactions t ON t.invoice_id = inv.id
WHERE inv.doc_type = 'invoice' AND inv.deleted_at IS NULL
GROUP BY inv.id;

-- Latest completed health-check score per business (advisor view).
CREATE VIEW v_latest_health AS
SELECT DISTINCT ON (a.business_id)
    a.business_id, a.id AS assessment_id, a.overall_score, a.completed_at
FROM hc_assessments a
WHERE a.status = 'completed'
ORDER BY a.business_id, a.completed_at DESC;

-- ---------------------------------------------------------------------
-- Seed: lookups and system categories
-- ---------------------------------------------------------------------
INSERT INTO regions (code, name) VALUES
 ('AHF','Ahafo'),('ASH','Ashanti'),('BON','Bono'),('BOE','Bono East'),
 ('CEN','Central'),('EAS','Eastern'),('GAR','Greater Accra'),('NEA','North East'),
 ('NOR','Northern'),('OTI','Oti'),('SAV','Savannah'),('UEA','Upper East'),
 ('UWE','Upper West'),('VOL','Volta'),('WES','Western'),('WNO','Western North');

INSERT INTO sectors (code, name) VALUES
 ('AGRI','Agriculture'),('AGRO','Agro-processing'),('RETAIL','Retail & trading'),
 ('FOOD','Food & catering'),('FASHION','Fashion & tailoring'),('BEAUTY','Hair & beauty'),
 ('MANUF','Light manufacturing'),('CONST','Construction & artisans'),
 ('TRANS','Transport & logistics'),('ICT','ICT & digital services'),
 ('HOSP','Hospitality & tourism'),('SERV','Professional services'),('OTHER','Other');

INSERT INTO languages (code, name) VALUES
 ('en','English'),('tw','Twi'),('ee','Ewe'),('gaa','Ga'),('dag','Dagbani'),('ha','Hausa');

INSERT INTO hc_areas (code, name, sort_order) VALUES
 ('FIN','Money & records',1),('COMP','Registration & compliance',2),
 ('OPS','Stock & operations',3),('MKT','Marketing & customers',4),
 ('PEOPLE','Staff & people',5),('FUND','Access to finance',6);

INSERT INTO categories (business_id, kind, name, is_cost_of_sales, sort_order) VALUES
 (NULL,'income','Product sales',FALSE,1),
 (NULL,'income','Service income',FALSE,2),
 (NULL,'income','Other income',FALSE,3),
 (NULL,'expense','Stock / raw materials',TRUE,1),
 (NULL,'expense','Rent',FALSE,2),
 (NULL,'expense','Wages & salaries',FALSE,3),
 (NULL,'expense','Transport',FALSE,4),
 (NULL,'expense','Electricity & water',FALSE,5),
 (NULL,'expense','Fuel / generator',FALSE,6),
 (NULL,'expense','Phone & data',FALSE,7),
 (NULL,'expense','Packaging',FALSE,8),
 (NULL,'expense','Repairs & maintenance',FALSE,9),
 (NULL,'expense','Taxes, levies & permits',FALSE,10),
 (NULL,'expense','SSNIT contributions',FALSE,11),
 (NULL,'expense','Marketing',FALSE,12),
 (NULL,'expense','Bank & MoMo charges',FALSE,13),
 (NULL,'expense','Other expenses',FALSE,14);
