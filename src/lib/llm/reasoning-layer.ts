import OpenAI from 'openai';
import { UserProfile, InteractionLog } from '@/types/user'; // Added InteractionLog
import { FoodLog } from '@/types/nutrition';
import { ExerciseLog } from '@/types/exercise';
import { FactualInformation } from './knowledge-layer.js';

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
  /** Any data points derived during reasoning. */
  derivedData?: Record<string, any>;
  error?: string; // If an error occurred during reasoning
}

const REASONING_LAYER_SYSTEM_PROMPT = `You are the Reasoning Layer of the DailyBalance Answer Engine. Your role is to synthesize factual information with user-specific context (profile, goals, time of day, and logs for the target date) to generate personalized insights and preliminary recommendations related to nutrition and exercise balance.

Inputs Provided:
1.  User Query: The original question asked by the user.
2.  Factual Information: Data retrieved by the Knowledge Layer (e.g., nutritional info, exercise details).
3.  User Profile: Details like age, gender, height, weight, activity level, calculated BMR/TDEE.
4.  User Goals: (Now part of User Profile) Active health/fitness goals.
5.  Time Context: The current time context (e.g., "Morning", "Midday", "Evening").
6.  Daily Food Logs: Food consumed by the user on the target date.
7.  Daily Exercise Logs: Exercises performed by the user on the target date.
8.  Daily Interaction Logs: Previous questions/answers from the user on the target date.

Your Task:
Your Task:
- Analyze the Factual Information in light of the User Profile, Goals, Time Context, AND the Daily Logs for the target date.
- Consider the user's progress towards goals based on the daily logs (e.g., calories consumed vs. TDEE, exercise performed).
- Identify relevant connections, implications, or discrepancies between the query, factual info, user context, and daily activity.
- Generate concise, personalized insights. What does this information *mean* for *this specific user* considering their activity *today*?
- Formulate preliminary, actionable suggestions based on the daily context (e.g., "Based on your lunch log, consider a lighter dinner," "You haven't logged exercise yet today, maybe a walk?").
- Highlight potential warnings or nutritional/exercise gaps based on the synthesis of all inputs.
- Output ONLY a JSON object matching the ReasoningOutput interface: { insights: string, suggestions?: string[], warnings?: string[], derivedData?: Record<string, any> }. Do not include any other text or explanations outside the JSON structure.

Example Scenario:
- Query: "calories in an apple"
- Factual Info: "A medium apple has about 95 calories..."
- Profile: Moderately active male, 30yo.
- Goals: Weight loss (target 2000 kcal/day).
- Time: Midday.
- Output: { "insights": "An apple is a low-calorie snack option. Based on your logs today, you have X calories remaining towards your goal.", "suggestions": ["Pair it with some protein like nuts or yogurt for better satiety."], "derivedData": { "itemCalories": 95, "remainingCalories": X } } // Example derived data

Focus on relevance, personalization, daily context, and actionable advice. Be concise.`;

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
