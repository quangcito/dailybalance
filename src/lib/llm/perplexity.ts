// Basic client for interacting with the Perplexity API

import { Source } from '@/types/conversation'; // Import the Source type

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions'; // Standard endpoint

// Ensure environment variables are set
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

if (!perplexityApiKey) {
  throw new Error('Missing Perplexity API Key (PERPLEXITY_API_KEY) in environment variables.');
}

interface PerplexityRequestPayload {
  model: string;
  messages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[];
  // Add other parameters like temperature, max_tokens etc. if needed
}

interface PerplexityResponseChoice {
  index: number;
  finish_reason: string;
  message: {
    role: 'assistant';
    content: string;
  };
  delta?: { // For streaming
    role?: 'assistant';
    content?: string;
  };
}

interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: PerplexityResponseChoice[];
  // Correct field based on observed API response
  citations?: string[]; // Array of source URLs
  // Add error field if applicable
}


/**
 * Result structure from the Perplexity query, including content and potential sources.
 */
export interface PerplexityQueryResult {
  content: string | null;
  sources: Source[];
}

/**
 * Queries the Perplexity API (specifically Sonar models recommended for factual retrieval).
 *
 * @param query - The user's query string.
 * @param systemPrompt - Optional system prompt to guide the model.
 * @returns An object containing the assistant's response content and any sources, or null if an error occurs.
 */
export async function queryPerplexity(query: string, systemPrompt?: string): Promise<PerplexityQueryResult | null> {
  const messages: PerplexityRequestPayload['messages'] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: query });

  const payload: PerplexityRequestPayload = {
    // Using sonar-small-online as recommended for speed and web access in Knowledge Layer
    model: 'sonar',
    messages: messages,
  };

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Perplexity API request failed with status ${response.status}: ${errorBody}`);
      return null;
    }

    const data: PerplexityResponse = await response.json();
    console.log("--- Raw Perplexity API Response Data ---"); // ADDED LOG
    console.log(JSON.stringify(data, null, 2)); // ADDED LOG
    console.log("---------------------------------------"); // ADDED LOG

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      const content = data.choices[0].message.content;
      // Extract citations (URLs) and map them to Source objects
      const sourceUrls = data.citations || [];
      const sources: Source[] = sourceUrls.map(url => ({
        url: url,
        title: url, // Use URL as title since only URL is provided
        snippet: undefined // No snippet provided by this API field
      }));
      return { content, sources };
    } else {
      console.error('Perplexity API response did not contain expected choices structure:', data);
      return null; // Return null for the entire result if structure is wrong
    }

  } catch (error) {
    console.error('Error querying Perplexity API:', error);
    return null; // Return null for the entire result on error
  }
}

// Example usage (can be removed or kept for testing)
/*
async function test() {
  const result = await queryPerplexity("What are the health benefits of spinach?");
  console.log("Perplexity Result:", result);
}
test();
*/
