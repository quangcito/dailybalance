import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

import { getFactualInformation, FactualInformation } from './knowledge-layer.ts';
import { generatePersonalizedInsights, ReasoningOutput } from './reasoning-layer.ts';
import { generateFinalResponse } from './conversation-layer.ts';
import { UserProfile, UserGoal } from '@/types/user'; // Import user types
// TODO: Import functions to fetch user profile/goals if needed
// import { supabaseClient } from '../db/supabase';
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

  // TODO: Fetch UserProfile and UserGoals based on userId
  // This likely requires interacting with Supabase here or ensuring they are passed in the initial state.
  const userProfile: UserProfile | null = null; // Placeholder
  const userGoals: UserGoal[] = []; // Placeholder
  // TODO: Determine actual time context (e.g., based on server time or user input)
  const timeContext = "Midday"; // Placeholder

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

// Example conditional edge: Decide next step after processing input
function decideNextStep(state: AgentState): string {
  console.log("--- Step: Decide Next Step ---");
  // TODO: Implement logic to decide the flow (e.g., based on input type, history)
  // For now, linear flow: Input -> Knowledge -> Reasoning -> Conversation
  return "runKnowledgeLayer";
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
  },
};

// Instantiate the graph with the explicit args type
const workflow = new StateGraph<AgentState>(graphArgs);

// Add nodes (using 'as any' to bypass type errors)
workflow.addNode("processInput", processInput as any);
workflow.addNode("runKnowledgeLayer", runKnowledgeLayer as any);
workflow.addNode("runReasoningLayer", runReasoningLayer as any);
workflow.addNode("runConversationLayer", runConversationLayer as any);

// Set entry point (without type assertions)
workflow.setEntryPoint("processInput" as any);

// Add edges (without type assertions)
workflow.addConditionalEdges(
  "processInput" as any,
  decideNextStep,
  {
    runKnowledgeLayer: "runKnowledgeLayer" as any,
  }
);
workflow.addEdge("runKnowledgeLayer" as any, "runReasoningLayer" as any);
workflow.addEdge("runReasoningLayer" as any, "runConversationLayer" as any);
workflow.addEdge("runConversationLayer" as any, END);

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
