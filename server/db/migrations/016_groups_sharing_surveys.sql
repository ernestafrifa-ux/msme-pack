-- Programme tools for the MSME Pack admin: groups of businesses (a programme intake, a district),
-- businesses choosing to share summary figures for programme reports, and a question on a message.

CREATE TABLE business_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_business_groups_name ON business_groups (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE business_group_members (
    group_id     UUID NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, business_id)
);
CREATE INDEX idx_group_members_business ON business_group_members(business_id);

-- The owner decides; nothing about money is shown to the admin without it.
ALTER TABLE businesses ADD COLUMN share_with_programme BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN share_changed_at TIMESTAMPTZ;

ALTER TABLE notices ADD COLUMN question TEXT;
ALTER TABLE notices ADD COLUMN options JSONB;          -- ["Yes", "No", ...]

CREATE TABLE notice_answers (
    notice_id    UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index SMALLINT NOT NULL,
    answered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, business_id)              -- one answer per business; anyone in it may change it
);
