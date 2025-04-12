import { queryPerplexity } from './perplexity.js';

// Define a specific type for the output of this layer, if needed.
// For now, we'll assume it returns a string or structured data based on Perplexity's response.
export type FactualInformation = string | Record<string, any> | null;

const KNOWLEDGE_LAYER_SYSTEM_PROMPT = `You are a factual information retrieval assistant specializing in health, nutrition, and exercise. Provide concise, accurate information based on the user's query. Focus on verifiable facts, definitions, nutritional data (calories, macros, vitamins), exercise details (muscles worked, typical duration, intensity), and general health concepts. Avoid opinions, personal advice, or conversational filler. If the query is ambiguous or outside your domain, state that clearly.`;

/**
 * Retrieves factual information relevant to a user's query using the Perplexity API.
 * This acts as the Knowledge Layer in the LLM orchestration.
 *
 * @param query - The user's query string.
 * @returns A string containing factual information, structured data, or null if an error occurs or no relevant info is found.
 */
export async function getFactualInformation(query: string): Promise<FactualInformation> {
  console.log(`Knowledge Layer: Retrieving factual info for query: "${query}"`);

  try {
    const result = await queryPerplexity(query, KNOWLEDGE_LAYER_SYSTEM_PROMPT);

    if (result === null) {
      console.error('Knowledge Layer: Failed to get response from Perplexity.');
      return null;
    }

    // TODO: Potential post-processing of the Perplexity response.
    // - Could attempt to parse structured data if Perplexity returns JSON.
    // - Could validate or filter the information.
    // For now, return the raw string content.
    console.log(`Knowledge Layer: Received response from Perplexity.`);
    return result;

  } catch (error) {
    console.error('Knowledge Layer: Unexpected error retrieving factual information:', error);
    return null;
  }
}

// Example usage (can be removed or kept for testing)
/*
async function testKnowledgeLayer() {
  const info = await getFactualInformation("How many calories in a medium banana?");
  console.log("Knowledge Layer Result:", info);

  const exerciseInfo = await getFactualInformation("What muscles do push-ups work?");
  console.log("Knowledge Layer Result:", exerciseInfo);
}
testKnowledgeLayer();
*/
