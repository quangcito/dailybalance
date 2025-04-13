import { queryPerplexity, PerplexityQueryResult } from './perplexity'; // Import the new result type
import { Source } from '@/types/conversation'; // Import Source type

/**
 * Defines the output structure of the Knowledge Layer, including factual content and sources.
 */
export interface KnowledgeLayerOutput {
  content: string | null; // Keep content flexible for now (string or structured)
  sources: Source[];
}

const KNOWLEDGE_LAYER_SYSTEM_PROMPT = `You are a factual information retrieval assistant specializing in health, nutrition, and exercise. Provide concise, accurate information based on the user's query. Focus on verifiable facts, definitions, nutritional data (calories, macros, vitamins), exercise details (muscles worked, typical duration, intensity), and general health concepts. Avoid opinions, personal advice, or conversational filler. If the query is ambiguous or outside your domain, state that clearly.`;

/**
 * Retrieves factual information relevant to a user's query using the Perplexity API.
 * This acts as the Knowledge Layer in the LLM orchestration.
 *
 * @param query - The user's query string.
 * @returns A string containing factual information, structured data, or null if an error occurs or no relevant info is found.
 */
export async function getFactualInformation(query: string): Promise<KnowledgeLayerOutput> {
  console.log(`Knowledge Layer: Retrieving factual info for query: "${query}"`);

  try {
    const result: PerplexityQueryResult | null = await queryPerplexity(query, KNOWLEDGE_LAYER_SYSTEM_PROMPT);

    if (result === null || result.content === null) {
      console.error('Knowledge Layer: Failed to get valid response from Perplexity.');
      return { content: null, sources: [] }; // Return empty structure on failure
    }

    // TODO: Potential post-processing of the Perplexity response.
    // - Could attempt to parse structured data if Perplexity returns JSON.
    // - Could validate or filter the information.
    // For now, return the raw string content.
    console.log(`Knowledge Layer: Received response from Perplexity.`);
    return { content: result.content, sources: result.sources };

  } catch (error) {
    console.error('Knowledge Layer: Unexpected error retrieving factual information:', error);
    return { content: null, sources: [] }; // Return empty structure on error
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
