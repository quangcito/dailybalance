// Basic client for interacting with the Perplexity API

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
  // Add error field if applicable
}


/**
 * Queries the Perplexity API (specifically Sonar models recommended for factual retrieval).
 *
 * @param query - The user's query string.
 * @param systemPrompt - Optional system prompt to guide the model.
 * @returns The content of the assistant's response or null if an error occurs.
 */
export async function queryPerplexity(query: string, systemPrompt?: string): Promise<string | null> {
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

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      console.error('Perplexity API response did not contain expected choices structure:', data);
      return null;
    }

  } catch (error) {
    console.error('Error querying Perplexity API:', error);
    return null;
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
