import OpenAI from 'openai';
import { UserProfile, InteractionLog } from '@/types/user'; // Added InteractionLog
import { FoodLog } from '@/types/nutrition';
import { ExerciseLog } from '@/types/exercise';
import { FactualInformation } from './knowledge-layer.js';
import { saveFoodLog, saveExerciseLog } from '../db/supabase.js'; // Import save functions

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
export interface ReasoningOutput {
  /** Synthesized insights based on user context and factual info. */
  insights: string;
  /** Specific, actionable suggestions for the user. */
  suggestions?: string[];
  /** Potential warnings or areas needing attention (e.g., nutritional gaps). */
  warnings?: string[];
  /** Structured data derived during reasoning, intended for the final dataSummary. */
  derivedData?: Record<string, any>;
  /** Optional array of food/exercise logs identified for agentic creation. */
  agenticLogsToCreate?: (FoodLog | ExerciseLog)[];
  error?: string; // If an error occurred during reasoning
}

const REASONING_LAYER_SYSTEM_PROMPT = `You are the Reasoning Layer of the DailyBalance Answer Engine. Your role is to synthesize factual information with user-specific context (profile, goals, time of day, and logs for the target date) to generate personalized insights, preliminary recommendations, and identify potential food/exercise logs implied by the user's query.

Inputs Provided:
1.  User Query: The original question asked by the user.
2.  Factual Information: Data retrieved by the Knowledge Layer (e.g., nutritional info, exercise details).
3.  User Profile: Details like age, gender, height, weight, activity level, calculated BMR/TDEE.
4.  User Goals: (Now part of User Profile) Active health/fitness goals.
5.  Time Context: The current time context (e.g., "Morning", "Midday", "Evening").
6.  Daily Food Logs: Food consumed by the user on the target date.
7.  Daily Exercise Logs: Exercises performed by the user on the target date.
8.  Daily Interaction Logs: Previous questions/answers from the user on the target date.

Your Tasks:
1.  **Analyze & Synthesize:** Analyze the Factual Information in light of the User Profile, Goals, Time Context, AND the Daily Logs for the target date. Consider progress towards goals (calories, exercise). Identify relevant connections, implications, or discrepancies.
2.  **Generate Insights:** Create concise, personalized insights. What does this information *mean* for *this specific user* considering their activity *today*?
3.  **Formulate Suggestions/Warnings:** Generate preliminary, actionable suggestions and potential warnings based on the daily context and synthesis.
4.  **Identify Agentic Logs:** Determine if the User Query clearly implies a food or exercise event that hasn't been logged yet (e.g., "I just ate an apple and some nuts", "I went for a 30 min run"). If so, structure the details of these implied events.
5.  **Calculate Derived Data:** Compute relevant summary data points based on all available information (including any identified agentic logs). This data should be suitable for populating the final 'dataSummary' field later (e.g., updated daily calorie total, exercise minutes).
6.  **Output JSON:** Respond ONLY with a JSON object matching the ReasoningOutput interface: { insights: string, suggestions?: string[], warnings?: string[], derivedData?: Record<string, any>, agenticLogsToCreate?: (FoodLog | ExerciseLog)[] }.
    - Populate \`insights\`, \`suggestions\`, \`warnings\` based on your analysis.
    - Populate \`agenticLogsToCreate\` with an array of fully structured FoodLog or ExerciseLog objects if any were identified in Task 4. Ensure required fields (like name, calories/duration, type) are estimated reasonably based on the query and factual info. Omit this field if no logs should be created.
    - Populate \`derivedData\` with key summary data points from Task 5.

Example Scenario:
- Query: "I ate an apple for a snack, was that okay?"
- Factual Info: "A medium apple has about 95 calories..."
- Profile: Moderately active male, 30yo.
- Goals: Weight loss (target 2000 kcal/day).
- Time: Midday.
- Daily Logs: Show 1200 kcal consumed so far.
- Output: {
    "insights": "An apple is a good low-calorie snack choice. Adding the apple (approx 95 kcal), your estimated intake today is 1295 kcal, leaving you with about 705 kcal for your 2000 kcal goal.",
    "suggestions": ["Pairing it with protein like nuts could improve satiety."],
    "derivedData": { "itemCalories": 95, "estimatedDailyCalories": 1295, "remainingCalories": 705 },
    "agenticLogsToCreate": [
      { "name": "Apple", "calories": 95, "mealType": "Snack", "source": "ai-logging" /* other required fields filled */ }
    ]
  }

Focus on relevance, personalization, daily context, actionable advice, and accurate JSON output. Be concise.`;

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
 * @returns A ReasoningOutput object or null if an error occurs.
 */
export async function generatePersonalizedInsights(
  query: string,
  factualInfo: FactualInformation,
  userProfile: UserProfile | null,
  timeContext: string, // e.g., "Morning", "Midday", "Evening"
  dailyFoodLogs: FoodLog[],
  dailyExerciseLogs: ExerciseLog[],
  dailyInteractionLogs: InteractionLog[]
): Promise<ReasoningOutput | null> {
  console.log(`Reasoning Layer: Generating insights for query: "${query}"`);

  // Construct the prompt for the LLM
  const userMessageContent = `
User Query: ${query}
Factual Information: ${JSON.stringify(factualInfo)}
User Profile: ${JSON.stringify(userProfile)}
User Goals: (Now part of User Profile) ${JSON.stringify(userProfile?.goal)}
Time Context: ${timeContext}
Daily Food Logs: ${JSON.stringify(dailyFoodLogs)}
Daily Exercise Logs: ${JSON.stringify(dailyExerciseLogs)}
Daily Interaction Logs: ${JSON.stringify(dailyInteractionLogs)}

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
      // --- Start Agentic Logging ---
      if (parsedOutput.agenticLogsToCreate && Array.isArray(parsedOutput.agenticLogsToCreate) && userProfile?.id) {
        const currentUserId = userProfile.id; // Get userId for logging
        const logPromises = parsedOutput.agenticLogsToCreate.map(log => {
          // Add common fields
          const baseLog = {
            ...log,
            userId: currentUserId,
            loggedAt: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
            source: 'ai-logging' as const // Explicitly set source
          };

          // Check if it's a FoodLog (e.g., by checking for mealType)
          if ('mealType' in baseLog) {
            // Ensure required fields for FoodLog are present (or handled in saveFoodLog)
            return saveFoodLog(baseLog as FoodLog);
          }
          // Check if it's an ExerciseLog (e.g., by checking for type)
          else if ('type' in baseLog && ('duration' in baseLog || 'caloriesBurned' in baseLog)) {
             // Ensure required fields for ExerciseLog are present
            return saveExerciseLog(baseLog as ExerciseLog);
          } else {
            console.warn("Agentic log object doesn't match known types:", log);
            return Promise.resolve(); // Return resolved promise for unknown types
          }
        });

        // Run saves concurrently but don't block the response
        Promise.allSettled(logPromises).then(results => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.error(`Error saving agentic log #${index}:`, result.reason);
            } else {
               console.log(`Agentic log #${index} processed.`);
            }
          });
        });
      }
      // --- End Agentic Logging ---

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
