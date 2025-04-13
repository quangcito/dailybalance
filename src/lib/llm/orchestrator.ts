import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

import { getFactualInformation, FactualInformation } from './knowledge-layer.ts';
import { generatePersonalizedInsights, ReasoningOutput, AgenticLogIntent } from './reasoning-layer.ts'; // Import AgenticLogIntent
import { generateFinalResponse } from './conversation-layer.ts';
import { UserProfile, InteractionLog } from '@/types/user';
import { FoodLog } from '@/types/nutrition';
import { ExerciseLog } from '@/types/exercise';
import {
  getUserProfile,
  logInteraction,
  getDailyFoodLogs,
  getDailyExerciseLogs,
  getDailyInteractionLogs,
  searchFoodLogs, // NEW: Import vector search
  searchExerciseLogs, // NEW: Import vector search
  saveFoodLog, // NEW: Import save function
  saveExerciseLog, // NEW: Import save function
} from '../db/supabase'; // Import fetch and log functions
import { searchInteractionLogs } from '../vector-db/pinecone'; // NEW: Import vector search
import { calculateBMR, calculateTDEE } from '../utils/calculations'; // Import calculation functions
import { generateEmbedding } from '../utils/embeddings'; // NEW: Import embedding utility
import { enrichLogIntent } from '../log-enrichment'; // NEW: Import enrichment function

// TODO: Import functions to fetch user profile/goals if needed - DONE
// import { pineconeClient } from '../vector-db/pinecone';
// import { redisClient } from '../cache/redis';

// Define the state structure for the graph
export interface AgentState { // Add export keyword
  messages: BaseMessage[]; // Use BaseMessage to allow HumanMessage and AIMessage
  userId?: string; // Optional: Add if needed for context
  conversationId?: string; // Optional: Add if needed for context
  targetDate?: string; // NEW: Target date for context (YYYY-MM-DD)
  knowledgeResponse?: FactualInformation; // Use type from knowledge-layer
  reasoningResponse?: ReasoningOutput | null; // Use type from reasoning-layer
  structuredAnswer?: StructuredAnswer; // Final output
  current_step?: string; // To track the current node
  // Add fields for fetched user data
  userProfile?: UserProfile | null;
  // userGoals?: UserGoal[]; // Removed as goals are now part of UserProfile
  needsPersonalization?: boolean; // Flag from analysis step
  // Add fields for daily context logs
  dailyFoodLogs?: FoodLog[];
  dailyExerciseLogs?: ExerciseLog[];
  dailyInteractionLogs?: InteractionLog[];
  // Add fields for retrieved historical context
  historicalFoodLogs?: FoodLog[];
  historicalExerciseLogs?: ExerciseLog[];
  historicalInteractionLogs?: any[]; // Pinecone search returns metadata objects
  // NEW: State to hold fully enriched logs ready for saving
  enrichedAgenticLogs?: (Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'>)[];
  // Ensure calculatedDailyCalories state field is removed
}

// --- Define Nodes ---

// Node: Entry Point (e.g., process user input)
// Returns updates for specific channels
async function processInput(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Process Input ---");
  const lastMessage = state.messages[state.messages.length - 1];
  console.log("User Input:", lastMessage.content);
  // Clear previous responses for a new turn
  return {
    current_step: "processInput",
    knowledgeResponse: undefined,
    reasoningResponse: undefined,
    structuredAnswer: undefined,
    // Clear historical logs for new input
    historicalFoodLogs: [],
    historicalExerciseLogs: [],
    historicalInteractionLogs: [],
  };
}

// --- NEW NODE: Identify Target Date ---
async function identifyTargetDate(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Identify Target Date ---");
    const lastMessage = state.messages[state.messages.length - 1];
    const query = typeof lastMessage.content === 'string' ? lastMessage.content : "";

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    let targetDate = today; // Default to today

    try {
        // Use a simple LLM call to extract the date
        // Ensure OPENAI_API_KEY is set in environment
        const dateExtractionModel = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
        const prompt = `Today's date is ${today}. Analyze the following user query and extract the specific date the user is asking about. Respond ONLY with the date in YYYY-MM-DD format. If no specific date is mentioned or implied other than today, respond with "${today}". Query: "${query}"`;

        const response = await dateExtractionModel.invoke(prompt);
        const extractedDate = response.content.toString().trim();

        // Basic validation for YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(extractedDate)) {
            targetDate = extractedDate;
            console.log(`Extracted target date: ${targetDate}`);
        } else {
            console.log(`Could not extract a valid date, defaulting to today: ${today}`);
            targetDate = today; // Default to today if format is wrong
        }
    } catch (error) {
        console.error("Error during date extraction LLM call:", error);
        console.log(`Defaulting to today due to error: ${today}`);
        targetDate = today; // Default to today on error
    }

    return { current_step: "identifyTargetDate", targetDate };
}

// --- NEW NODE: Fetch Daily Context ---
async function fetchDailyContext(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Fetch Daily Context ---");
    const userId = state.userId;
    // Default to today if targetDate is somehow missing
    const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0];

    if (!userId) {
        console.log("No userId provided, skipping daily context fetch.");
        return {
            current_step: "fetchDailyContext",
            dailyFoodLogs: [],
            dailyExerciseLogs: [],
            dailyInteractionLogs: [],
        };
    }

    console.log(`Fetching daily logs for userId: ${userId}, date: ${targetDate}`);
    try {
        // Fetch all daily logs concurrently
        const [foodLogs, exerciseLogs, interactionLogs] = await Promise.all([
            getDailyFoodLogs(userId, targetDate),
            getDailyExerciseLogs(userId, targetDate),
            getDailyInteractionLogs(userId, targetDate),
        ]);

        console.log(`Fetched Food Logs: ${foodLogs.length}`);
        console.log(`Fetched Exercise Logs: ${exerciseLogs.length}`);
        console.log(`Fetched Interaction Logs: ${interactionLogs.length}`);

        return {
            current_step: "fetchDailyContext",
            dailyFoodLogs: foodLogs,
            dailyExerciseLogs: exerciseLogs,
            dailyInteractionLogs: interactionLogs,
        };
    } catch (error) {
        console.error("Error fetching daily context logs:", error);
        // Return empty arrays on error
        return {
            current_step: "fetchDailyContext",
            dailyFoodLogs: [],
            dailyExerciseLogs: [],
            dailyInteractionLogs: [],
        };
    }
}

// Ensure calculateDailyCaloriesNode function is removed


// --- NEW NODE: Analyze Query for Personalization ---
// Simple keyword-based check for now
async function analyzeQueryForPersonalization(state: AgentState): Promise<Partial<AgentState>> {
   console.log("--- Step: Analyze Query for Personalization ---");
   const lastMessage = state.messages[state.messages.length - 1];
   const query = typeof lastMessage.content === 'string' ? lastMessage.content.toLowerCase() : "";
   // Simple keyword check - refine later if needed
   const keywords = ["i ", " me ", " my ", "goal", "preference", "diet", "weight", "plan", "should i"];
   const needsPersonalization = keywords.some(keyword => query.includes(keyword));
   console.log("Needs Personalization:", needsPersonalization);
   return { current_step: "analyzeQueryForPersonalization", needsPersonalization };
}

// --- NEW NODE: Fetch User Data (Conditional) ---
async function fetchUserData(state: AgentState): Promise<Partial<AgentState>> {
   console.log("--- Step: Fetch User Data ---");
   if (!state.userId) {
       console.log("No userId provided, skipping user data fetch.");
       return { current_step: "fetchUserData", userProfile: null }; // Removed userGoals
   }
   console.log(`Fetching data for userId: ${state.userId}`);
   try {
       let profile = await getUserProfile(state.userId);
       // const goals = await getActiveUserGoals(state.userId); // Removed goal fetching
       console.log("Fetched Profile:", profile ? 'Yes' : 'No');
       // console.log("Fetched Goals:", goals.length); // Removed goal logging

       // Calculate BMR and TDEE if profile exists
       if (profile) {
           const bmr = calculateBMR(profile);
           const tdee = calculateTDEE(bmr, profile.activityLevel);
           // Assign undefined if calculation resulted in null to match UserProfile type
           profile = { ...profile, bmr: bmr ?? undefined, tdee: tdee ?? undefined };
           console.log("Calculated BMR:", bmr);
           console.log("Calculated TDEE:", tdee);
       }

       return { current_step: "fetchUserData", userProfile: profile }; // Removed userGoals
   } catch (error) {
       console.error("Error fetching user data:", error);
       return { current_step: "fetchUserData", userProfile: null }; // Return defaults on error, removed userGoals
   }
}

// --- NEW NODE: Retrieve Historical Context ---
async function retrieveHistoricalContext(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Retrieve Historical Context ---");
  const userId = state.userId;
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage?.content === 'string' ? lastMessage.content : "";
  const HISTORICAL_COUNT = 5; // Number of historical logs to retrieve

  if (!userId) {
    console.log("No userId provided, skipping historical context retrieval.");
    return {
      current_step: "retrieveHistoricalContext",
      historicalFoodLogs: [],
      historicalExerciseLogs: [],
      historicalInteractionLogs: [],
    };
  }
  if (!query) {
     console.log("No query text found, skipping historical context retrieval.");
     return {
      current_step: "retrieveHistoricalContext",
      historicalFoodLogs: [],
      historicalExerciseLogs: [],
      historicalInteractionLogs: [],
    };
  }

  // 1. Generate embedding for the current query
  const queryEmbedding = await generateEmbedding(query);

  if (!queryEmbedding) {
    console.error("Failed to generate query embedding, skipping historical context retrieval.");
     return {
      current_step: "retrieveHistoricalContext",
      historicalFoodLogs: [],
      historicalExerciseLogs: [],
      historicalInteractionLogs: [],
    };
  }

  // 2. Perform vector searches concurrently
  try {
    console.log(`Searching historical logs for user ${userId} with query embedding.`);
    const [foodResults, exerciseResults, interactionResults] = await Promise.all([
      searchFoodLogs(userId, queryEmbedding, HISTORICAL_COUNT),
      searchExerciseLogs(userId, queryEmbedding, HISTORICAL_COUNT),
      searchInteractionLogs(userId, queryEmbedding, HISTORICAL_COUNT)
    ]);

    console.log(`Retrieved historical logs - Food: ${foodResults.length}, Exercise: ${exerciseResults.length}, Interactions: ${interactionResults.length}`);

    return {
      current_step: "retrieveHistoricalContext",
      historicalFoodLogs: foodResults,
      historicalExerciseLogs: exerciseResults,
      historicalInteractionLogs: interactionResults, // Contains metadata objects
    };
  } catch (error) {
     console.error("Error during historical context retrieval:", error);
     return {
      current_step: "retrieveHistoricalContext",
      historicalFoodLogs: [],
      historicalExerciseLogs: [],
      historicalInteractionLogs: [],
    };
  }
}

// Node: Knowledge Layer
// Returns updates for specific channels
async function runKnowledgeLayer(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Knowledge Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content); // Handle potential non-string content

  const knowledgeResponse = await getFactualInformation(query);

  console.log("Knowledge Response:", knowledgeResponse);
  return { current_step: "runKnowledgeLayer", knowledgeResponse };
}

// Node: Reasoning Layer
// Returns updates for specific channels
async function runReasoningLayer(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Reasoning Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
  const knowledgeInfo = state.knowledgeResponse;
  const userId = state.userId;

  // UserProfile and UserGoals are now potentially populated in the state
  const userProfile = state.userProfile ?? null;
  // const userGoals = state.userGoals ?? []; // Goals are now in userProfile
  // TODO: Determine actual time context (e.g., based on server time or user input) - This is different from targetDate
  const timeContext = "Midday"; // Placeholder for time-of-day context
  const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0]; // Use identified date or default
  // Get daily and historical logs from state
  const dailyFoodLogs = state.dailyFoodLogs ?? [];
  const dailyExerciseLogs = state.dailyExerciseLogs ?? [];
  const dailyInteractionLogs = state.dailyInteractionLogs ?? [];
  const historicalFoodLogs = state.historicalFoodLogs ?? [];
  const historicalExerciseLogs = state.historicalExerciseLogs ?? [];
  const historicalInteractionLogs = state.historicalInteractionLogs ?? [];

  if (!knowledgeInfo) {
      console.warn("Reasoning Layer: Knowledge information is missing.");
      // Decide how to handle missing info - return error, default response, etc.
      return { current_step: "runReasoningLayer", reasoningResponse: { insights: "Could not retrieve factual information.", error: "Missing knowledge data." } };
  }

  const reasoningResponse = await generatePersonalizedInsights(
      query,
      knowledgeInfo,
      userProfile,
      timeContext,
      dailyFoodLogs, // Pass daily logs from state
      dailyExerciseLogs,
      dailyInteractionLogs,
      // NEW: Pass historical logs
      historicalFoodLogs,
      historicalExerciseLogs,
      historicalInteractionLogs
  );


  console.log("Reasoning Response:", reasoningResponse);
  return { current_step: "runReasoningLayer", reasoningResponse };
}

// Node: Conversation Layer
// Returns updates for specific channels
async function runConversationLayer(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Conversation Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
  // Ensure reasoningOutput is explicitly null if undefined, matching generateFinalResponse signature
  const reasoningOutput = state.reasoningResponse ?? null; // This is now ReasoningOutput | null
  const userId = state.userId || "unknown-user"; // Provide default if needed
  const conversationId = state.conversationId || `temp-${Date.now()}`; // Provide default if needed
  const tdee = state.userProfile?.tdee; // Get TDEE from profile if available
  const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0]; // Get target date

  // --- Calculate current daily calories ---
  let currentDailyCalories = 0;
  try {
      // Fetch the LATEST logs for the day, including any just saved
      const currentFoodLogs = await getDailyFoodLogs(userId, targetDate);
      if (currentFoodLogs.length > 0) {
          currentDailyCalories = currentFoodLogs.reduce((sum, log) => sum + (log.calories || 0), 0);
      }
      console.log(`[Conversation Layer] Recalculated daily calories: ${currentDailyCalories}`);
  } catch (fetchError) {
       console.error("[Conversation Layer] Error fetching latest food logs for calorie calculation:", fetchError);
       // Proceed with 0 or potentially stale data if needed, or handle error
  }
  // --- End calorie calculation ---


  // --- Prepare data for Conversation Layer ---
  // Start with reasoning output, but override calorie data with fresh calculation
  // Ensure insights has a default value if reasoningOutput is null
  const finalReasoningData: ReasoningOutput = {
      insights: reasoningOutput?.insights ?? '', // Provide default empty string for insights
      suggestions: reasoningOutput?.suggestions,
      warnings: reasoningOutput?.warnings,
      agenticLogIntents: reasoningOutput?.agenticLogIntents,
      error: reasoningOutput?.error,
      derivedData: {
          ...(reasoningOutput?.derivedData ?? {}), // Keep other derived data
          dailyCaloriesConsumed: currentDailyCalories, // Override with fresh calculation
          userTDEE: tdee, // Ensure TDEE is included
          remainingCalories: tdee !== undefined ? tdee - currentDailyCalories : undefined, // Recalculate remaining
      }
  };

  // Call the actual conversation layer function, passing the *updated* reasoning data and calorie info
  const finalResponse = await generateFinalResponse(
      userId,
      conversationId,
      query,
      finalReasoningData, // Pass the potentially modified reasoning output
      currentDailyCalories, // Pass newly calculated daily calories separately as well
      tdee                  // Pass user's TDEE separately as well
  );

  console.log("Final Response:", finalResponse);

  // Append the final AI message to the list, store the structured answer itself
  const finalAiMessage = new AIMessage({ content: finalResponse.text }); // Use text for message history

  // --- Log the interaction ---
  try {
    const interactionLogEntry: InteractionLog = {
      userId: userId,
      sessionId: conversationId, // Use conversationId as sessionId
      timestamp: new Date().toISOString(),
      query: query,
      llmResponse: finalResponse, // Store the full structured answer
      // userFeedback: undefined, // Not captured here
      // metadata: undefined, // Add if needed
    };
    await logInteraction(interactionLogEntry);
    console.log("Interaction logged successfully.");
  } catch (logError) {
    console.error("Failed to log interaction:", logError);
    // Decide if this error should halt execution or just be logged
  }
  // --- End Logging ---
  // Moved enrichAgenticLogIntents function definition below

  return {
      current_step: "runConversationLayer",
      structuredAnswer: finalResponse, // Store the full structured answer in the state
      messages: [...state.messages, finalAiMessage], // Add AI response text to messages
  };
}

// --- NEW NODE: Enrich Agentic Log Intents ---
// Moved function definition to top level
async function enrichAgenticLogIntents(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Enrich Agentic Log Intents ---");
    const intents = state.reasoningResponse?.agenticLogIntents;
    const userId = state.userId;
    const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0]; // Ensure targetDate is available

    if (!intents || intents.length === 0 || !userId) {
        console.log("No log intents to enrich or userId missing.");
        return { current_step: "enrichAgenticLogIntents", enrichedAgenticLogs: [] }; // Ensure field is initialized
    }

    console.log(`Attempting to enrich ${intents.length} log intents for user ${userId}.`);
    const enrichmentPromises = intents.map(intent => enrichLogIntent(intent, userId, targetDate));
    const results = await Promise.allSettled(enrichmentPromises);

    const successfullyEnrichedLogs: (Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'>)[] = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            successfullyEnrichedLogs.push(result.value);
        } else if (result.status === 'rejected') {
            console.error(`Error enriching log intent #${index} ("${intents[index].details}"):`, result.reason);
        } else {
             console.warn(`Enrichment failed or returned null for intent #${index} ("${intents[index].details}").`);
        }
    });

    console.log(`Successfully enriched ${successfullyEnrichedLogs.length} out of ${intents.length} intents.`);
    return { current_step: "enrichAgenticLogIntents", enrichedAgenticLogs: successfullyEnrichedLogs };
}

// --- NEW NODE: Save Agentic Logs ---
async function saveAgenticLogs(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Save Agentic Logs ---");
  // Read from the NEW state field containing fully enriched logs
  const logsToSave = state.enrichedAgenticLogs;
  const userId = state.userId; // userId should be present if logs exist

  if (!logsToSave || logsToSave.length === 0) {
    console.log("No enriched agentic logs to save.");
    return { current_step: "saveAgenticLogs" }; // Nothing to do
  }

  console.log(`Attempting to save ${logsToSave.length} enriched agentic logs for user ${userId}.`);

  // logsToSave contains objects matching Omit<FoodLog | ExerciseLog, ...>
  // The saveFoodLog/saveExerciseLog functions expect the full type, but they
  // only use the fields present in the Omit type for the INSERT operation.
  // The database handles id, createdAt, updatedAt.
  // We need to cast the log object back to the full type for the function call.
  // Get existing daily logs from state for duplicate checking
  const existingFoodLogs = state.dailyFoodLogs ?? [];
  const existingExerciseLogs = state.dailyExerciseLogs ?? [];

  const logPromises = logsToSave.map(log => {
    // --- Duplicate Check ---
    let isDuplicate = false;
    if ('mealType' in log && log.name) { // Check if it's a potential FoodLog
      const newLogNameLower = log.name.toLowerCase();
      const newLogMealType = log.mealType;
      isDuplicate = existingFoodLogs.some(existing => {
        const existingNameLower = existing.name?.toLowerCase();
        const existingMealType = existing.mealType;
        // --- DEBUG LOGGING ---
        console.log(`[Dup Check Food] Comparing NEW: name='${newLogNameLower}', meal='${newLogMealType}' VS EXISTING: id='${existing.id}', name='${existingNameLower}', meal='${existingMealType}'`);
        // --- END DEBUG LOGGING ---
        const nameMatch = existingNameLower === newLogNameLower;
        const mealMatch = existingMealType === newLogMealType;
        return nameMatch && mealMatch;
      });
      if (isDuplicate) {
        console.log(`Duplicate check: Found matching existing FoodLog for "${log.name}" (${log.mealType}). Skipping save.`);
      }
    } else if ('type' in log && 'intensity' in log && log.name) { // Check if it's a potential ExerciseLog
       const newLogNameLower = log.name.toLowerCase();
       const newLogType = log.type;
       isDuplicate = existingExerciseLogs.some(existing => {
         const existingNameLower = existing.name?.toLowerCase();
         const existingType = existing.type;
         // --- DEBUG LOGGING ---
         console.log(`[Dup Check Exercise] Comparing NEW: name='${newLogNameLower}', type='${newLogType}' VS EXISTING: id='${existing.id}', name='${existingNameLower}', type='${existingType}'`);
         // --- END DEBUG LOGGING ---
         const nameMatch = existingNameLower === newLogNameLower;
         const typeMatch = existingType === newLogType;
         return nameMatch && typeMatch;
       });
       if (isDuplicate) {
        console.log(`Duplicate check: Found matching existing ExerciseLog for "${log.name}" (${log.type}). Skipping save.`);
      }
    }

    if (isDuplicate) {
      return Promise.resolve({ skipped: true, reason: 'Duplicate found in daily logs' }); // Resolve promise to indicate skip
    }
    // --- End Duplicate Check ---


    // Determine log type and call appropriate save function if not duplicate
    if ('mealType' in log) {
      console.log(`Saving enriched FoodLog: ${log.name}`);
      // Cast to FoodLog for the function call signature
      return saveFoodLog(log as FoodLog).then(() => ({ skipped: false, reason: null })); // Add reason: null for consistency
    } else if ('type' in log && 'intensity' in log) { // Check for exercise-specific fields
      console.log(`Saving enriched ExerciseLog: ${log.name}`);
       // Cast to ExerciseLog for the function call signature
      return saveExerciseLog(log as ExerciseLog).then(() => ({ skipped: false, reason: null })); // Add reason: null for consistency
    } else {
      console.warn("Enriched log object doesn't match known types:", log);
      return Promise.resolve({ skipped: true, reason: 'Unknown log type' }); // Indicate skip for unknown types
    }
  });

  // Run saves concurrently
  const results = await Promise.allSettled(logPromises);

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // Check our custom result object
      if (result.value.skipped) {
        // Only log the reason if it was skipped
         console.log(`Agentic log #${index} skipped. Reason: ${result.value.reason}`);
      } else {
         console.log(`Agentic log #${index} saved successfully.`);
         // TODO: Optionally update daily logs in state? Might be complex due to async nature.
         // For now, rely on the next fetchDailyContext in a subsequent turn.
      }
    } else { // status === 'rejected'
      console.error(`Error processing agentic log #${index}:`, result.reason);
    }
  });

  // We don't modify the state significantly here, just perform the side effect.
  return { current_step: "saveAgenticLogs" };
}

// --- Define Edges (Conditional Logic) ---

// Conditional edge: Decide whether to fetch user data
function decideIfFetchUserData(state: AgentState): string {
    console.log("--- Step: Decide Fetch User Data ---");
    if (state.needsPersonalization && state.userId) {
        console.log("Decision: Fetch user data.");
        return "fetchUserData";
    } else {
        console.log("Decision: Skip user data fetch.");
        // Go to retrieve history even if not personalizing
        return "retrieveHistoricalContext";
    }
}

// --- Build the Graph ---

// Explicitly type the channels argument structure
const graphArgs: StateGraphArgs<AgentState> = {
  channels: {
    // Use addMessages for the messages channel
    messages: {
      value: addMessages, // Use the imported reducer
      default: () => [],
    },
    // Keep other channel definitions
    userId: {
      value: (x?: string, y?: string) => y ?? x,
      default: () => undefined,
    },
    conversationId: {
      value: (x?: string, y?: string) => y ?? x,
      default: () => undefined,
    },
    knowledgeResponse: { // Type is FactualInformation | undefined
      value: (x?: FactualInformation, y?: FactualInformation) => y ?? x,
      default: () => undefined,
    },
    reasoningResponse: { // Type is ReasoningOutput | null | undefined
      value: (x?: ReasoningOutput | null, y?: ReasoningOutput | null) => y ?? x,
      default: () => undefined,
    },
    structuredAnswer: { // Type is StructuredAnswer | undefined
      value: (x?: StructuredAnswer, y?: StructuredAnswer) => y ?? x,
      default: () => undefined,
    },
    current_step: {
      value: (x?: string, y?: string) => y ?? x,
      default: () => undefined,
    },
    // Add channels for new state fields
    userProfile: {
      value: (x?: UserProfile | null, y?: UserProfile | null) => y ?? x,
      default: () => undefined,
    },
    // userGoals: { // Removed channel
    //   value: (x?: UserGoal[], y?: UserGoal[]) => y ?? x,
    //   default: () => [],
    // },
    needsPersonalization: {
       value: (x?: boolean, y?: boolean) => y ?? x,
       default: () => false,
    }, // Added comma
    // Removed extra closing brace
    targetDate: {
      value: (x?: string, y?: string) => y ?? x,
      default: () => undefined,
    },
    // Add channels for daily context logs
    dailyFoodLogs: {
      value: (x?: FoodLog[], y?: FoodLog[]) => y ?? x,
      default: () => [],
    },
    dailyExerciseLogs: {
      value: (x?: ExerciseLog[], y?: ExerciseLog[]) => y ?? x,
      default: () => [],
    },
    dailyInteractionLogs: {
      value: (x?: InteractionLog[], y?: InteractionLog[]) => y ?? x,
      default: () => [],
    },
    // Add channels for historical context logs
    historicalFoodLogs: {
      value: (x?: FoodLog[], y?: FoodLog[]) => y ?? x,
      default: () => [],
    },
    historicalExerciseLogs: {
      value: (x?: ExerciseLog[], y?: ExerciseLog[]) => y ?? x,
      default: () => [],
    },
    historicalInteractionLogs: {
      value: (x?: any[], y?: any[]) => y ?? x, // Using any[] as search returns metadata
      default: () => [],
    },
    // Ensure calculatedDailyCalories channel is removed
    // Add channel for enriched logs
    enrichedAgenticLogs: {
        value: (x?: (Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'>)[], y?: (Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'>)[]) => y ?? x,
        default: () => [], // Correct default: empty array
    }
  },
};

// Instantiate the graph with the explicit args type
const workflow = new StateGraph<AgentState>(graphArgs);

// Add nodes (using 'as any' to bypass type errors for now)
workflow.addNode("processInput", processInput as any);
workflow.addNode("identifyTargetDate", identifyTargetDate as any);
workflow.addNode("fetchDailyContext", fetchDailyContext as any); // NEW node
workflow.addNode("analyzeQueryForPersonalization", analyzeQueryForPersonalization as any);
workflow.addNode("fetchUserData", fetchUserData as any);
workflow.addNode("retrieveHistoricalContext", retrieveHistoricalContext as any); // NEW node
workflow.addNode("runKnowledgeLayer", runKnowledgeLayer as any);
workflow.addNode("runReasoningLayer", runReasoningLayer as any);
workflow.addNode("enrichAgenticLogIntents", enrichAgenticLogIntents as any); // Ensure this node is added
workflow.addNode("saveAgenticLogs", saveAgenticLogs as any);
// Ensure calculateDailyCaloriesNode is removed from node additions
workflow.addNode("runConversationLayer", runConversationLayer as any);

// Set entry point (without type assertions)
workflow.setEntryPoint("processInput" as any);

// Add edges (without type assertions for now)
workflow.addEdge("processInput" as any, "identifyTargetDate" as any); // Input -> Identify Date
workflow.addEdge("identifyTargetDate" as any, "fetchDailyContext" as any); // Identify Date -> Fetch Daily Context
// Ensure edge goes from fetchDailyContext to analyzeQueryForPersonalization
workflow.addEdge("fetchDailyContext" as any, "analyzeQueryForPersonalization" as any);

// Conditional edge after analysis
workflow.addConditionalEdges(
  "analyzeQueryForPersonalization" as any,
  decideIfFetchUserData, // Use the decision function
  {
    fetchUserData: "fetchUserData" as any, // If yes, fetch data
    retrieveHistoricalContext: "retrieveHistoricalContext" as any, // If no, skip fetchUserData but still retrieve history
  }
);

workflow.addEdge("fetchUserData" as any, "retrieveHistoricalContext" as any); // After fetch -> Retrieve History
workflow.addEdge("retrieveHistoricalContext" as any, "runKnowledgeLayer" as any); // After Retrieve History -> Knowledge
// Note: runKnowledgeLayer edge remains the same (doesn't directly depend on date yet)
workflow.addEdge("runKnowledgeLayer" as any, "runReasoningLayer" as any); // Knowledge -> Reasoning
workflow.addEdge("runReasoningLayer" as any, "enrichAgenticLogIntents" as any); // Reasoning -> Enrich Intents
workflow.addEdge("enrichAgenticLogIntents" as any, "saveAgenticLogs" as any); // Enrich Intents -> Save Logs
workflow.addEdge("saveAgenticLogs" as any, "runConversationLayer" as any); // Save Logs -> Conversation
workflow.addEdge("runConversationLayer" as any, END); // Conversation -> End

// Compile the graph
export const app = workflow.compile();

// Example usage (for testing purposes, might be called from API route)
async function runOrchestrator(input: string, userId?: string, conversationId?: string) {
  const initialState: AgentState = {
      messages: [new HumanMessage(input)],
      userId,
      conversationId,
      // Initialize other state properties if needed
  };
  console.log("--- Initial State ---");
  console.log(initialState);
  const result = await app.invoke(initialState);
  console.log("--- Orchestrator Result ---");
  console.log(JSON.stringify(result, null, 2)); // Pretty print result
  // The final state, including the structured answer and all messages, will be in result.
  return result;
}

// Example call:
// runOrchestrator("What should I eat for lunch today?", "user-123", "conv-abc");
// runOrchestrator("What should I eat for lunch today?");
