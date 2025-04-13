import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, InteractionLog } from '@/types/user'; // Removed UserGoal

// Ensure environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for backend

// Check for both URL and the Service Key now
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase URL or Service Role Key in environment variables.');
}

// Initialize Supabase client
// We use the service role key for server-side operations if available,
// otherwise fall back to anon key. For operations requiring user context,
// ensure RLS is properly configured or use the user's auth token.
// For simplicity here, we'll use the anon key, assuming RLS allows these reads/writes.
// Consider using the service key for admin-level operations if needed.
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
    return data as UserProfile;
  } catch (err) {
    console.error('Unexpected error in getUserProfile:', err);
    return null;
  }
}

// Removed getActiveUserGoals function as goals are now part of UserProfile
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
