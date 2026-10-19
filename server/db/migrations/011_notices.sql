-- Messages from the MSME Pack admin to businesses on the platform. Who receives each one is
-- fixed when it is sent; each person's reading is tracked so the admin sees how many read it.
-- (Business logos use businesses.logo_url, which exists since 001.)

CREATE TABLE notices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    link_url    TEXT,                          -- an app page (/learn/...) or an https:// link
    audience    JSONB NOT NULL DEFAULT '{}',   -- how the recipients were chosen, for the admin's list
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ                    -- withdrawn
);

CREATE TABLE notice_businesses (
    notice_id    UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    PRIMARY KEY (notice_id, business_id)
);
CREATE INDEX idx_notice_businesses_business ON notice_businesses(business_id);

CREATE TABLE notice_reads (
    notice_id  UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, user_id)
);
