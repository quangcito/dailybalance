import { NextRequest, NextResponse } from 'next/server';
import { getDailyInteractionLogs } from '@/lib/db/supabase';
import { InteractionLog } from '@/types/user';
import { ConversationMessage, UserMessage, SystemMessage } from '@/types/conversation';

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Helper function to format logs into conversation messages
const formatLogsToMessages = (logs: InteractionLog[]): ConversationMessage[] => {
  const messages: ConversationMessage[] = [];
  // Sort logs chronologically (oldest first) as getDailyInteractionLogs likely returns ordered by timestamp
  const sortedLogs = logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  sortedLogs.forEach(log => {
    // Add user message if query exists
    if (log.query) {
      messages.push({
        role: 'user',
        query: log.query,
        timestamp: log.timestamp,
      } as UserMessage); // Type assertion
    }
    // Add system message if response exists and is a valid StructuredAnswer with text
    if (log.llmResponse && typeof log.llmResponse === 'object' && log.llmResponse !== null && typeof log.llmResponse.text === 'string' && log.llmResponse.text.trim() !== '') {
        // We have a valid StructuredAnswer with text
        messages.push({
            role: 'system',
            answer: log.llmResponse, // It's already the correct object structure
            sources: log.sources || [], // Include sources if available
            timestamp: log.timestamp,
        } as SystemMessage); // Type assertion
    } else if (log.llmResponse) {
        // Log if llmResponse exists but doesn't conform to expectations
        console.warn(`Interaction log ${log.id || 'unknown'} has llmResponse but no usable text or invalid format:`, log.llmResponse);
    }
    // No 'else' needed - if there's no valid llmResponse, no system message is added.
  });
  return messages;
};


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const dateParam = searchParams.get('date'); // Optional date parameter

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
  }

  // Validate date format if provided, otherwise default to today
  let targetDate = getTodayDateString();
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    targetDate = dateParam;
  }

  console.log(`[API History] Fetching history for userId: ${userId}, date: ${targetDate}`);

  try {
    const dailyLogs = await getDailyInteractionLogs(userId, targetDate);

    if (!dailyLogs) {
      // This case might not happen if getDailyInteractionLogs always returns array, but good practice
      console.error(`[API History] Failed to fetch logs for userId: ${userId}, date: ${targetDate}`);
      return NextResponse.json({ error: 'Failed to fetch interaction logs' }, { status: 500 });
    }

    const formattedMessages = formatLogsToMessages(dailyLogs);

    console.log(`[API History] Returning ${formattedMessages.length} formatted messages for userId: ${userId}, date: ${targetDate}`);
    return NextResponse.json(formattedMessages);

  } catch (error) {
    console.error('[API History] Error fetching or processing interaction logs:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
