import OpenAI from 'openai';
import { FoodLog } from '@/types/nutrition'; // Removed Macros import again
import { ExerciseLog } from '@/types/exercise';
import { AgenticLogIntent } from './llm/reasoning-layer'; // Assuming AgenticLogIntent is exported from reasoning-layer.ts

// Ensure environment variables are set
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  // Avoid throwing error during build/import time, log instead or handle differently
  console.error('Missing OpenAI API Key (OPENAI_API_KEY) in environment variables for log enrichment. Enrichment will fail.');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const FOOD_ENRICHMENT_PROMPT = `You are a nutrition data assistant. Given a raw description of food eaten, extract the primary food item name and estimate its nutritional details (calories, macros - protein, carbs, fat) for a typical single serving. Also infer the meal type (Breakfast, Lunch, Dinner, Snack) if possible from context like "for breakfast".

Input Description: "{details}"

Output ONLY a JSON object with the following structure, using estimated values for a standard serving:
{
  "name": "Primary Food Name",
  "calories": ESTIMATED_CALORIES_NUMBER,
  "mealType": "Inferred Meal Type or Snack",
  "macros": {
    "protein": ESTIMATED_PROTEIN_GRAMS_NUMBER,
    "carbs": ESTIMATED_CARBS_GRAMS_NUMBER,
    "fat": ESTIMATED_FAT_GRAMS_NUMBER
  }
}
If you cannot reasonably estimate the details, output: {"error": "Could not estimate details"}
`;

const EXERCISE_ENRICHMENT_PROMPT = `You are a fitness data assistant. Given a raw description of an exercise performed, extract the primary exercise name and estimate its typical duration (in minutes) or calories burned for a standard session. Also infer the exercise type (Cardio, Strength, Flexibility, Other).

Input Description: "{details}"

Output ONLY a JSON object with the following structure, using estimated values for a standard session:
{
  "name": "Primary Exercise Name",
  "type": "Inferred Type (Cardio/Strength/Flexibility/Other)",
  "duration": ESTIMATED_DURATION_MINUTES_NUMBER | null, // Estimate if possible, otherwise null
  "caloriesBurned": ESTIMATED_CALORIES_NUMBER | null // Estimate if possible, otherwise null
}
// Provide at least duration OR caloriesBurned if possible.
If you cannot reasonably estimate the details, output: {"error": "Could not estimate details"}
`;

// Interfaces for expected LLM output structure
interface EnrichedFoodData {
    name: string;
    calories: number;
    mealType: string;
    // Define expected macro structure inline based on prompt
    macros: {
        protein: number;
        carbs: number;
        fat: number;
    };
    error?: string;
}

interface EnrichedExerciseData {
    name: string;
    type: string;
    duration?: number | null; // Make optional as LLM might return null
    caloriesBurned?: number | null; // Make optional
    error?: string;
}

/**
 * Takes raw log details and uses an LLM to enrich it with estimated data,
 * returning a structured FoodLog or ExerciseLog object.
 * @param intent - The AgenticLogIntent object.
 * @param userId - The user ID (for the final log object).
 * @param targetDate - The target date (for the final log object).
 * @returns A fully formed FoodLog or ExerciseLog, or null if enrichment fails.
 */
export async function enrichLogIntent(
    intent: AgenticLogIntent,
    userId: string,
    targetDate: string
): Promise<Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'> | null> { // Adjusted return type
    // Check if API key is available before proceeding
    if (!openaiApiKey) {
        console.error("[enrichLogIntent] Cannot proceed without OpenAI API Key.");
        return null;
    }
    console.log(`[enrichLogIntent] Enriching ${intent.type} log: "${intent.details}"`);

    const promptTemplate = intent.type === 'food' ? FOOD_ENRICHMENT_PROMPT : EXERCISE_ENRICHMENT_PROMPT;
    const prompt = promptTemplate.replace("{details}", intent.details);

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Or a model suitable for structured data extraction
            messages: [
                { role: 'system', content: "You are an assistant that extracts and estimates nutritional or exercise data and outputs ONLY JSON." },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2, // Low temperature for factual estimation
        });

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            console.error(`[enrichLogIntent] No content received from OpenAI for: "${intent.details}"`);
            return null;
        }

        // Parse the JSON response
        let parsedOutput: any;
         try {
            parsedOutput = JSON.parse(responseContent);
         } catch (parseError) {
             console.error(`[enrichLogIntent] Failed to parse JSON response for "${intent.details}":`, parseError);
             console.error(`[enrichLogIntent] Raw response:`, responseContent);
             return null;
         }


        if (parsedOutput.error) {
             console.warn(`[enrichLogIntent] LLM could not estimate details for: "${intent.details}". Error: ${parsedOutput.error}`);
             return null;
        }

        // Construct the final log object
        const baseLog = {
            userId: userId,
            loggedAt: new Date().toISOString(),
            date: targetDate,
            source: 'ai-logging' as const,
            description: intent.details // Use raw details as description
        };

        if (intent.type === 'food') {
            const enrichedData = parsedOutput as EnrichedFoodData;
            // Basic validation of required fields
            if (typeof enrichedData.name !== 'string' || typeof enrichedData.calories !== 'number' || typeof enrichedData.mealType !== 'string' || typeof enrichedData.macros !== 'object') {
                 console.error(`[enrichLogIntent] Missing or invalid required fields in enriched food data for: "${intent.details}"`, enrichedData);
                 return null;
            }
            // Cast mealType after basic validation
            const mealType = enrichedData.mealType.toLowerCase() as FoodLog['mealType'];
            // Add more robust validation if needed (e.g., check against allowed values)

            // Create an object matching the Omit type
            const foodLog: Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> = {
                ...baseLog,
                name: enrichedData.name,
                calories: enrichedData.calories,
                mealType: mealType, // Use validated/cast value
                macros: enrichedData.macros,
                // Add other optional FoodLog fields as needed, maybe default values
                portionSize: '1 serving (estimated)',
            };
            console.log(`[enrichLogIntent] Successfully enriched food log: ${foodLog.name}`);
            return foodLog;
        } else { // Exercise
             const enrichedData = parsedOutput as EnrichedExerciseData;
             // Basic validation of required fields
             if (typeof enrichedData.name !== 'string' || typeof enrichedData.type !== 'string' || (enrichedData.duration === undefined && enrichedData.caloriesBurned === undefined)) {
                 console.error(`[enrichLogIntent] Missing or invalid required fields in enriched exercise data for: "${intent.details}"`, enrichedData);
                 return null;
             }
            // Cast type after basic validation
            const exerciseType = enrichedData.type.toLowerCase() as ExerciseLog['type'];
             // Add more robust validation if needed

            // Create an object matching the Omit type
            const exerciseLog: Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'> = {
                ...baseLog,
                name: enrichedData.name,
                type: exerciseType, // Use validated/cast value
                // Provide default 0 if LLM returns null/undefined or non-number
                duration: typeof enrichedData.duration === 'number' ? enrichedData.duration : 0,
                caloriesBurned: typeof enrichedData.caloriesBurned === 'number' ? enrichedData.caloriesBurned : 0,
                // Add default for intensity if needed by type, e.g., 'moderate'
                intensity: 'moderate', // Add default intensity
                // Add other optional ExerciseLog fields
            };
             console.log(`[enrichLogIntent] Successfully enriched exercise log: ${exerciseLog.name}`);
            return exerciseLog;
        }

    } catch (error) {
        console.error(`[enrichLogIntent] Error during enrichment for "${intent.details}":`, error);
        return null;
    }
}
