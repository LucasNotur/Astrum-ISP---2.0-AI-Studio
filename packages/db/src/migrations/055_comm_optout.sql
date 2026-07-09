-- IA-28: Communication profile opt-out.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS comm_profile_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
