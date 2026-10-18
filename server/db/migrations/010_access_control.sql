-- Who can create accounts and businesses.
-- Public sign-up closes once an admin exists. The admin creates each business and its owner;
-- the owner adds the business's own people. Accounts made for someone else start with a
-- temporary password that must be changed at first login.

ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id);

-- A business the admin created without today's balances: the owner enters them at first login.
ALTER TABLE businesses ADD COLUMN setup_done BOOLEAN NOT NULL DEFAULT TRUE;
