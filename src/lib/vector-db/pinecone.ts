import { Pinecone } from '@pinecone-database/pinecone';
// TODO: Define types for conversation turns/memory entries if not already defined elsewhere

// Ensure environment variables are set
const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeIndexName = process.env.PINECONE_INDEX_NAME;

if (!pineconeApiKey) {
  throw new Error('Missing Pinecone API Key in environment variables.');
}
if (!pineconeIndexName) {
  throw new Error('Missing Pinecone Index Name in environment variables.');
}

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: pineconeApiKey,
});

// Get a reference to the index
// Note: Ensure the index exists and is configured with the correct dimension
// for the embeddings you plan to use.
const index = pinecone.index(pineconeIndexName);

/**
 * Retrieves relevant conversation history for a given session.
 * This is a placeholder and needs implementation details:
 * - How to query based on session ID? (e.g., using metadata filters)
 * - How many turns to retrieve?
 * - How to handle embeddings for similarity search if needed?
 *
 * @param sessionId - The ID of the conversation session.
 * @param k - The number of recent turns to retrieve (optional).
 * @returns An array of conversation turns (placeholder type).
 */
export async function getConversationHistory(sessionId: string, k: number = 10): Promise<any[]> {
  console.log(`Placeholder: Fetching last ${k} turns for session ${sessionId} from Pinecone index ${pineconeIndexName}`);
  // TODO: Implement actual Pinecone query logic
  // Example structure might involve querying by metadata filter on sessionId
  // and potentially sorting by timestamp or using vector similarity if applicable.
  /*
  const queryResponse = await index.query({
    // vector: [ ... ], // Optional: If searching by similarity
    filter: { sessionId: { $eq: sessionId } },
    topK: k,
    includeMetadata: true,
  });
  return queryResponse.matches.map(match => match.metadata); // Adjust based on stored structure
  */
  return []; // Placeholder return
}

import { InteractionLog } from '@/types/user'; // Import InteractionLog type
import { generateEmbedding } from '../utils/embeddings'; // Import embedding utility
import { PineconeRecord } from '@pinecone-database/pinecone'; // Import PineconeRecord type

/**
 * Saves an interaction log (including query and response) with its embedding to Pinecone.
 *
 * @param logEntry - The InteractionLog object to save.
 */
export async function saveInteractionLogEmbedding(logEntry: InteractionLog): Promise<void> {
  console.log(`Saving interaction log embedding to Pinecone index ${pineconeIndexName} for session ${logEntry.sessionId}`);

  // 1. Prepare text for embedding (handle potentially undefined llmResponse)
  const responseText = logEntry.llmResponse?.text ?? ''; // Default to empty string if undefined
  const textToEmbed = `User Query: ${logEntry.query}\nAssistant Response: ${responseText}`;

  // 2. Generate embedding
  const embedding = await generateEmbedding(textToEmbed);

  if (!embedding) {
    console.error(`Failed to generate embedding for interaction log. Skipping Pinecone upsert.`);
    return;
  }

  // 3. Prepare the vector object for upsert
  // Ensure metadata values are suitable for Pinecone (strings, numbers, booleans, or lists of strings)
  // Pinecone doesn't store nested objects well directly in top-level metadata.
  // We store the essential parts and maybe stringify complex objects if needed,
  // but retrieving the full log from the Supabase table might be better if complex data is needed later.
  // Use a type assertion for metadata to satisfy Pinecone's expected type and help with key access
  const metadata: Record<string, string | number | boolean | string[] | undefined> = {
    userId: logEntry.userId,
    sessionId: logEntry.sessionId,
    timestamp: logEntry.timestamp, // ISO string format
    query: logEntry.query,
    responseText: logEntry.llmResponse?.text ?? '', // Use default value
    // Stringify dataSummary if it exists and is complex, or handle specific fields
    dataSummary: logEntry.llmResponse?.dataSummary ? JSON.stringify(logEntry.llmResponse.dataSummary) : undefined,
    // Add other simple metadata if needed
  };

  // Remove undefined keys from metadata - More type-safe approach
  Object.keys(metadata).forEach((key) => {
    if (metadata[key] === undefined) {
      delete metadata[key];
    }

  });

  const vector: PineconeRecord<Record<string, any>> = {
    // Create a unique ID, e.g., combining sessionId and timestamp or using a UUID if available
    id: `${logEntry.sessionId}-${new Date(logEntry.timestamp).getTime()}-${Math.random().toString(36).substring(2, 7)}`, // Add randomness for potential timestamp collisions
    values: embedding,
    metadata: metadata
  };

  // 4. Upsert the vector
  try {
    await index.upsert([vector]);
    console.log(`Successfully upserted interaction log embedding for session ${logEntry.sessionId}`);
  } catch (error) {
    console.error(`Error upserting interaction log embedding to Pinecone:`, error);
    // Decide how to handle the error (e.g., retry, log, throw)
  }
}

/**
 * Searches for relevant interaction logs based on embedding similarity.
 *
 * @param userId The ID of the user whose logs to search.
 * @param queryEmbedding The vector embedding of the user's query.
 * @param count The maximum number of similar logs to retrieve.
 * @returns An array of relevant InteractionLog metadata objects (or simplified versions).
 */
export async function searchInteractionLogs(userId: string, queryEmbedding: number[], count: number): Promise<any[]> {
  console.log(`[searchInteractionLogs] Searching for ${count} relevant interactions for user ${userId}`);
   if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn("[searchInteractionLogs] Query embedding is empty. Skipping search.");
    return [];
  }

  try {
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: count,
      includeMetadata: true,
      // Filter by userId - ensure 'userId' is stored in metadata
      filter: { userId: { $eq: userId } },
    });

    console.log(`[searchInteractionLogs] Found ${queryResponse.matches?.length ?? 0} potentially relevant interactions.`);

    // Map results to return metadata, potentially parsing stringified JSON
    return queryResponse.matches?.map(match => {
      const metadata = match.metadata || {};
      // Attempt to parse dataSummary if it exists and is a string
      if (metadata.dataSummary && typeof metadata.dataSummary === 'string') {
        try {
          metadata.dataSummary = JSON.parse(metadata.dataSummary);
        } catch (e) {
          console.error("Failed to parse dataSummary from Pinecone metadata:", e);
          // Keep the stringified version or handle error as needed
        }
      }
      return metadata;
    }) || [];

  } catch (error) {
    console.error('[searchInteractionLogs] Error performing vector search on Pinecone:', error);
    return [];
  }
}

// Export the index instance if needed directly, though functions are preferred
export default index;
