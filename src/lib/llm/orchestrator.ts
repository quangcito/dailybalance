import { StateGraph, END, StateGraphArgs, addMessages } from "@langchain/langgraph"; // Import addMessages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"; // Import AIMessage and BaseMessage
import { RunnableLambda } from "@langchain/core/runnables";
import { StructuredAnswer, Source } from "@/types/conversation"; // Import existing types

// TODO: Import necessary clients and layers (Knowledge, Reasoning, Conversation)
// import { knowledgeLayer } from './knowledge-layer';
// import { reasoningLayer } from './reasoning-layer';
// import { conversationLayer } from './conversation-layer';
// import { supabaseClient } from '../db/supabase';
// import { pineconeClient } from '../vector-db/pinecone';
// import { redisClient } from '../cache/redis';

// Define the state structure for the graph
interface AgentState {
  messages: BaseMessage[]; // Use BaseMessage to allow HumanMessage and AIMessage
  userId?: string; // Optional: Add if needed for context
  conversationId?: string; // Optional: Add if needed for context
  knowledgeResponse?: { // Placeholder structure
    content: string;
    sources: Source[];
  };
  reasoningResponse?: { // Placeholder structure
    personalizedAdvice: string;
    dataSummary?: Record<string, any>;
  };
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
    knowledgeResponse: AgentState['knowledgeResponse'];
}> {
  console.log("--- Step: Knowledge Layer ---");
  // TODO: Call knowledgeLayer.invoke() with appropriate input from state
  const knowledgeResponse = { // Replace with actual call
      content: "Placeholder: Knowledge Layer Response Content",
      sources: [{ url: "http://example.com", title: "Example Source" }]
  };
  console.log("Knowledge Response:", knowledgeResponse);
  // TODO: Update state with knowledgeResponse
  return { current_step: "runKnowledgeLayer", knowledgeResponse };
}

// Node: Reasoning Layer
// Returns updates for specific channels
async function runReasoningLayer(state: AgentState): Promise<{
    current_step: string;
    reasoningResponse: AgentState['reasoningResponse'];
}> {
  console.log("--- Step: Reasoning Layer ---");
  // TODO: Call reasoningLayer.invoke() with appropriate input from state (e.g., user input, knowledge)
  const reasoningResponse = { // Replace with actual call
      personalizedAdvice: "Placeholder: Reasoning Layer Personalized Advice",
      dataSummary: { calories_needed: 500 }
  };
  console.log("Reasoning Response:", reasoningResponse);
  // TODO: Update state with reasoningResponse
  return { current_step: "runReasoningLayer", reasoningResponse };
}

// Node: Conversation Layer
// Returns updates for specific channels
async function runConversationLayer(state: AgentState): Promise<{
    current_step: string;
    structuredAnswer: StructuredAnswer;
    messages: BaseMessage[];
}> {
  console.log("--- Step: Conversation Layer ---");
  // TODO: Call conversationLayer.invoke() with appropriate input (e.g., user input, knowledge, reasoning)
  const finalResponse: StructuredAnswer = { // Replace with actual call
      text: "Placeholder: Final Conversation Response Text",
      suggestions: ["Log your breakfast"],
      dataSummary: state.reasoningResponse?.dataSummary, // Pass through summary
  };
  console.log("Final Response:", finalResponse);
  // Append the final AI message to the list
  const finalAiMessage = new AIMessage({ content: JSON.stringify(finalResponse) }); // Store structured answer as content
  // Example: return { messages: [...state.messages, new AIMessage(finalResponse)] };
  return {
      current_step: "runConversationLayer",
      structuredAnswer: finalResponse,
      messages: [...state.messages, finalAiMessage], // Add AI response to messages
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
    knowledgeResponse: {
      value: (x, y) => y ?? x,
      default: () => undefined,
    },
    reasoningResponse: {
      value: (x, y) => y ?? x,
      default: () => undefined,
    },
    structuredAnswer: {
      value: (x, y) => y ?? x,
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
