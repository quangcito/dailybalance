import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, InteractionLog } from '@/types/user';
import { FoodLog } from '@/types/nutrition'; // Import FoodLog
import { ExerciseLog } from '@/types/exercise'; // Import ExerciseLog

// Ensure environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for backend

// Check for both URL and the Service Key now
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase URL or Service Role Key in environment variables.');
}

// Initialize Supabase client
// Initialize with Service Role Key to bypass RLS for server-side operations
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Fetches the user's profile from the 'profiles' table.
 * @param userId - The ID of the user.
 * @returns The user profile object or null if not found or error.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    console.log(`[getUserProfile] Attempting to fetch profile for userId: ${userId}`); // Added logging
    const { data, error } = await supabase
      .from('profiles') // Assuming table name is 'profiles'
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Changed from .single() to handle missing profiles gracefully

    // Added detailed logging of the raw query result
    console.log(`[getUserProfile] Raw Supabase response for userId ${userId}:`, { data, error });

    if (error) {
      // Note: .maybeSingle() only errors if MULTIPLE rows are found.
      // If error exists here, it's likely due to multiple rows or a connection issue.
      console.error(`Error fetching user profile for userId ${userId}:`, error.message);
      return null;
    }
    // Note: Casting to UserProfile. Assumes DB schema aligns.
    // Adjust mapping if needed.
    return data as UserProfile;
  } catch (err) {
    console.error('Unexpected error in getUserProfile:', err);
    return null;
  }
}

/**
 * Logs a user interaction to the 'interaction_logs' table.
 * @param log - The InteractionLog object to insert.
 */
export async function logInteraction(log: InteractionLog): Promise<void> {
  // Map the InteractionLog object to the database schema (camelCase -> snake_case for llmResponse)
  const dbLogEntry = {
    id: log.id, // Pass ID if provided
    user_id: log.userId, // Map userId to user_id if necessary (assuming DB uses user_id)
    session_id: log.sessionId, // Map sessionId if necessary
    timestamp: log.timestamp || new Date().toISOString(),
    query: log.query,
    llm_response: log.llmResponse, // Map llmResponse (camelCase) to llm_response (snake_case)
    user_feedback: log.userFeedback, // Map userFeedback if necessary
    metadata: log.metadata, // Map metadata if necessary
  };

  // Remove undefined fields to avoid inserting nulls unintentionally
  Object.keys(dbLogEntry).forEach(key => dbLogEntry[key as keyof typeof dbLogEntry] === undefined && delete dbLogEntry[key as keyof typeof dbLogEntry]);

  try {
    const { error } = await supabase
      .from('interaction_logs') // Assuming table name is 'interaction_logs'
      .insert([dbLogEntry]); // Insert the mapped entry

    if (error) {
      console.error('Error logging interaction:', error.message);
    } else {
      console.log('Interaction logged successfully for user:', log.userId);
    }
  } catch (err) {
    console.error('Unexpected error in logInteraction:', err);
  }
}

/**
 * Fetches food logs for a specific user and date.
 * @param userId - The ID of the user.
 * @param targetDate - The target date in 'YYYY-MM-DD' format.
 * @returns An array of FoodLog objects for that day.
 */
export async function getDailyFoodLogs(userId: string, targetDate: string): Promise<FoodLog[]> {
  const startTime = `${targetDate}T00:00:00Z`; // Start of the day in UTC
  const endTime = new Date(new Date(targetDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00Z'; // Start of the next day in UTC

  try {
    console.log(`[getDailyFoodLogs] Fetching for userId: ${userId}, date: ${targetDate}`);
    const { data, error } = await supabase
      .from('food_logs') // Use the actual table name
      .select('*')
      .eq('user_id', userId) // Filter by user ID (assuming DB column is user_id)
      .gte('timestamp', startTime) // Filter by timestamp >= start of day
      .lt('timestamp', endTime); // Filter by timestamp < start of next day

    if (error) {
      console.error(`Error fetching daily food logs for userId ${userId}, date ${targetDate}:`, error.message);
      return [];
    }
    console.log(`[getDailyFoodLogs] Found ${data?.length ?? 0} logs.`);
    // Note: Casting to FoodLog[]. This assumes the DB schema will align with the FoodLog type defined in nutrition.ts.
    // Adjust mapping if needed when DB schema is updated later.
    return (data || []) as FoodLog[];
  } catch (err) {
    console.error('Unexpected error in getDailyFoodLogs:', err);
    return [];
  }
}

/**
 * Fetches exercise logs for a specific user and date.
 * @param userId - The ID of the user.
 * @param targetDate - The target date in 'YYYY-MM-DD' format.
 * @returns An array of ExerciseLog objects for that day.
 */
export async function getDailyExerciseLogs(userId: string, targetDate: string): Promise<ExerciseLog[]> {
  const startTime = `${targetDate}T00:00:00Z`;
  const endTime = new Date(new Date(targetDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00Z';

  try {
    console.log(`[getDailyExerciseLogs] Fetching for userId: ${userId}, date: ${targetDate}`);
    const { data, error } = await supabase
      .from('exercise_logs') // Use the actual table name
      .select('*')
      .eq('user_id', userId) // Filter by user ID
      .gte('start_time', startTime) // Filter by start_time >= start of day
      .lt('start_time', endTime); // Filter by start_time < start of next day

    if (error) {
      console.error(`Error fetching daily exercise logs for userId ${userId}, date ${targetDate}:`, error.message);
      return [];
    }
    console.log(`[getDailyExerciseLogs] Found ${data?.length ?? 0} logs.`);
    // Note: Casting to ExerciseLog[]. This assumes the DB schema will align with the ExerciseLog type defined in exercise.ts.
    // Adjust mapping if needed when DB schema is updated later.
    return (data || []) as ExerciseLog[];
  } catch (err) {
    console.error('Unexpected error in getDailyExerciseLogs:', err);
    return [];
  }
}

/**
 * Fetches interaction logs for a specific user and date.
 * @param userId - The ID of the user.
 * @param targetDate - The target date in 'YYYY-MM-DD' format.
 * @returns An array of InteractionLog objects for that day.
 */
export async function getDailyInteractionLogs(userId: string, targetDate: string): Promise<InteractionLog[]> {
  const startTime = `${targetDate}T00:00:00Z`;
  const endTime = new Date(new Date(targetDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00Z';

  try {
    console.log(`[getDailyInteractionLogs] Fetching for userId: ${userId}, date: ${targetDate}`);
    const { data, error } = await supabase
      .from('interaction_logs') // Use the actual table name
      .select('*')
      .eq('user_id', userId) // Filter by user ID
      .gte('timestamp', startTime) // Filter by timestamp >= start of day
      .lt('timestamp', endTime); // Filter by timestamp < start of next day

    if (error) {
      console.error(`Error fetching daily interaction logs for userId ${userId}, date ${targetDate}:`, error.message);
      return [];
    }
    console.log(`[getDailyInteractionLogs] Found ${data?.length ?? 0} logs.`);
    // InteractionLog type should already align with DB schema based on previous steps
    return (data || []) as InteractionLog[];
  } catch (err) {
    console.error('Unexpected error in getDailyInteractionLogs:', err);
    return [];
  }
}

// Export the client instance if needed elsewhere, though usually functions are preferred
export default supabase;
