import { OpenAIEmbeddings } from "@langchain/openai";

// Ensure OPENAI_API_KEY is set in environment variables

const embeddingsModel = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  dimensions: 1536 // Explicitly set dimension to match Pinecone index
});

/**
 * Generates a vector embedding for the given text using OpenAI.
 * @param text The text to embed.
 * @returns A promise that resolves to an array of numbers (embedding) or null if an error occurs.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text) {
    console.warn("generateEmbedding received empty text.");
    return null;
  }
  try {
    // The dimensions parameter in the constructor should handle the output size.
    const embedding = await embeddingsModel.embedQuery(text);
    // Optional: Verify embedding length if needed
    // if (embedding && embedding.length !== 1536) {
    //   console.warn(`Generated embedding dimension (${embedding.length}) does not match expected 1536.`);
    //   // Handle mismatch if necessary
    // }
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}
