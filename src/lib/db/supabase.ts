import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserGoal, InteractionLog } from '@/types/user';

// Ensure environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key in environment variables.');
}

// Initialize Supabase client
// We use the service role key for server-side operations if available,
// otherwise fall back to anon key. For operations requiring user context,
// ensure RLS is properly configured or use the user's auth token.
// For simplicity here, we'll use the anon key, assuming RLS allows these reads/writes.
// Consider using the service key for admin-level operations if needed.
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetches the user's profile from the 'profiles' table.
 * @param userId - The ID of the user.
 * @returns The user profile object or null if not found or error.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles') // Assuming table name is 'profiles'
      .select('*')
      .eq('id', userId)
      .single(); // Expecting only one profile per user ID

    if (error) {
      console.error('Error fetching user profile:', error.message);
      return null;
    }
    return data as UserProfile;
  } catch (err) {
    console.error('Unexpected error in getUserProfile:', err);
    return null;
  }
}

/**
 * Fetches the user's active goals from the 'goals' table.
 * @param userId - The ID of the user.
 * @returns An array of active user goals or an empty array if none found or error.
 */
export async function getActiveUserGoals(userId: string): Promise<UserGoal[]> {
  try {
    const { data, error } = await supabase
      .from('goals') // Assuming table name is 'goals'
      .select('*')
      .eq('userId', userId)
      .eq('isActive', true); // Filter for active goals

    if (error) {
      console.error('Error fetching active user goals:', error.message);
      return [];
    }
    return data as UserGoal[];
  } catch (err) {
    console.error('Unexpected error in getActiveUserGoals:', err);
    return [];
  }
}

/**
 * Logs a user interaction to the 'interaction_logs' table.
 * @param log - The InteractionLog object to insert.
 */
export async function logInteraction(log: InteractionLog): Promise<void> {
  // Ensure timestamp is set if not provided
  const logEntry = {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from('interaction_logs') // Assuming table name is 'interaction_logs'
      .insert([logEntry]); // Insert the log entry

    if (error) {
      console.error('Error logging interaction:', error.message);
    } else {
      console.log('Interaction logged successfully for user:', log.userId);
    }
  } catch (err) {
    console.error('Unexpected error in logInteraction:', err);
  }
}

// Export the client instance if needed elsewhere, though usually functions are preferred
export default supabase;
