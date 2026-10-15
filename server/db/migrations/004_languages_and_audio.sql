-- =====================================================================
-- 004: translations and guide audio
--  * guides can be marked as drafts (shown with a "draft for review" label)
--  * one audio recording per guide per language, which can exist even
--    when the written guide is only in English
-- =====================================================================

ALTER TABLE guides ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE guide_audio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_slug      TEXT NOT NULL,
    language_code   TEXT NOT NULL REFERENCES languages(code),
    file_name       TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL CHECK (size_bytes > 0),
    is_draft        BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (guide_slug, language_code)
);
