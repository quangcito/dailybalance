import OpenAI from 'openai';
import { UserProfile, InteractionLog } from '@/types/user'; // Added InteractionLog
import { FoodLog } from '@/types/nutrition';
import { ExerciseLog } from '@/types/exercise';
import { KnowledgeLayerOutput } from './knowledge-layer'; // Updated import
import { saveFoodLog, saveExerciseLog } from '../db/supabase.ts'; // Import save functions

// Ensure environment variables are set
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error('Missing OpenAI API Key (OPENAI_API_KEY) in environment variables.');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Define the structure for the output of the Reasoning Layer
// NEW: Define structure for log intent identification
export interface AgenticLogIntent {
  type: 'food' | 'exercise';
  /** Raw details extracted from the query (e.g., "oatmeal for breakfast", "30 min run") */
  details: string;
}

export interface ReasoningOutput {
  /** Synthesized insights based on user context and factual info. */
  insights: string;
  /** Specific, actionable suggestions for the user. */
  suggestions?: string[];
  /** Potential warnings or areas needing attention (e.g., nutritional gaps). */
  warnings?: string[];
  /** Structured data derived during reasoning, intended for the final dataSummary. */
  derivedData?: Record<string, any>;
  /** Optional array of log intents identified for agentic creation. */
  agenticLogIntents?: AgenticLogIntent[]; // CHANGED from agenticLogsToCreate
  error?: string; // If an error occurred during reasoning
}

const REASONING_LAYER_SYSTEM_PROMPT = `You are the Reasoning Layer of the DailyBalance Answer Engine. Your primary role is to synthesize information and generate insights/recommendations. A secondary, but important, task is to identify if the user's query implicitly mentions a food or exercise event that should be logged.

**Process:**

1.  **Identify Agentic Log Intent (Perform FIRST):**
    *   **Scan the User Query:** Look *specifically* for phrases like "I ate...", "I had...", "I just finished...", "I went for...", "I did X exercise...", etc., that indicate a completed food or exercise event.
    *   **Check for Duplicates:** Before creating an intent, review the 'Daily Food Logs' and 'Daily Exercise Logs' provided as input. If a log for the same item (e.g., similar name and meal type or exercise type) already exists for the target date, do not create a new log intent. You may note the existing log in the insights (Step 3).
    *   **Extract Details:** If no duplicate is found and an intent is identified, determine the type ('food' or 'exercise') and extract the *exact phrase* describing the event (e.g., "oatmeal for breakfast", "a 30 min run", "an apple for a snack").
    *   **Store Intent:** Prepare an AgenticLogIntent object (an object with a 'type' field set to 'food' or 'exercise', and a 'details' field containing the extracted phrase string). If multiple non-duplicate events are mentioned, create multiple intent objects. If none are found or only duplicates are found, this step yields nothing.
    *   **Crucially:** Do NOT try to estimate calories, macros, duration, etc., at this stage. Only extract the raw details mentioned for non-duplicate events.

2.  **Analyze & Synthesize:** Now, analyze the Factual Information, User Profile, Goals, **Time Context (e.g., 'Morning', 'Evening')**, Daily Logs, Historical Logs, and the provided **Calorie Summary (Consumed, Burned, Net)**. Consider the user's overall context, progress, and the current time of day.

3.  **Generate Insights:** Create concise, personalized insights based on the synthesis in Step 2. What does the information mean for *this user* today? **If you detected a duplicate log in Step 1, include a brief note about it here (e.g., "Note: Oatmeal already logged for today").**

4.  **Formulate Suggestions/Warnings:** Generate preliminary, actionable suggestions and potential warnings based on the synthesis. **Tailor suggestions to the current Time Context.** For example, suggest breakfast items in the Morning, or winding down activities in the Evening.

5.  **Populate Derived Data:** Create a 'derivedData' object. Include the provided 'dailyCaloriesConsumed', 'dailyCaloriesBurned', and 'netCalories' values directly in this object. You may add other relevant summary points derived from the inputs if useful (e.g., total protein consumed). **Do NOT recalculate the calorie values.**

6.  **Output JSON:** Respond ONLY with a JSON object matching the ReasoningOutput interface (containing fields like 'insights' (string type), optional 'suggestions' (list of strings), optional 'warnings' (list of strings), optional 'derivedData' (object with properties like 'dailyCaloriesConsumed', 'dailyCaloriesBurned', 'netCalories'), optional 'agenticLogIntents' (list of AgenticLogIntent objects)).
    *   Populate the 'insights', 'suggestions', and 'warnings' fields based on Steps 2, 3, and 4.
    *   Populate the 'agenticLogIntents' field with the list of intent objects identified in Step 1. If no intents were found, omit this field or use an empty list.
    *   Populate the 'derivedData' field based on Step 5, ensuring it includes the provided calorie summary values.

**Inputs Provided:**
*   User Query
*   Factual Information
*   User Profile (incl. Goals, BMR/TDEE)
*   Time Context
*   Daily Food Logs
*   Daily Exercise Logs
*   Daily Interaction Logs
*   Historical Food Logs
*   Historical Exercise Logs
*   Historical Interaction Logs
*   **Calorie Summary:**
    *   dailyCaloriesConsumed (number)
    *   dailyCaloriesBurned (number)
    *   netCalories (number | undefined - may be undefined if TDEE is missing)

**Example Scenario 1:**
*   Query: "I ate an apple for a snack, was that okay?"
*   (Other inputs including Calorie Summary...)
*   Output: {
    "insights": "An apple is a good low-calorie snack choice...",
    "suggestions": ["Pairing it with protein..."],
    "derivedData": { "dailyCaloriesConsumed": 595, "dailyCaloriesBurned": 0, "netCalories": 1605, ... },
    "agenticLogIntents": [ { "type": "food", "details": "an apple for a snack" } ]
  }

**Example Scenario 2:**
*   Query: "I had oatmeal for breakfast, what's a good lunch?"
*   (Other inputs including Calorie Summary...)
*   Output: {
    "insights": "Having oatmeal for breakfast provides good fiber... (Note: Oatmeal already logged for today)", // Example insight if duplicate found
    "suggestions": ["For lunch, consider a grilled chicken salad..."],
    "derivedData": { "dailyCaloriesConsumed": 300, "dailyCaloriesBurned": 0, "netCalories": 1900, ... }
    // No agenticLogIntents because it was a duplicate
  }

**Example Scenario 3:**
*   Query: "What are the benefits of running?"
*   (Other inputs including Calorie Summary...)
*   Output: {
    "insights": "Running offers numerous cardiovascular benefits...",
    "suggestions": [...],
    "derivedData": { "dailyCaloriesConsumed": 1200, "dailyCaloriesBurned": 350, "netCalories": 1350, ... }
    // No agenticLogIntents field as no event was mentioned
  }

Focus on accurately identifying the log intent (Step 1) and then generating the rest of the response based on the overall context, including the provided calorie summary. Ensure accurate JSON output.`;

/**
 * Generates personalized insights by synthesizing factual information with user context.
 *
 * @param query - The original user query.
 * @param factualInfo - Information from the Knowledge Layer.
 * @param userProfile - The user's profile data.
 * @param userGoals - (Removed) The user's active goals are now part of UserProfile.
 * @param timeContext - Current time context (e.g., "Morning", "Midday").
 * @param dailyFoodLogs - Array of food logs for the target date.
 * @param dailyExerciseLogs - Array of exercise logs for the target date.
 * @param dailyInteractionLogs - Array of interaction logs for the target date.
 * @param historicalFoodLogs - Array of relevant historical food logs.
 * @param historicalExerciseLogs - Array of relevant historical exercise logs.
 * @param historicalInteractionLogs - Array of relevant historical interaction metadata.
 * @returns A ReasoningOutput object or null if an error occurs.
 */
export async function generatePersonalizedInsights(
  query: string,
  knowledgeOutput: KnowledgeLayerOutput, // Updated type and name
  userProfile: UserProfile | null,
  timeContext: string, // e.g., "Morning", "Midday", "Evening"
  dailyFoodLogs: FoodLog[],
  dailyExerciseLogs: ExerciseLog[],
  dailyInteractionLogs: InteractionLog[],
  // Add historical log parameters
  historicalFoodLogs: FoodLog[],
  historicalExerciseLogs: ExerciseLog[],
  historicalInteractionLogs: any[],
  // Add calculated calorie parameters
  dailyCaloriesConsumed?: number,
  dailyCaloriesBurned?: number,
  netCalories?: number
): Promise<ReasoningOutput | null> {
  console.log(`Reasoning Layer: Generating insights for query: "${query}"`);

  // Construct the prompt for the LLM
  const userMessageContent = `
User Query: ${query}
Factual Information: ${JSON.stringify(knowledgeOutput.content)}
User Profile: ${JSON.stringify(userProfile)}
User Goals: (Now part of User Profile) ${JSON.stringify(userProfile?.goal)}
Time Context: ${timeContext}
Daily Food Logs: ${JSON.stringify(dailyFoodLogs)}
Daily Exercise Logs: ${JSON.stringify(dailyExerciseLogs)}
Daily Interaction Logs: ${JSON.stringify(dailyInteractionLogs)}
Historical Food Logs: ${JSON.stringify(historicalFoodLogs)}
Historical Exercise Logs: ${JSON.stringify(historicalExerciseLogs)}
Historical Interaction Logs: ${JSON.stringify(historicalInteractionLogs)}
Calorie Summary:
  - Daily Calories Consumed: ${dailyCaloriesConsumed ?? 'Not Available'}
  - Daily Calories Burned: ${dailyCaloriesBurned ?? 'Not Available'}
  - Net Calories: ${netCalories ?? 'Not Available (Missing TDEE?)'}

Generate the JSON output based on these inputs.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using the specified model
      messages: [
        { role: 'system', content: REASONING_LAYER_SYSTEM_PROMPT },
        { role: 'user', content: userMessageContent },
      ],
      response_format: { type: 'json_object' }, // Request JSON output
      temperature: 0.5, // Lower temperature for more focused reasoning
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      console.error('Reasoning Layer: No content received from OpenAI.');
      return { insights: '', error: 'No content received from LLM.' };
    }

    // Parse the JSON response
    try {
      const parsedOutput: ReasoningOutput = JSON.parse(responseContent);
      console.log('Reasoning Layer: Successfully generated insights.');
      // Agentic logging will be handled by a separate node in the orchestrator.
      // The 'agenticLogsToCreate' array is included in parsedOutput if generated by the LLM.
      return parsedOutput;
    } catch (parseError) {
      console.error('Reasoning Layer: Failed to parse JSON response from OpenAI:', parseError);
      console.error('Raw response content:', responseContent); // Log raw response for debugging
      return { insights: '', error: 'Failed to parse LLM response.' };
    }

  } catch (error) {
    console.error('Reasoning Layer: Error calling OpenAI API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown OpenAI API error';
    return { insights: '', error: `OpenAI API Error: ${errorMessage}` };
  }
}
