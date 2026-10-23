-- Equipment loses value as it is used. With a yearly rate set, the app takes off that share of
-- what was paid at the end of each year (31 December), part of a year for the year it was bought,
-- until the value reaches zero. Without a rate, the owner's own estimate (current_value) is used.
ALTER TABLE assets ADD COLUMN depreciation_rate NUMERIC(5,2)
    CHECK (depreciation_rate IS NULL OR (depreciation_rate > 0 AND depreciation_rate <= 100));

-- The admin can delete a business (most are test runs). It is hidden everywhere and its people
-- can no longer open it; the admin can restore it from "Deleted businesses".
ALTER TABLE businesses ADD COLUMN deleted_by UUID REFERENCES users(id);
