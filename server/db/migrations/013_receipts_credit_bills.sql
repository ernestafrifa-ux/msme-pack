-- Receipts for sales, due dates on money owed to suppliers and lenders.
-- (Customers who buy now and pay later use invoices behind the scenes: see /credit-sales.)

ALTER TABLE businesses ADD COLUMN next_receipt_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN receipt_no INTEGER;
ALTER TABLE transactions ADD COLUMN receipt_token TEXT UNIQUE;

ALTER TABLE debts ADD COLUMN due_date DATE;
