/**
 * Represents the user's health profile information.
 */
export interface UserProfile {
  id: string; // Typically matches the auth user ID
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  name?: string;
  email?: string; // Should match auth email
  age?: number;
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  heightCm?: number;
  weightKg?: number;
  activityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  // Add other relevant health metrics as needed (e.g., dietary restrictions, allergies)
}

/**
 * Represents a specific health or fitness goal set by the user.
 */
export interface UserGoal {
  id: string;
  userId: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  type: 'nutrition' | 'exercise' | 'weight' | 'general';
  description: string;
  targetValue?: number;
  targetUnit?: string; // e.g., 'kcal', 'kg', 'minutes', 'steps'
  startDate?: string; // ISO timestamp
  endDate?: string; // ISO timestamp
  isActive: boolean;
}

/**
 * Represents a log entry for user interactions with the Answer Engine.
 */
export interface InteractionLog {
  id?: string; // Optional, DB might generate it
  userId: string;
  sessionId?: string;
  timestamp: string; // ISO timestamp
  query: string;
  llmResponse?: Record<string, any>; // Store the structured answer or relevant parts
  userFeedback?: 'positive' | 'negative' | 'neutral' | string; // Could be free text
  metadata?: Record<string, any>; // Any extra context (e.g., time of day context used)
}
