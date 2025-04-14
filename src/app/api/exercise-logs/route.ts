import { NextRequest, NextResponse } from 'next/server';
// Import both getDailyExerciseLogs and saveExerciseLog
import { getDailyExerciseLogs, saveExerciseLog } from '@/lib/db/supabase';
import { ExerciseLog } from '@/types/exercise';

// --- GET Handler ---
// Fetches exercise logs for a given guest and date
// Expects date in YYYY-MM-DD format as a query parameter
export async function GET(req: NextRequest) {
  try {
    const guestId = req.headers.get('X-Guest-ID');
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // e.g., '2025-04-13'

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ error: 'Missing date query parameter' }, { status: 400 });
    }

    // Optional: Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    console.log(`[API /api/exercise-logs] GET request for guestId: ${guestId}, date: ${date}`);

    // Note: getDailyExerciseLogs currently returns data directly cast as ExerciseLog[]
    // It might need mapping similar to getDailyFoodLogs if DB uses snake_case
    const exerciseLogs: ExerciseLog[] = await getDailyExerciseLogs(guestId, date);

    console.log(`[API /api/exercise-logs] Found ${exerciseLogs.length} logs for guestId: ${guestId}, date: ${date}`);
    return NextResponse.json(exerciseLogs, { status: 200 });

  } catch (error) {
    console.error('[API /api/exercise-logs] GET Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}

// --- POST Handler ---
// Creates a new exercise log entry for the given guest
export async function POST(req: NextRequest) {
  try {
    const guestId = req.headers.get('X-Guest-ID');

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    let newLogData: Partial<ExerciseLog>;
    try {
      newLogData = await req.json();
    } catch (parseError) {
      console.error('[API /api/exercise-logs] POST Error parsing request body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Basic validation: Check for essential fields including date
   const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
   if (
     !newLogData.name ||
     !newLogData.type ||
     typeof newLogData.duration !== 'number' ||
     !newLogData.intensity ||
     typeof newLogData.caloriesBurned !== 'number' ||
     !newLogData.date || // Add date check
     !dateRegex.test(newLogData.date) // Add date format check
   ) {
       return NextResponse.json({ error: 'Missing required fields (name, type, duration, intensity, caloriesBurned, date) or invalid date format (YYYY-MM-DD)' }, { status: 400 });
   }

    console.log(`[API /api/exercise-logs] POST request for guestId: ${guestId}`);

    // Construct the object to save, omitting DB-generated fields
    const logToSave: Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: guestId,
        name: newLogData.name,
        type: newLogData.type,
        duration: newLogData.duration,
        intensity: newLogData.intensity,
        caloriesBurned: newLogData.caloriesBurned,
        // Optional fields
        strengthDetails: newLogData.strengthDetails,
        cardioDetails: newLogData.cardioDetails,
        // Defaults
        loggedAt: newLogData.loggedAt || new Date().toISOString(), // Default loggedAt timestamp if not provided
       date: newLogData.date, // Use date provided by the client (validated above)
       source: newLogData.source || 'user-input', // Default source
    };

    // Call the Supabase function to save the log (which also handles embedding)
    // Cast to ExerciseLog as saveExerciseLog expects the full type
    await saveExerciseLog(logToSave as ExerciseLog);

    // Similar to food logs, saveExerciseLog doesn't return the created object.
    console.log(`[API /api/exercise-logs] Successfully saved exercise log for guestId: ${guestId}`);
    return NextResponse.json({ message: 'Exercise log created successfully' }, { status: 201 });

  } catch (error) {
    console.error('[API /api/exercise-logs] POST Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
