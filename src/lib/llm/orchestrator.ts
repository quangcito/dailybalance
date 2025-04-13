import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

import { getFactualInformation, FactualInformation } from './knowledge-layer.ts';
import { generatePersonalizedInsights, ReasoningOutput } from './reasoning-layer.ts';
import { generateFinalResponse } from './conversation-layer.ts';
import { UserProfile, UserGoal } from '@/types/user'; // Import user types
import { getUserProfile, getActiveUserGoals } from '../db/supabase'; // Import fetch functions

// TODO: Import functions to fetch user profile/goals if needed - DONE
// import { pineconeClient } from '../vector-db/pinecone';
// import { redisClient } from '../cache/redis';

// Define the state structure for the graph
export interface AgentState { // Add export keyword
  messages: BaseMessage[]; // Use BaseMessage to allow HumanMessage and AIMessage
  userId?: string; // Optional: Add if needed for context
  conversationId?: string; // Optional: Add if needed for context
  knowledgeResponse?: FactualInformation; // Use type from knowledge-layer
  reasoningResponse?: ReasoningOutput | null; // Use type from reasoning-layer
  structuredAnswer?: StructuredAnswer; // Final output
  current_step?: string; // To track the current node
  // Add fields for fetched user data
  userProfile?: UserProfile | null;
  userGoals?: UserGoal[];
  needsPersonalization?: boolean; // Flag from analysis step
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
   userGoals: UserGoal[];
}> {
   console.log("--- Step: Fetch User Data ---");
   if (!state.userId) {
       console.log("No userId provided, skipping user data fetch.");
       return { current_step: "fetchUserData", userProfile: null, userGoals: [] };
   }
   console.log(`Fetching data for userId: ${state.userId}`);
   try {
       const [profile, goals] = await Promise.all([
           getUserProfile(state.userId),
           getActiveUserGoals(state.userId)
       ]);
       console.log("Fetched Profile:", profile ? 'Yes' : 'No');
       console.log("Fetched Goals:", goals.length);
       return { current_step: "fetchUserData", userProfile: profile, userGoals: goals };
   } catch (error) {
       console.error("Error fetching user data:", error);
       return { current_step: "fetchUserData", userProfile: null, userGoals: [] }; // Return defaults on error
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
  const userGoals = state.userGoals ?? [];
  // TODO: Determine actual time context (e.g., based on server time or user input)
  const timeContext = "Midday"; // Placeholder - Keep for now

  if (!knowledgeInfo) {
      console.warn("Reasoning Layer: Knowledge information is missing.");
      // Decide how to handle missing info - return error, default response, etc.
      return { current_step: "runReasoningLayer", reasoningResponse: { insights: "Could not retrieve factual information.", error: "Missing knowledge data." } };
  }

  const reasoningResponse = await generatePersonalizedInsights(
      query,
      knowledgeInfo,
      userProfile,
      userGoals,
      timeContext
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
    userGoals: {
      value: (x?: UserGoal[], y?: UserGoal[]) => y ?? x,
      default: () => [],
    },
    needsPersonalization: {
       value: (x?: boolean, y?: boolean) => y ?? x,
       default: () => false,
    }
  },
};

// Instantiate the graph with the explicit args type
const workflow = new StateGraph<AgentState>(graphArgs);

// Add nodes (using 'as any' to bypass type errors for now)
workflow.addNode("processInput", processInput as any);
workflow.addNode("analyzeQueryForPersonalization", analyzeQueryForPersonalization as any); // New node
workflow.addNode("fetchUserData", fetchUserData as any); // New node
workflow.addNode("runKnowledgeLayer", runKnowledgeLayer as any);
workflow.addNode("runReasoningLayer", runReasoningLayer as any);
workflow.addNode("runConversationLayer", runConversationLayer as any);

// Set entry point (without type assertions)
workflow.setEntryPoint("processInput" as any);

// Add edges (without type assertions for now)
workflow.addEdge("processInput" as any, "analyzeQueryForPersonalization" as any); // Input -> Analyze

// Conditional edge after analysis
workflow.addConditionalEdges(
  "analyzeQueryForPersonalization" as any,
  decideIfFetchUserData, // Use the new decision function
  {
    fetchUserData: "fetchUserData" as any, // If yes, fetch data
    runKnowledgeLayer: "runKnowledgeLayer" as any, // If no, skip to knowledge
  }
);

workflow.addEdge("fetchUserData" as any, "runKnowledgeLayer" as any); // After fetch -> Knowledge
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
