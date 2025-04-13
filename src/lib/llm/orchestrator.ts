import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

import { getFactualInformation, KnowledgeLayerOutput } from './knowledge-layer'; // Updated import
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
import { searchInteractionLogs, getConversationHistory } from '../vector-db/pinecone'; // NEW: Import vector search & history fetch
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
  knowledgeResponse?: KnowledgeLayerOutput; // Updated type (contains content + sources)
  reasoningResponse?: ReasoningOutput | null; // Use type from reasoning-layer
  structuredAnswer?: StructuredAnswer; // Final output (will contain text with citations)
  sources?: Source[]; // NEW: To hold sources from knowledge layer for final output
  current_step?: string; // To track the current node
  // Add fields for fetched user data
  userProfile?: UserProfile | null;
  // userGoals?: UserGoal[]; // Removed as goals are now part of UserProfile
  needsPersonalization?: boolean; // Flag from analysis step
  // Add fields for daily context logs
  dailyFoodLogs?: FoodLog[];
  dailyExerciseLogs?: ExerciseLog[];
  dailyInteractionLogs?: InteractionLog[];
  // Add fields for calculated daily totals
  dailyCaloriesConsumed?: number; // NEW: Sum of calories from dailyFoodLogs
  dailyCaloriesBurned?: number; // NEW: Sum of caloriesBurned from dailyExerciseLogs
  netCalories?: number; // NEW: Calculated net calories (TDEE - consumed + burned)
  // Add fields for retrieved historical context
  historicalFoodLogs?: FoodLog[];
  historicalExerciseLogs?: ExerciseLog[];
  historicalInteractionLogs?: any[]; // Pinecone search returns metadata objects
  // NEW: State to hold fully enriched logs ready for saving
  enrichedAgenticLogs?: (Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> | Omit<ExerciseLog, 'id' | 'createdAt' | 'updatedAt'>)[];
  guestProfileData?: Partial<UserProfile>; // NEW: For guest mode onboarding
  timeContext?: 'Morning' | 'Midday' | 'Afternoon' | 'Evening' | 'Night'; // NEW: Time context
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

// --- NEW NODE: Load Session History ---
async function loadSessionHistory(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Load Session History ---");
    const conversationId = state.conversationId;
    const currentMessages = state.messages || []; // Should contain only the latest user message at this point

    if (!conversationId) {
        console.log("No conversationId found in state, skipping history load.");
        return { current_step: "loadSessionHistory", messages: currentMessages }; // Return current messages
    }

    const HISTORY_LIMIT = 5; // How many past turns to fetch
    let historyMessages: BaseMessage[] = [];
    try {
        // getConversationHistory returns an array of InteractionLog objects
        const historyLogs: InteractionLog[] = await getConversationHistory(conversationId, HISTORY_LIMIT);
        console.log(`Fetched ${historyLogs.length} interaction logs from history for session ${conversationId}.`);

        // Convert InteractionLog[] to BaseMessage[] (HumanMessage, AIMessage)
        // Assuming logs are ordered newest first from getConversationHistory, reverse for chronological order
        historyMessages = historyLogs.reverse().flatMap(log => {
            const messages: BaseMessage[] = [];
            if (log.query) {
                messages.push(new HumanMessage({ content: log.query }));
            }
            // Ensure llmResponse exists and has a text property before creating AIMessage
            if (log.llmResponse && typeof log.llmResponse.text === 'string') {
                 messages.push(new AIMessage({ content: log.llmResponse.text }));
            } else if (typeof log.llmResponse === 'string') { // Handle older logs where llmResponse might be just a string
                 messages.push(new AIMessage({ content: log.llmResponse }));
            }
            return messages;
        });
         console.log(`Converted history logs to ${historyMessages.length} BaseMessages.`);

    } catch (error) {
        console.error(`Error loading session history for ${conversationId}:`, error);
        // Proceed without history if loading fails
    }

    // Prepend history to the current message(s)
    const combinedMessages = [...historyMessages, ...currentMessages];

    return {
        current_step: "loadSessionHistory",
        messages: combinedMessages // Update the messages channel
    };
}

// --- NEW NODE: Determine Time Context ---
async function determineTimeContext(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Determine Time Context ---");
    const now = new Date();
    // Use Los Angeles time zone for consistency with environment_details
    const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }));
    let timeContext: 'Morning' | 'Midday' | 'Afternoon' | 'Evening' | 'Night';

    if (currentHour >= 5 && currentHour < 11) {
        timeContext = 'Morning';
    } else if (currentHour >= 11 && currentHour < 14) {
        timeContext = 'Midday';
    } else if (currentHour >= 14 && currentHour < 17) {
        timeContext = 'Afternoon';
    } else if (currentHour >= 17 && currentHour < 21) {
        timeContext = 'Evening';
    } else {
        timeContext = 'Night'; // Covers 21:00 to 04:59
    }

    console.log(`Current hour (LA Time): ${currentHour}, Determined Time Context: ${timeContext}`);
    return { current_step: "determineTimeContext", timeContext };
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
            dailyCaloriesConsumed: 0, // Initialize sums
            dailyCaloriesBurned: 0,
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

        // Calculate sums
        const dailyCaloriesConsumed = foodLogs.reduce((sum, log) => sum + (log.calories || 0), 0);
        const dailyCaloriesBurned = exerciseLogs.reduce((sum, log) => sum + (log.caloriesBurned || 0), 0);

        console.log(`Fetched Food Logs: ${foodLogs.length} (Consumed: ${dailyCaloriesConsumed} kcal)`);
        console.log(`Fetched Exercise Logs: ${exerciseLogs.length} (Burned: ${dailyCaloriesBurned} kcal)`);
        console.log(`Fetched Interaction Logs: ${interactionLogs.length}`);

        return {
            current_step: "fetchDailyContext",
            dailyFoodLogs: foodLogs,
            dailyExerciseLogs: exerciseLogs,
            dailyInteractionLogs: interactionLogs,
            dailyCaloriesConsumed: dailyCaloriesConsumed, // Store sum in state
            dailyCaloriesBurned: dailyCaloriesBurned, // Store sum in state
        };
    } catch (error) {
        console.error("Error fetching daily context logs:", error);
        // Return empty arrays and zero sums on error
        return {
            current_step: "fetchDailyContext",
            dailyFoodLogs: [],
            dailyExerciseLogs: [],
            dailyInteractionLogs: [],
            dailyCaloriesConsumed: 0,
            dailyCaloriesBurned: 0,
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
       let profile: UserProfile | null = null;
       try {
            profile = await getUserProfile(state.userId);
            console.log("Fetched Profile from DB:", profile ? 'Yes' : 'No');
       } catch (dbError) {
            console.warn("Failed to fetch profile from DB for userId:", state.userId, dbError);
            // Continue, as this might be a guest user
       }


       // If profile NOT found in DB (guest user) AND guest data was provided
       if (!profile && state.guestProfileData) {
           console.log("Profile not found in DB, using provided guestProfileData.");
           // Construct a UserProfile object from guest data.
           // Construct guest profile from guestProfileData
           profile = {
               // Required fields with defaults/placeholders
               id: state.userId,
               email: `guest-${state.userId}@example.com`,
               name: 'Guest User',
               createdAt: new Date().toISOString(),
               updatedAt: new Date().toISOString(),

               // Fields from guestProfileData (basic)
               age: state.guestProfileData.age,
               gender: state.guestProfileData.gender,
               activityLevel: state.guestProfileData.activityLevel,
               goal: state.guestProfileData.goal,

               // NEW fields from guestProfileData
               height: state.guestProfileData.height, // Will be undefined if not provided
               weight: state.guestProfileData.weight, // Will be undefined if not provided
               dietaryPreferences: state.guestProfileData.dietaryPreferences, // Includes booleans and arrays
               macroTargets: state.guestProfileData.macroTargets, // Will be undefined if not provided
               preferences: state.guestProfileData.preferences, // Will be undefined if not provided

               // Calculated fields - initialize as undefined
               bmr: undefined,
               tdee: undefined,
           };

           // Attempt BMR/TDEE calculation for guest IF required data is present
           if (profile.age && profile.gender && profile.height && profile.weight && profile.activityLevel) {
                console.log("Calculating BMR/TDEE for guest user.");
                const guestBmr = calculateBMR(profile as UserProfile); // Cast needed as TS doesn't know fields are checked
                const guestTdee = calculateTDEE(guestBmr, profile.activityLevel);
                profile.bmr = guestBmr ?? undefined;
                profile.tdee = guestTdee ?? undefined;
                console.log("Guest Calculated BMR:", profile.bmr);
                console.log("Guest Calculated TDEE:", profile.tdee);
           } else {
                console.log("Skipping BMR/TDEE calculation for guest user due to missing data (height/weight/etc.).");
           }

           console.log("Constructed Guest Profile:", profile);

       } else if (profile) { // Existing user profile found
            console.log("Existing user profile found, calculating BMR/TDEE.");
            const bmr = calculateBMR(profile); // Use existing profile data
            const tdee = calculateTDEE(bmr, profile.activityLevel);
            profile = { ...profile, bmr: bmr ?? undefined, tdee: tdee ?? undefined };
            console.log("User Calculated BMR:", bmr); // Logged as User BMR
            console.log("User Calculated TDEE:", tdee); // Logged as User TDEE
       } else {
            console.log("No profile found in DB and no guest data provided.");
            // profile remains null
       }

       return { current_step: "fetchUserData", userProfile: profile };
   } catch (error) {
       console.error("Unexpected error in fetchUserData:", error);
       return { current_step: "fetchUserData", userProfile: null };
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

  const knowledgeOutput = await getFactualInformation(query); // Renamed variable for clarity

  console.log("Knowledge Response:", knowledgeOutput);
  // Assign the entire KnowledgeLayerOutput object and extract sources
  return {
      current_step: "runKnowledgeLayer",
      knowledgeResponse: knowledgeOutput,
      sources: knowledgeOutput?.sources ?? [] // Populate sources state
  };
}

// Node: Calculate Net Calories
async function calculateNetCalories(state: AgentState): Promise<Partial<AgentState>> {
    console.log("--- Step: Calculate Net Calories ---");
    const tdee = state.userProfile?.tdee;
    const consumed = state.dailyCaloriesConsumed ?? 0;
    const burned = state.dailyCaloriesBurned ?? 0;
    let netCalories: number | undefined = undefined;

    if (tdee !== undefined) {
        netCalories = tdee - consumed + burned;
        console.log(`Calculated Net Calories: TDEE(${tdee}) - Consumed(${consumed}) + Burned(${burned}) = ${netCalories}`);
    } else {
        console.log("TDEE is undefined, cannot calculate net calories.");
    }

    return { current_step: "calculateNetCalories", netCalories };
}

// Node: Reasoning Layer
// Returns updates for specific channels
async function runReasoningLayer(state: AgentState): Promise<Partial<AgentState>> {
  console.log("--- Step: Reasoning Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
  const knowledgeOutput = state.knowledgeResponse; // Get the full output object
  const userId = state.userId;

  // UserProfile and UserGoals are now potentially populated in the state
  const userProfile = state.userProfile ?? null;
  // const userGoals = state.userGoals ?? []; // Goals are now in userProfile
  // Get time context from state
  const timeContext = state.timeContext ?? 'Midday'; // Use determined context or default
  const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0]; // Use identified date or default
  // Get daily and historical logs from state
  const dailyFoodLogs = state.dailyFoodLogs ?? [];
  const dailyExerciseLogs = state.dailyExerciseLogs ?? [];
  const dailyInteractionLogs = state.dailyInteractionLogs ?? [];
  const historicalFoodLogs = state.historicalFoodLogs ?? [];
  const historicalExerciseLogs = state.historicalExerciseLogs ?? [];
  const historicalInteractionLogs = state.historicalInteractionLogs ?? [];
  // Get calculated calorie data from state
  const dailyCaloriesConsumed = state.dailyCaloriesConsumed;
  const dailyCaloriesBurned = state.dailyCaloriesBurned;
  const netCalories = state.netCalories;


  // Check if knowledgeResponse or its content is missing
  if (!knowledgeOutput || knowledgeOutput.content === null) {
      console.warn("Reasoning Layer: Knowledge information is missing or invalid.");
      // Return error in reasoningResponse
      return { current_step: "runReasoningLayer", reasoningResponse: { insights: "Could not retrieve factual information.", error: "Missing or invalid knowledge data." } };
  }

  const reasoningResponse = await generatePersonalizedInsights(
      query,
      knowledgeOutput, // Pass the full KnowledgeLayerOutput object
      userProfile,
      timeContext,
      dailyFoodLogs, // Pass daily logs from state
      dailyExerciseLogs,
      dailyInteractionLogs,
      // NEW: Pass historical logs
      historicalFoodLogs,
      historicalExerciseLogs,
      historicalInteractionLogs,
      // NEW: Pass calculated calorie data
      dailyCaloriesConsumed,
      dailyCaloriesBurned,
      netCalories
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
  const dailyCaloriesConsumed = state.dailyCaloriesConsumed; // Get from state
  const dailyCaloriesBurned = state.dailyCaloriesBurned; // Get from state
  const netCalories = state.netCalories; // Get from state
  const targetDate = state.targetDate ?? new Date().toISOString().split('T')[0]; // Get target date
  const sources = state.sources ?? []; // Get sources from state
  // History is now part of state.messages, loaded by loadSessionHistory node
  const fullMessageHistory = state.messages || [];

  // --- Prepare data for Conversation Layer ---
  // Pass reasoning output directly. The conversation layer will use derivedData from it.
  // Ensure insights has a default value if reasoningOutput is null
  const finalReasoningData = reasoningOutput ?? { insights: '', error: 'Reasoning output was null' };


  // Call the actual conversation layer function, passing the reasoning output, calculated calorie data, and sources from state
  // NOTE: The conversation layer internally fetches history again - this is redundant now.
  // We should modify generateFinalResponse to accept history from the state instead.
  // For now, we call it as is, but acknowledge the redundancy.
  // TODO: Refactor generateFinalResponse to accept message history array.
  const finalResponse = await generateFinalResponse(
      userId,
      conversationId,
      query, // Pass the latest query
      finalReasoningData, // Pass the reasoning output
      dailyCaloriesConsumed, // Pass calculated value from state
      dailyCaloriesBurned,   // Pass calculated value from state
      netCalories,         // Pass calculated value from state
      tdee,                  // Pass user's TDEE from state
      sources                // Pass sources from state
      // Missing: Pass fullMessageHistory here once generateFinalResponse is updated
  );

  console.log("Final Response:", finalResponse);

  // Append the final AI message to the list, store the structured answer itself
  // Use the full finalResponse.text which should be generated considering history (even if fetched redundantly for now)
  const finalAiMessage = new AIMessage({ content: finalResponse.text });

  // --- Log the interaction (using Supabase logger, Pinecone logging happens in Conversation Layer) ---
  try {
    // Ensure llmResponse is stored correctly (it expects StructuredAnswer)
    const interactionLogEntry: Omit<InteractionLog, 'id' | 'embedding'> = { // Omit fields handled by DB/Pinecone
      userId: userId,
      sessionId: conversationId, // Use conversationId as sessionId
      timestamp: new Date().toISOString(),
      query: query,
      llmResponse: finalResponse, // Store the full structured answer
      sources: sources,
    };
    await logInteraction(interactionLogEntry);
    console.log("Interaction logged successfully via Supabase.");
  } catch (logError) {
    console.error("Failed to log interaction via Supabase:", logError);
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
    knowledgeResponse: { // Type is KnowledgeLayerOutput | undefined
      value: (x?: KnowledgeLayerOutput, y?: KnowledgeLayerOutput) => y ?? x,
      default: () => undefined,
    },
    sources: { // NEW Channel for sources
       value: (x?: Source[], y?: Source[]) => y ?? x,
       default: () => [],
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
    // Add channels for calculated daily totals
    dailyCaloriesConsumed: {
        value: (x?: number, y?: number) => y ?? x,
        default: () => 0,
    },
    dailyCaloriesBurned: {
        value: (x?: number, y?: number) => y ?? x,
        default: () => 0,
    },
    netCalories: {
        value: (x?: number, y?: number) => y ?? x,
        default: () => undefined,
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
        default: () => [],
    },
    // NEW: Channel for guest profile data
    guestProfileData: {
       value: (x?: Partial<UserProfile>, y?: Partial<UserProfile>) => y ?? x,
       default: () => undefined,
    },
    // NEW: Channel for time context
    timeContext: {
        value: (x?: 'Morning' | 'Midday' | 'Afternoon' | 'Evening' | 'Night', y?: 'Morning' | 'Midday' | 'Afternoon' | 'Evening' | 'Night') => y ?? x,
        default: () => undefined,
    }
  },
};

// Instantiate the graph with the explicit args type
const workflow = new StateGraph<AgentState>(graphArgs);

// Add nodes (using 'as any' to bypass type errors for now)
workflow.addNode("processInput", processInput as any);
workflow.addNode("loadSessionHistory", loadSessionHistory as any); // NEW node
workflow.addNode("determineTimeContext", determineTimeContext as any); // NEW node
workflow.addNode("identifyTargetDate", identifyTargetDate as any);
workflow.addNode("fetchDailyContext", fetchDailyContext as any); // NEW node
workflow.addNode("analyzeQueryForPersonalization", analyzeQueryForPersonalization as any);
workflow.addNode("fetchUserData", fetchUserData as any);
workflow.addNode("retrieveHistoricalContext", retrieveHistoricalContext as any); // NEW node
workflow.addNode("calculateNetCalories", calculateNetCalories as any); // NEW node
workflow.addNode("runKnowledgeLayer", runKnowledgeLayer as any);
workflow.addNode("runReasoningLayer", runReasoningLayer as any);
workflow.addNode("enrichAgenticLogIntents", enrichAgenticLogIntents as any); // Ensure this node is added
workflow.addNode("saveAgenticLogs", saveAgenticLogs as any);
// Ensure calculateDailyCaloriesNode is removed from node additions
workflow.addNode("runConversationLayer", runConversationLayer as any);

// Set entry point (without type assertions)
workflow.setEntryPoint("processInput" as any);

// Add edges (without type assertions for now)
workflow.addEdge("processInput" as any, "loadSessionHistory" as any); // Input -> Load History
workflow.addEdge("loadSessionHistory" as any, "determineTimeContext" as any); // Load History -> Determine Time Context
workflow.addEdge("determineTimeContext" as any, "identifyTargetDate" as any); // Determine Time Context -> Identify Date
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
// Both paths (with or without fetchUserData) converge at retrieveHistoricalContext
workflow.addEdge("retrieveHistoricalContext" as any, "calculateNetCalories" as any); // After Retrieve History -> Calculate Net Calories
workflow.addEdge("calculateNetCalories" as any, "runKnowledgeLayer" as any); // After Calculate Net Calories -> Knowledge
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
