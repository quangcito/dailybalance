import { NextRequest, NextResponse } from 'next/server';
// Import both getDailyFoodLogs and saveFoodLog
import { getDailyFoodLogs, saveFoodLog } from '@/lib/db/supabase';
import { FoodLog } from '@/types/nutrition';

// --- GET Handler ---
// Fetches food logs for a given guest and date
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

    console.log(`[API /api/food-logs] GET request for guestId: ${guestId}, date: ${date}`);

    const foodLogs: FoodLog[] = await getDailyFoodLogs(guestId, date);

    console.log(`[API /api/food-logs] Found ${foodLogs.length} logs for guestId: ${guestId}, date: ${date}`);
    return NextResponse.json(foodLogs, { status: 200 });

  } catch (error) {
    console.error('[API /api/food-logs] GET Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}

// --- POST Handler ---
// Creates a new food log entry for the given guest
export async function POST(req: NextRequest) {
  try {
    const guestId = req.headers.get('X-Guest-ID');

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    let newLogData: Partial<FoodLog>; // Use Partial as frontend might not send all fields
    try {
      newLogData = await req.json();
    } catch (parseError) {
      console.error('[API /api/food-logs] POST Error parsing request body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Basic validation: Check for essential fields
    if (!newLogData.name || typeof newLogData.calories !== 'number') {
        return NextResponse.json({ error: 'Missing required fields (name, calories)' }, { status: 400 });
    }

    console.log(`[API /api/food-logs] POST request for guestId: ${guestId}`);

    // Construct the object to save, omitting DB-generated fields
    const logToSave: Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: guestId, // Set the userId from the header
        name: newLogData.name,
        calories: newLogData.calories,
        // Include other fields from newLogData, providing defaults if necessary
        description: newLogData.description,
        portionSize: newLogData.portionSize,
        macros: newLogData.macros,
        micronutrients: newLogData.micronutrients,
        mealType: newLogData.mealType || 'snack', // Default mealType if not provided
        loggedAt: newLogData.loggedAt || new Date().toISOString(), // Default loggedAt if not provided
        date: newLogData.date || new Date().toISOString().split('T')[0], // Default date if not provided
        source: newLogData.source || 'user-input', // Default source to 'user-input'
    };

    // Call the Supabase function to save the log (which also handles embedding)
    // saveFoodLog expects a FoodLog, but internally handles missing id/timestamps for insertion.
    // We cast logToSave to FoodLog here, acknowledging the type mismatch before DB interaction.
    // A cleaner approach might be to adjust saveFoodLog's input type if possible.
    await saveFoodLog(logToSave as FoodLog);

    // Note: saveFoodLog currently doesn't return the created object.
    // If we needed to return the full object with DB-generated ID/timestamps,
    // saveFoodLog would need modification, or we'd need to re-fetch.
    // For now, just return success.
    console.log(`[API /api/food-logs] Successfully saved food log for guestId: ${guestId}`);
    return NextResponse.json({ message: 'Food log created successfully' }, { status: 201 });

  } catch (error) {
    console.error('[API /api/food-logs] POST Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // Consider more specific error codes if saveFoodLog throws identifiable errors
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
