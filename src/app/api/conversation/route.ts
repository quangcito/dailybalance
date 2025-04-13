import { NextRequest, NextResponse } from 'next/server';
import { StructuredAnswer, Source } from '@/types/conversation';
import { app as answerEngineGraph, AgentState } from '@/lib/llm/orchestrator';
import { HumanMessage } from "@langchain/core/messages";
import { UserProfile } from '@/types/user'; // Import UserProfile
interface RequestBody {
  userId: string;
  query: string;
  sessionId?: string;
  guestProfileData?: Partial<UserProfile>; // Add optional guest profile data
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { userId, query, sessionId, guestProfileData } = body; // Extract guestProfileData

    if (!userId || !query) {
      return NextResponse.json({ error: 'Missing userId or query' }, { status: 400 });
    }

    console.log(`Received query from user ${userId} (session: ${sessionId || 'N/A'}): ${query}`);

    // Prepare the initial state for the LangGraph orchestrator
    // The graph expects messages in a specific format
    const initialState: Partial<AgentState> = {
      messages: [new HumanMessage(query)], // Wrap query in HumanMessage
      userId,
      guestProfileData, // Pass guest profile data to the graph state
      // sessionId is not directly part of AgentState, handled separately if needed
    };

    // We are using 'as any' here temporarily due to persistent LangGraph typing issues
    // The actual final state type should align with OrchestratorState
    const finalState: any = await answerEngineGraph.invoke(initialState as any); // Use 'any' for result due to LangGraph type complexity

    // Extract the final answer and sources from the graph's state
    // Assuming the final state structure aligns with AgentState
    const finalAnswer: StructuredAnswer = finalState.structuredAnswer || { text: 'Sorry, I could not generate an answer.' };
    const finalSources: Source[] = finalState.knowledgeResponse?.sources || [];

    return NextResponse.json({
      answer: finalAnswer,
      sources: finalSources,
    });

  } catch (error) {
    console.error('Error processing conversation request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
