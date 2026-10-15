-- =====================================================================
-- 003: health check and guides
--  * questions and options get stable codes, so the content files in
--    server/content/ can be edited and re-loaded without losing answers
--  * guides link to a screen in the app ("Try it now")
-- =====================================================================

ALTER TABLE hc_questions ADD COLUMN code TEXT UNIQUE;
ALTER TABLE hc_options ADD CONSTRAINT hc_options_question_order_key UNIQUE (question_id, sort_order);

ALTER TABLE guides ADD COLUMN tool_path TEXT;    -- e.g. '/stock/count'
ALTER TABLE guides ADD COLUMN tool_label TEXT;   -- e.g. 'Do a stock count'

-- One assessment in progress per business at a time.
CREATE UNIQUE INDEX uq_hc_in_progress ON hc_assessments (business_id) WHERE status = 'in_progress';
