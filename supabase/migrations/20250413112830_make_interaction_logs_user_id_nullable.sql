-- Make user_id nullable in interaction_logs to allow logging for guest users

ALTER TABLE public.interaction_logs
ALTER COLUMN user_id DROP NOT NULL;

-- Note: This assumes the user_id column exists and was previously NOT NULL.
-- If a foreign key constraint exists, it might need to be dropped first,
-- but making the column nullable is often sufficient if the constraint
-- allows NULLs or if ON DELETE SET NULL/DEFAULT is acceptable (though less likely here).
-- If inserts still fail due to FK violation after this, the FK needs dropping:
-- ALTER TABLE public.interaction_logs DROP CONSTRAINT interaction_logs_user_id_fkey;
