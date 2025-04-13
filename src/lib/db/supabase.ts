import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, InteractionLog } from '@/types/user';
import { FoodLog } from '@/types/nutrition'; // Import FoodLog
import { ExerciseLog } from '@/types/exercise'; // Import ExerciseLog
import { generateEmbedding } from '../utils/embeddings'; // Import embedding utility

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
 * Saves a guest user's profile data to the 'profiles' table.
 * @param guestId - The generated UUID for the guest user.
 * @param profileData - The partial profile data collected from the onboarding form.
 */
export async function saveGuestProfile(guestId: string, profileData: Partial<UserProfile>): Promise<void> {
  console.log(`[saveGuestProfile] Attempting to save profile for guestId: ${guestId}`);

  // Map frontend data (camelCase, partial) to DB schema (snake_case, potentially more fields)
  const dbProfileData = {
    id: guestId, // Use the guestId as the primary key
    // Required fields with defaults/placeholders
    email: `guest-${guestId}@example.com`, // Placeholder email
    name: 'Guest User', // Placeholder name
    // Map collected data, checking for undefined
    age: profileData.age,
    gender: profileData.gender,
    height: profileData.height, // in cm
    weight: profileData.weight, // in kg
    activity_level: profileData.activityLevel, // Map camelCase to snake_case
    goal: profileData.goal,
    // Map complex objects (ensure DB columns are JSON/JSONB)
    dietary_preferences: profileData.dietaryPreferences, // Map camelCase to snake_case
    macro_targets: profileData.macroTargets, // Map camelCase to snake_case
    preferences: profileData.preferences,
    // Timestamps - let Supabase handle defaults if triggers exist, or set explicitly
    // created_at: new Date().toISOString(),
    // updated_at: new Date().toISOString(),
  };

  // Remove undefined fields to avoid inserting nulls unintentionally
  Object.keys(dbProfileData).forEach(key => {
      const typedKey = key as keyof typeof dbProfileData;
      if (dbProfileData[typedKey] === undefined) {
          delete dbProfileData[typedKey];
      }
  });

  try {
    const { error } = await supabase
      .from('profiles')
      .insert([dbProfileData]); // Insert the mapped data

    if (error) {
      console.error(`[saveGuestProfile] Error saving guest profile for guestId ${guestId}:`, error.message);
      // Handle specific errors? e.g., duplicate ID?
      // Throw error or handle gracefully
      throw error; // Re-throw for the API route to catch
    } else {
      console.log(`[saveGuestProfile] Guest profile saved successfully for guestId: ${guestId}`);
    }
  } catch (err) {
    console.error('[saveGuestProfile] Unexpected error:', err);
    // Ensure error is propagated
    throw err instanceof Error ? err : new Error('Unexpected error saving guest profile');
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
      .gte('logged_at', startTime) // Filter by timestamp >= start of day
      .lt('logged_at', endTime); // Filter by timestamp < start of next day

    if (error) {
      console.error(`Error fetching daily food logs for userId ${userId}, date ${targetDate}:`, error.message);
      return [];
    }
    console.log(`[getDailyFoodLogs] Found ${data?.length ?? 0} logs.`);

    // Manually map snake_case columns to camelCase FoodLog properties
    const mappedData: FoodLog[] = (data || []).map(item => ({
        id: item.id,
        userId: item.user_id,
        name: item.name,
        description: item.description,
        portionSize: item.portion_size,
        calories: item.calories,
        macros: item.macros, // Assumes Supabase returns JSON correctly
        micronutrients: item.micronutrients, // Assumes Supabase returns JSON correctly
        mealType: item.meal_type, // Explicit mapping
        loggedAt: item.logged_at,
        date: item.date,
        source: item.source,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
    }));

    return mappedData;
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
      .gte('logged_at', startTime) // Filter by logged_at >= start of day
      .lt('logged_at', endTime); // Filter by logged_at < start of next day

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
    // Manually map and parse llm_response to ensure correct type
    const mappedData: InteractionLog[] = (data || []).map(item => {
        let parsedLlmResponse: any = null; // Use 'any' temporarily for parsing flexibility
        if (item.llm_response) {
            if (typeof item.llm_response === 'string') {
                try {
                    parsedLlmResponse = JSON.parse(item.llm_response);
                } catch (e) {
                    console.error(`[getDailyInteractionLogs] Failed to parse llm_response JSON string for log ${item.id}:`, e);
                    // Keep parsedLlmResponse as null if parsing fails
                }
            } else if (typeof item.llm_response === 'object') {
                // Assume it's already a valid object (or null)
                parsedLlmResponse = item.llm_response;
            }
        }

        // Construct the InteractionLog object, mapping snake_case to camelCase
        return {
            id: item.id,
            userId: item.user_id,
            sessionId: item.session_id,
            timestamp: item.timestamp,
            query: item.query,
            llmResponse: parsedLlmResponse, // Use the potentially parsed object
            sources: item.sources, // Assuming 'sources' column exists and is JSONB/array
            userFeedback: item.user_feedback,
            metadata: item.metadata,
            // embedding is likely not selected or needed here
        };
    });

    return mappedData;
  } catch (err) {
    console.error('Unexpected error in getDailyInteractionLogs:', err);
    return [];
  }
}

// --- NEW FUNCTIONS FOR SAVING LOGS WITH EMBEDDINGS ---


/**
* Saves a food log entry along with its embedding to the 'food_logs' table.
* @param log - The FoodLog object to insert.
*/
export async function saveFoodLog(log: FoodLog): Promise<void> {
console.log(`[saveFoodLog] Attempting to save food log for user: ${log.userId}`);

// 1. Prepare text for embedding
const textToEmbed = `${log.name || ''} (${log.mealType || 'Unknown Meal'})`; // Combine name and meal type

// 2. Generate embedding
const embedding = await generateEmbedding(textToEmbed);

if (!embedding) {
  console.error(`[saveFoodLog] Failed to generate embedding for food log. Saving without embedding.`);
  // Decide if saving without embedding is acceptable or should throw error
}

// 3. Prepare DB entry (map camelCase to snake_case if needed, include embedding)
// Assuming DB columns are snake_case based on previous patterns
const dbLogEntry = {
  // Map required fields from FoodLog type
  user_id: log.userId,
  name: log.name,
  calories: log.calories,
  logged_at: log.loggedAt || new Date().toISOString(), // Default to now if not provided
  date: log.date || new Date().toISOString().split('T')[0], // Default to today if not provided
  source: log.source || 'unknown', // Default source

  // Map optional fields
  description: log.description,
  portion_size: log.portionSize,
  meal_type: log.mealType,
  macros: log.macros, // Assumes JSONB column
  micronutrients: log.micronutrients, // Assumes JSONB column

  // Add the embedding (will be null if generation failed)
  embedding: embedding,
};

 // Remove undefined fields to avoid inserting nulls unintentionally
 // Use type assertion to help TypeScript with indexing
 Object.keys(dbLogEntry).forEach(key => {
   const typedKey = key as keyof typeof dbLogEntry;
   if (dbLogEntry[typedKey] === undefined) {
     delete dbLogEntry[typedKey];
   }
 });


// 4. Insert into Supabase
try {
  const { error } = await supabase
    .from('food_logs')
    .insert([dbLogEntry]);

  if (error) {
    console.error('[saveFoodLog] Error saving food log:', error.message);
    // Optionally re-throw or handle error
  } else {
    console.log(`[saveFoodLog] Food log saved successfully for user: ${log.userId}`);
  }
} catch (err) {
  console.error('[saveFoodLog] Unexpected error saving food log:', err);
}
}

/**
 * Saves an exercise log entry along with its embedding to the 'exercise_logs' table.
 * @param log - The ExerciseLog object to insert.
 */
export async function saveExerciseLog(log: ExerciseLog): Promise<void> {
  console.log(`[saveExerciseLog] Attempting to save exercise log for user: ${log.userId}`);

  // 1. Prepare text for embedding
  const textToEmbed = `${log.name || ''} (${log.type || 'Unknown Type'})`; // Combine name and type

  // 2. Generate embedding
  const embedding = await generateEmbedding(textToEmbed);

  if (!embedding) {
    console.error(`[saveExerciseLog] Failed to generate embedding for exercise log. Saving without embedding.`);
    // Decide if saving without embedding is acceptable or should throw error
  }

  // 3. Prepare DB entry (map camelCase to snake_case if needed, include embedding)
  const dbLogEntry = {
    // Map required fields from ExerciseLog type
    user_id: log.userId,
    name: log.name,
    type: log.type,
    logged_at: log.loggedAt || new Date().toISOString(),
    date: log.date || new Date().toISOString().split('T')[0],
    source: log.source || 'unknown',

    // Map optional fields
    duration: log.duration,
    intensity: log.intensity,
    calories_burned: log.caloriesBurned,
    strength_details: log.strengthDetails, // Assumes JSONB
    cardio_details: log.cardioDetails, // Assumes JSONB

    // Add the embedding (will be null if generation failed)
    embedding: embedding,
  };

  // Remove undefined fields
  Object.keys(dbLogEntry).forEach(key => {
    const typedKey = key as keyof typeof dbLogEntry;
    if (dbLogEntry[typedKey] === undefined) {
      delete dbLogEntry[typedKey];
    }

  });

  // 4. Insert into Supabase
  try {
    const { error } = await supabase
      .from('exercise_logs')
      .insert([dbLogEntry]);

    if (error) {
      console.error('[saveExerciseLog] Error saving exercise log:', error.message);
    } else {
      console.log(`[saveExerciseLog] Exercise log saved successfully for user: ${log.userId}`);
    }
  } catch (err) {
    console.error('[saveExerciseLog] Unexpected error saving exercise log:', err);
  }
}

// --- NEW FUNCTIONS FOR VECTOR SEARCH ---

/**
 * Searches for relevant food logs based on embedding similarity using pgvector.
 * Assumes a 'match_documents' function exists in Supabase for vector search.
 * Adjust function name and parameters based on your actual Supabase setup.
 *
 * @param userId The ID of the user whose logs to search.
 * @param queryEmbedding The vector embedding of the user's query.
 * @param count The maximum number of similar logs to retrieve.
 * @returns An array of relevant FoodLog objects.
 */
export async function searchFoodLogs(userId: string, queryEmbedding: number[], count: number): Promise<FoodLog[]> {
  console.log(`[searchFoodLogs] Searching for ${count} relevant food logs for user ${userId}`);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn("[searchFoodLogs] Query embedding is empty. Skipping search.");
    return [];
  }
  try {
    // Note: Adjust 'match_food_logs' and parameters if your RPC function is different.
    // This assumes an RPC function optimized for the food_logs table.
    // Alternatively, use a generic 'match_documents' with table name in filter/params.
    const { data, error } = await supabase.rpc('match_documents', { // Using generic name, adjust if needed
      query_embedding: queryEmbedding,
      match_count: count,
      filter: { user_id: userId, table_name: 'food_logs' } // Example filter, adjust based on RPC function
      // Ensure your RPC function handles filtering correctly (e.g., WHERE user_id = filter->>'user_id')
      // And selects from the correct table based on filter->>'table_name' or similar.
    });

    if (error) {
      console.error('[searchFoodLogs] Error performing vector search:', error);
      return [];
    }

    console.log(`[searchFoodLogs] Found ${data?.length ?? 0} potentially relevant logs.`);
    // The RPC function should return rows matching the FoodLog structure.
    // Casting assumes the RPC function returns the correct columns.
    return (data || []) as FoodLog[];
  } catch (err) {
    console.error('[searchFoodLogs] Unexpected error during vector search:', err);
    return [];
  }
}

/**
 * Searches for relevant exercise logs based on embedding similarity using pgvector.
 * Assumes a 'match_documents' function exists in Supabase for vector search.
 * Adjust function name and parameters based on your actual Supabase setup.
 *
 * @param userId The ID of the user whose logs to search.
 * @param queryEmbedding The vector embedding of the user's query.
 * @param count The maximum number of similar logs to retrieve.
 * @returns An array of relevant ExerciseLog objects.
 */
export async function searchExerciseLogs(userId: string, queryEmbedding: number[], count: number): Promise<ExerciseLog[]> {
   console.log(`[searchExerciseLogs] Searching for ${count} relevant exercise logs for user ${userId}`);
   if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn("[searchExerciseLogs] Query embedding is empty. Skipping search.");
    return [];
  }
  try {
    // Adjust RPC function name/params as needed
    const { data, error } = await supabase.rpc('match_documents', { // Using generic name, adjust if needed
      query_embedding: queryEmbedding,
      match_count: count,
      filter: { user_id: userId, table_name: 'exercise_logs' } // Example filter
    });

    if (error) {
      console.error('[searchExerciseLogs] Error performing vector search:', error);
      return [];
    }

     console.log(`[searchExerciseLogs] Found ${data?.length ?? 0} potentially relevant logs.`);
    // Casting assumes the RPC function returns the correct columns.
    return (data || []) as ExerciseLog[];
  } catch (err) {
    console.error('[searchExerciseLogs] Unexpected error during vector search:', err);
    return [];
  }
}

// Export the client instance if needed elsewhere, though usually functions are preferred
export default supabase;
