-- =============================================================================
-- ADD NAME SYNC COLUMNS
-- =============================================================================

-- Add display_name to household_members for partner names
ALTER TABLE household_members ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add patient_name to households for patient name (owner)
ALTER TABLE households ADD COLUMN IF NOT EXISTS patient_name TEXT;
