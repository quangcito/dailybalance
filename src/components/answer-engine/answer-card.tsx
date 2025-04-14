'use client';

import React from 'react';
import { StructuredAnswer, Source } from '@/types/conversation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from 'lucide-react'; // Icon for external links

interface AnswerCardProps {
  answer: StructuredAnswer;
  sources: Source[];
}

const AnswerCard: React.FC<AnswerCardProps> = ({ answer, sources }) => {
  return (
    <div className="space-y-4 text-sm"> {/* Added text-sm for base size */}
      {/* Main answer text */}
      <p className="whitespace-pre-wrap">{answer.text}</p>

      {/* Suggestions */}
      {answer.suggestions && answer.suggestions.length > 0 && (
        <div>
          <p className="font-medium text-foreground mb-1">Suggestions:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            {answer.suggestions.map((suggestion: string, index: number) => ( // Added types
              <li key={index}>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Summary (Optional Display) - No changes needed here based on prompt */}
      {/* {answer.dataSummary && (
        <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
          {JSON.stringify(answer.dataSummary, null, 2)}
        </pre>
      )} */}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="space-y-2">
            <Separator />
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="sources">
                    <AccordionTrigger className="text-xs font-medium text-muted-foreground py-2">
                        Sources ({sources.length})
                    </AccordionTrigger>
                    <AccordionContent>
                        <ul className="space-y-2 pt-1">
                            {sources.map((source: Source, index: number) => ( // Added types
                            <li key={index} className="text-xs">
                                <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline truncate"
                                title={source.url}
                                >
                                <ExternalLink size={12} className="inline-block flex-shrink-0" />
                                <span className="truncate">{source.title || source.url}</span>
                                </a>
                                {source.snippet && (
                                    <p className="text-muted-foreground italic mt-0.5 pl-4"> {/* Indent snippet */}
                                        "{source.snippet}"
                                    </p>
                                )}
                            </li>
                            ))}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
      )}
    </div>
  );
}; // Ensure this closing brace matches the component definition

export default AnswerCard;
