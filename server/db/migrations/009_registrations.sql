-- Registrations a business can do later, at its own pace: opening a bank account and
-- registering for VAT with GRA. Each has a status, the documents ticked off, and when done.

CREATE TABLE registrations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('bank', 'vat')),
    status       TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
    started_on   DATE,
    done_on      DATE,
    reference    TEXT,                               -- VAT/TIN number, bank name
    details      JSONB NOT NULL DEFAULT '{}',        -- e.g. {"sells": "goods"}
    checklist    JSONB NOT NULL DEFAULT '[]',        -- ids of the documents ticked
    updated_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, kind)
);

ALTER TABLE businesses ADD COLUMN vat_number TEXT;
ALTER TABLE businesses ADD COLUMN vat_effective_date DATE;
