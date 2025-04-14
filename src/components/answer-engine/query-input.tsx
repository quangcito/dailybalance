'use client';

import React, { useState, FormEvent } from 'react';
import { Input } from '@/components/ui/input'; // Shadcn Input
import { Button } from '@/components/ui/button'; // Shadcn Button
import { Send } from 'lucide-react'; // Icon

interface QueryInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const QueryInput: React.FC<QueryInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = "Log meals/workouts, check your balance, or ask for recommendations...",
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim() || disabled) return;
    onSubmit(query);
    setQuery(''); // Clear input after submission
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1" // Let input take available space
        aria-label="Chat input"
      />
      <Button
        type="submit"
        disabled={disabled || !query.trim()}
        size="icon" // Use icon size for button
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
};

export default QueryInput;
