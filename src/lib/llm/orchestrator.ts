import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

import { getFactualInformation, FactualInformation } from './knowledge-layer.ts';
import { generatePersonalizedInsights, ReasoningOutput } from './reasoning-layer.ts';
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
} from '../db/supabase'; // Import fetch and log functions
import { calculateBMR, calculateTDEE } from '../utils/calculations'; // Import calculation functions

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
}

// --- Define Nodes ---

// Node: Entry Point (e.g., process user input)
// Returns updates for specific channels
async function processInput(state: AgentState): Promise<{
    current_step: string;
    knowledgeResponse: undefined;
    reasoningResponse: undefined;
    structuredAnswer: undefined;
}> {
  console.log("--- Step: Process Input ---");
  const lastMessage = state.messages[state.messages.length - 1];
  console.log("User Input:", lastMessage.content);
  // Clear previous responses for a new turn
  return {
    current_step: "processInput",
    knowledgeResponse: undefined,
    reasoningResponse: undefined,
    structuredAnswer: undefined,
  };
}

// --- NEW NODE: Identify Target Date ---
async function identifyTargetDate(state: AgentState): Promise<{
    current_step: string;
    targetDate: string;
}> {
    console.log("--- Step: Identify Target Date ---");
    const lastMessage = state.messages[state.messages.length - 1];
    const query = typeof lastMessage.content === 'string' ? lastMessage.content : "";

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    let targetDate = today; // Default to today

    try {
        // Use a simple LLM call to extract the date
        // Ensure OPENAI_API_KEY is set in environment
        const dateExtractionModel = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });
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
async function fetchDailyContext(state: AgentState): Promise<{
    current_step: string;
    dailyFoodLogs: FoodLog[];
    dailyExerciseLogs: ExerciseLog[];
    dailyInteractionLogs: InteractionLog[];
}> {
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



// --- NEW NODE: Analyze Query for Personalization ---
// Simple keyword-based check for now
async function analyzeQueryForPersonalization(state: AgentState): Promise<{
   current_step: string;
   needsPersonalization: boolean;
}> {
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
async function fetchUserData(state: AgentState): Promise<{
   current_step: string;
   userProfile: UserProfile | null;
   // userGoals: UserGoal[]; // Removed
}> {
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

// Node: Knowledge Layer
// Returns updates for specific channels
async function runKnowledgeLayer(state: AgentState): Promise<{
    current_step: string;
    knowledgeResponse: FactualInformation;
}> {
  console.log("--- Step: Knowledge Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content); // Handle potential non-string content

  const knowledgeResponse = await getFactualInformation(query);

  console.log("Knowledge Response:", knowledgeResponse);
  return { current_step: "runKnowledgeLayer", knowledgeResponse };
}

// Node: Reasoning Layer
// Returns updates for specific channels
async function runReasoningLayer(state: AgentState): Promise<{
    current_step: string;
    reasoningResponse: ReasoningOutput | null;
}> {
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
  // TODO: Pass daily logs to generatePersonalizedInsights
  const dailyFoodLogs = state.dailyFoodLogs ?? [];
  const dailyExerciseLogs = state.dailyExerciseLogs ?? [];
  const dailyInteractionLogs = state.dailyInteractionLogs ?? [];

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
      dailyInteractionLogs
  );


  console.log("Reasoning Response:", reasoningResponse);
  return { current_step: "runReasoningLayer", reasoningResponse };
}

// Node: Conversation Layer
// Returns updates for specific channels
async function runConversationLayer(state: AgentState): Promise<{
    current_step: string;
    structuredAnswer?: StructuredAnswer; // Make optional as it might fail
    messages: BaseMessage[];
}> {
  console.log("--- Step: Conversation Layer ---");
  const lastMessage = state.messages[state.messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
  // Ensure reasoningOutput is explicitly null if undefined, matching generateFinalResponse signature
  const reasoningOutput = state.reasoningResponse ?? null; // This is now ReasoningOutput | null
  const userId = state.userId || "unknown-user"; // Provide default if needed
  const conversationId = state.conversationId || `temp-${Date.now()}`; // Provide default if needed

  // Call the actual conversation layer function
  const finalResponse = await generateFinalResponse(
      userId,
      conversationId,
      query,
      reasoningOutput // Pass the output from the reasoning step (now guaranteed to be ReasoningOutput | null)
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

  return {
      current_step: "runConversationLayer",
      structuredAnswer: finalResponse, // Store the full structured answer in the state
      messages: [...state.messages, finalAiMessage], // Add AI response text to messages
  };
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
        return "runKnowledgeLayer";
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
workflow.addNode("runKnowledgeLayer", runKnowledgeLayer as any);
workflow.addNode("runReasoningLayer", runReasoningLayer as any);
workflow.addNode("runConversationLayer", runConversationLayer as any);

// Set entry point (without type assertions)
workflow.setEntryPoint("processInput" as any);

// Add edges (without type assertions for now)
workflow.addEdge("processInput" as any, "identifyTargetDate" as any); // Input -> Identify Date
workflow.addEdge("identifyTargetDate" as any, "fetchDailyContext" as any); // Identify Date -> Fetch Daily Context
workflow.addEdge("fetchDailyContext" as any, "analyzeQueryForPersonalization" as any); // Fetch Daily Context -> Analyze

// Conditional edge after analysis
workflow.addConditionalEdges(
  "analyzeQueryForPersonalization" as any,
  decideIfFetchUserData, // Use the decision function
  {
    fetchUserData: "fetchUserData" as any, // If yes, fetch data
    runKnowledgeLayer: "runKnowledgeLayer" as any, // If no, skip to knowledge
  }
);

workflow.addEdge("fetchUserData" as any, "runKnowledgeLayer" as any); // After fetch -> Knowledge
// Note: runKnowledgeLayer edge remains the same (doesn't directly depend on date yet)
workflow.addEdge("runKnowledgeLayer" as any, "runReasoningLayer" as any); // Knowledge -> Reasoning
workflow.addEdge("runReasoningLayer" as any, "runConversationLayer" as any); // Reasoning -> Conversation
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
