-- =============================================================================
-- DEDUPLICATE ENTRIES
-- Keep only ONE entry per (household_id, occurred_at, type, author) combination
-- Keeps the most recently updated entry when duplicates exist
-- =============================================================================

-- Delete duplicate entries, keeping only the most recently updated one per unique combination
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY household_id, occurred_at, payload->>'type', COALESCE(payload->>'author', 'patient')
               ORDER BY updated_at DESC
           ) as rn
    FROM entries
)
DELETE FROM entries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
