import OpenAI from 'openai';
import { UserProfile, UserGoal } from '@/types/user';
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

const REASONING_LAYER_SYSTEM_PROMPT = `You are the Reasoning Layer of the DailyBalance Answer Engine. Your role is to synthesize factual information with user-specific context (profile, goals, time of day) to generate personalized insights and preliminary recommendations related to nutrition and exercise balance.

Inputs Provided:
1.  User Query: The original question asked by the user.
2.  Factual Information: Data retrieved by the Knowledge Layer (e.g., nutritional info, exercise details).
3.  User Profile: Details like age, sex, height, weight, activity level.
4.  User Goals: Active health/fitness goals (e.g., weight loss, calorie target, exercise frequency).
5.  Time Context: The current time context (e.g., "Morning", "Midday", "Evening").

Your Task:
- Analyze the Factual Information in light of the User Profile, Goals, and Time Context.
- Identify relevant connections, implications, or discrepancies.
- Generate concise, personalized insights. What does this information *mean* for *this specific user* right *now*?
- Formulate preliminary, actionable suggestions (e.g., "Consider adding protein to your next meal," "A short walk might fit well this afternoon").
- Highlight potential warnings or nutritional/exercise gaps based on the synthesis.
- Output ONLY a JSON object matching the ReasoningOutput interface: { insights: string, suggestions?: string[], warnings?: string[], derivedData?: Record<string, any> }. Do not include any other text or explanations outside the JSON structure.

Example Scenario:
- Query: "calories in an apple"
- Factual Info: "A medium apple has about 95 calories..."
- Profile: Moderately active male, 30yo.
- Goals: Weight loss (target 2000 kcal/day).
- Time: Midday.
- Output: { "insights": "An apple is a low-calorie snack option that fits well within your daily target.", "suggestions": ["Pair it with some protein like nuts or yogurt for better satiety."], "derivedData": { "itemCalories": 95 } }

Focus on relevance, personalization, and actionable advice. Be concise.`;

/**
 * Generates personalized insights by synthesizing factual information with user context.
 *
 * @param query - The original user query.
 * @param factualInfo - Information from the Knowledge Layer.
 * @param userProfile - The user's profile data.
 * @param userGoals - The user's active goals.
 * @param timeContext - Current time context (e.g., "Morning", "Midday").
 * @returns A ReasoningOutput object or null if an error occurs.
 */
export async function generatePersonalizedInsights(
  query: string,
  factualInfo: FactualInformation,
  userProfile: UserProfile | null,
  userGoals: UserGoal[],
  timeContext: string // e.g., "Morning", "Midday", "Evening"
): Promise<ReasoningOutput | null> {
  console.log(`Reasoning Layer: Generating insights for query: "${query}"`);

  // Construct the prompt for the LLM
  const userMessageContent = `
User Query: ${query}
Factual Information: ${JSON.stringify(factualInfo)}
User Profile: ${JSON.stringify(userProfile)}
User Goals: ${JSON.stringify(userGoals)}
Time Context: ${timeContext}

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
