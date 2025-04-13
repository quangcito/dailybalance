'use client'; // Required for hooks like useState, useEffect

import React, { useState, useEffect, FormEvent } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import QueryInput from '@/components/answer-engine/query-input'; // Assuming path
import AnswerCard from '@/components/answer-engine/answer-card'; // Assuming path
import { ConversationMessage, UserMessage, SystemMessage, StructuredAnswer, Source } from '@/types/conversation';

export default function Home() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Effect to manage conversation ID persistence
  useEffect(() => {
    // Check if running in the browser
    if (typeof window !== 'undefined') {
      let currentId = sessionStorage.getItem('conversationId');
      if (!currentId) {
        currentId = uuidv4();
        sessionStorage.setItem('conversationId', currentId);
      }
      setConversationId(currentId);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleSubmit = async (query: string) => {
    if (!query.trim() || isLoading || !conversationId) {
      return; // Prevent empty submissions or multiple requests
    }

    setIsLoading(true);
    setError(null);

    const userMessage: UserMessage = {
      role: 'user',
      query: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    // --- Placeholder for API Call ---
    console.log(`Submitting query: "${query}" with conversationId: ${conversationId}`);
    // Replace with actual fetch call to '/api/conversation'
    // Example structure:
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // TODO: Replace with actual user ID from authentication context/hook
          userId: 'user_placeholder_123',
          query: query,
          sessionId: conversationId, // Pass the conversationId as sessionId
        }),
      });

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error || errorData.details || errorDetails;
        } catch (jsonError) {
          // If response is not JSON, use the status text
          errorDetails = response.statusText || errorDetails;
        }
        throw new Error(errorDetails);
      }

      // Type assertion for the expected response structure
      const data = (await response.json()) as { answer: StructuredAnswer, sources: Source[] };



      const systemMessage: SystemMessage = {
        role: 'system',
        answer: data.answer,
        sources: data.sources,
        timestamp: new Date().toISOString(),
      };
      setMessages((prevMessages) => [...prevMessages, systemMessage]);

    } catch (err) {
      console.error("API call failed:", err);
      setError(err instanceof Error ? err.message : 'Failed to get answer.');
    } finally {
      setIsLoading(false);
    }
    // --- End Placeholder ---
  };

  return (
    <div className="flex flex-col h-screen p-4 bg-gray-50 dark:bg-gray-900">
      {/* Header (Optional) */}
      {/* <header className="p-4 border-b dark:border-gray-700">
        <h1 className="text-xl font-semibold">DailyBalance</h1>
      </header> */}

      {/* Message History */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xl p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
              {msg.role === 'user' ? (
                <p>{msg.query}</p>
              ) : (
                // Pass structured answer and sources to AnswerCard
                <AnswerCard answer={msg.answer} sources={msg.sources} />
              )}
              <p className="text-xs text-right opacity-70 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start">
             <div className="max-w-xl p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse">
               Thinking...
             </div>
          </div>
        )}
         {/* Error Message */}
         {error && (
          <div className="flex justify-start">
             <div className="max-w-xl p-3 rounded-lg bg-red-100 border border-red-400 text-red-700">
               <p><strong>Error:</strong> {error}</p>
             </div>
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 border-t dark:border-gray-700">
        <QueryInput onSubmit={handleSubmit} disabled={isLoading} />
      </footer>
    </div>
  );
}
