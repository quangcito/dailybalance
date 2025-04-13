'use client';

import React from 'react';
import { StructuredAnswer, Source } from '@/types/conversation';

interface AnswerCardProps {
  answer: StructuredAnswer;
  sources: Source[];
}

const AnswerCard: React.FC<AnswerCardProps> = ({ answer, sources }) => {
  return (
    <div className="space-y-3">
      {/* Main answer text */}
      <p className="whitespace-pre-wrap">{answer.text}</p>

      {/* Suggestions */}
      {answer.suggestions && answer.suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Suggestions:</p>
          <ul className="list-disc list-inside space-y-1">
            {answer.suggestions.map((suggestion, index) => (
              <li key={index} className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                {/* TODO: Make suggestions clickable */}
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Summary (Optional Display) */}
      {/* Consider how to best display answer.dataSummary if needed */}
      {/* {answer.dataSummary && (
        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-2 overflow-x-auto">
          {JSON.stringify(answer.dataSummary, null, 2)}
        </pre>
      )} */}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-300 dark:border-gray-600">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sources:</p>
          <ul className="space-y-1">
            {sources.map((source, index) => (
              <li key={index} className="text-xs">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate block"
                  title={source.url}
                >
                  {source.title || source.url}
                </a>
                {source.snippet && <p className="text-gray-500 dark:text-gray-400 italic mt-0.5">"{source.snippet}"</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AnswerCard;
