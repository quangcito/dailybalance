import OpenAI from 'openai';
import { getConversationHistory, saveConversationTurn } from '../vector-db/pinecone';
import { ReasoningOutput } from './reasoning-layer';
import { StructuredAnswer } from '@/types/conversation';

// Ensure environment variables are set
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error('Missing OpenAI API Key (OPENAI_API_KEY) in environment variables.');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const CONVERSATION_LAYER_SYSTEM_PROMPT = `You are the Conversation Layer of the DailyBalance Answer Engine. Your goal is to refine the preliminary insights and suggestions from the Reasoning Layer into a final, natural, and helpful response for the user, incorporating relevant conversation history.

Inputs Provided:
1.  User Query: The most recent question from the user.
2.  Reasoning Output: A JSON object containing { insights: string, suggestions?: string[], warnings?: string[], derivedData?: Record<string, any> } from the previous layer.
3.  Conversation History: Recent turns from the current session (user queries and assistant responses).

Your Task:
- Review the Reasoning Output and the Conversation History.
- Synthesize these inputs into a coherent, user-friendly, and contextually relevant response.
- Address the user's query directly, using the insights provided.
- Naturally weave in suggestions and warnings from the Reasoning Output where appropriate.
- Maintain a helpful and encouraging tone suitable for a health and wellness assistant.
- Output ONLY a JSON object matching the StructuredAnswer interface: { text: string, suggestions?: string[], dataSummary?: Record<string, any> }. Do not include any other text or explanations outside the JSON structure. Ensure the 'text' field contains the main conversational response. Populate 'suggestions' if relevant suggestions were generated. Use 'dataSummary' for any key data points from the reasoning layer if appropriate to include directly.

Example:
- Reasoning Output: { "insights": "An apple fits your calorie goals.", "suggestions": ["Pair with protein."] }
- History: [...]
- Output: { "text": "An apple is a great low-calorie choice that fits well with your 2000 kcal goal! To make it more satisfying, consider pairing it with a protein source like a handful of nuts or some yogurt.", "suggestions": ["Pair apple with protein (nuts, yogurt)"], "dataSummary": { "itemCalories": 95 } } // Assuming dataSummary was in reasoningOutput

Focus on clarity, helpfulness, and maintaining conversational flow.`;

/**
 * Generates the final structured answer by refining reasoning output
 * and incorporating conversation history.
 *
 * @param userId - The ID of the user.
 * @param sessionId - The ID of the current conversation session.
 * @param query - The user's current query.
 * @param reasoningOutput - The output from the Reasoning Layer.
 * @returns A StructuredAnswer object or a default error object.
 */
export async function generateFinalResponse(
  userId: string,
  sessionId: string,
  query: string,
  reasoningOutput: ReasoningOutput | null
): Promise<StructuredAnswer> {
  console.log(`Conversation Layer: Generating final response for query: "${query}"`);

  if (!reasoningOutput || reasoningOutput.error) {
    console.error('Conversation Layer: Received error or null output from Reasoning Layer.');
    return {
      text: "I encountered an issue while processing your request. Please try again.",
      error: reasoningOutput?.error || "Reasoning layer failed.",
    };
  }

  // 1. Fetch conversation history (non-blocking for the main response generation)
  let history: any[] = [];
  try {
    // Limit history length to avoid excessive token usage
    history = await getConversationHistory(sessionId, 5); // Get last 5 turns
    console.log(`Conversation Layer: Fetched ${history.length} turns from history.`);
  } catch (histError) {
    console.error('Conversation Layer: Failed to fetch conversation history:', histError);
    // Proceed without history, but log the error
  }

  // 2. Construct the prompt for the final LLM call
  const userMessageContent = `
User Query: ${query}
Reasoning Output: ${JSON.stringify(reasoningOutput)}
Conversation History: ${JSON.stringify(history)}

Generate the final JSON output (StructuredAnswer) based on these inputs.
`;

  try {
    // 3. Call OpenAI API (GPT-4o-mini)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // As specified in product context
      messages: [
        { role: 'system', content: CONVERSATION_LAYER_SYSTEM_PROMPT },
        { role: 'user', content: userMessageContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7, // Slightly higher temp for more natural language
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      console.error('Conversation Layer: No content received from OpenAI.');
      return { text: "Sorry, I couldn't generate a response.", error: 'No content from LLM.' };
    }

    // 4. Parse the response
    let finalAnswer: StructuredAnswer;
    try {
      finalAnswer = JSON.parse(responseContent);
      console.log('Conversation Layer: Successfully generated final response.');
    } catch (parseError) {
      console.error('Conversation Layer: Failed to parse JSON response from OpenAI:', parseError);
      console.error('Raw response content:', responseContent);
      return { text: "Sorry, I had trouble formatting the response.", error: 'Failed to parse LLM response.' };
    }

    // 5. Save interaction to history (async, non-blocking)
    // We save the original query and the final structured answer
    const userTurn = { role: 'user', text: query, timestamp: new Date().toISOString() };
    const assistantTurn = { role: 'assistant', ...finalAnswer, timestamp: new Date().toISOString() }; // Spread the final answer

    Promise.all([
        saveConversationTurn(sessionId, userTurn),
        saveConversationTurn(sessionId, assistantTurn)
    ]).catch(saveError => {
        console.error('Conversation Layer: Failed to save conversation turn to history:', saveError);
        // Don't fail the response to the user if history saving fails
    });


    return finalAnswer;

  } catch (error) {
    console.error('Conversation Layer: Error calling OpenAI API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown OpenAI API error';
    return { text: "Sorry, an error occurred while contacting the AI service.", error: `OpenAI API Error: ${errorMessage}` };
  }
}
