-- Text messages (SMS) sent through the SMS provider, when one is set up.

CREATE TABLE sms_log (
    id            BIGSERIAL PRIMARY KEY,
    business_id   UUID REFERENCES businesses(id) ON DELETE SET NULL,
    to_phone      TEXT NOT NULL,
    message       TEXT NOT NULL,
    purpose       TEXT NOT NULL,            -- notice, reminder, receipt, login
    status        TEXT NOT NULL,            -- sent, failed
    provider_ref  TEXT,
    error         TEXT,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_log_business ON sms_log(business_id, created_at DESC);
CREATE INDEX idx_sms_log_created ON sms_log(created_at DESC);
