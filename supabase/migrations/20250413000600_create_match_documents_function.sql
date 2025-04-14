-- supabase/migrations/YYYYMMDDHHMMSS_create_match_documents_function_v5.sql

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop the function if it already exists to avoid conflicts during development/migration
DROP FUNCTION IF EXISTS public.match_documents;

-- NOTE: This assumes you have custom enum types named 'meal_type_enum' and 'intensity_enum' defined in your public schema.
-- If your enum types have different names, adjust them below.

-- Create the function for matching documents based on vector similarity
CREATE OR REPLACE FUNCTION public.match_documents (
  query_embedding vector(1536), -- Match the dimension of your embeddings (1536 based on current code, 384 based on plan)
  match_count int,
  filter jsonb -- Expects '{"user_id": "uuid", "table_name": "food_logs" | "exercise_logs"}'
)
RETURNS TABLE (
  -- Define columns matching the structure of BOTH food_logs and exercise_logs
  id uuid,
  user_id uuid,
  name text,
  logged_at timestamptz,
  date date,
  source text,
  embedding vector,
  similarity float,
  calories numeric,
  description text,
  portion_size text,
  meal_type meal_type_enum,
  macros jsonb,
  micronutrients jsonb,
  type text,
  duration numeric,
  intensity intensity_enum,
  calories_burned real, -- Changed from integer to real
  strength_details jsonb,
  cardio_details jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  target_table text := filter->>'table_name';
  requesting_user_id uuid := (filter->>'user_id')::uuid;
  sql_query text;
  column_select_list text; -- Variable to hold the dynamic column list
BEGIN
  -- Validate table name
  IF target_table <> 'food_logs' AND target_table <> 'exercise_logs' THEN
    RAISE EXCEPTION 'Invalid table_name specified: %', target_table;
  END IF;

  -- Construct the column select list based on the target table
  IF target_table = 'food_logs' THEN
    -- Ensure the NULL casts match the updated RETURNS TABLE types
    column_select_list := 'calories, description, portion_size, meal_type, macros, micronutrients, NULL::text as type, NULL::numeric as duration, NULL::intensity_enum as intensity, NULL::real as calories_burned, NULL::jsonb as strength_details, NULL::jsonb as cardio_details';
  ELSE -- target_table = 'exercise_logs'
    -- Ensure the NULL casts match the updated RETURNS TABLE types
    column_select_list := 'NULL::numeric as calories, NULL::text as description, NULL::text as portion_size, NULL::meal_type_enum as meal_type, NULL::jsonb as macros, NULL::jsonb as micronutrients, type, duration, intensity, calories_burned, strength_details, cardio_details';
  END IF;

  -- Construct the main dynamic query using the pre-built column list
  sql_query := format(
    'SELECT
       id, user_id, name, logged_at, date, source, embedding,
       1 - (embedding <=> %L::vector) AS similarity,
       %s -- column_select_list placeholder
     FROM public.%I -- target_table placeholder
     WHERE user_id = %L::uuid -- requesting_user_id placeholder
     ORDER BY embedding <=> %L::vector -- query_embedding placeholder
     LIMIT %L', -- match_count placeholder
    query_embedding,
    column_select_list,
    target_table,
    requesting_user_id,
    query_embedding,
    match_count
  );

  -- Execute the dynamic query and return the results
  RETURN QUERY EXECUTE sql_query;
END;
$$;
