-- Drop foreign key constraints linking log tables to profiles table
-- This allows logs to be inserted even if the corresponding profile ID might
-- have issues or refer to a guest ID before profile save (though profile save now happens first).
-- This provides more robustness for logging.

-- Note: Constraint names might vary based on your specific schema.
-- Use SQL inspection tools or Supabase dashboard to confirm names if these fail.

ALTER TABLE public.food_logs
DROP CONSTRAINT IF EXISTS food_logs_user_id_fkey;

ALTER TABLE public.exercise_logs
DROP CONSTRAINT IF EXISTS exercise_logs_user_id_fkey;

ALTER TABLE public.interaction_logs
DROP CONSTRAINT IF EXISTS interaction_logs_user_id_fkey;
