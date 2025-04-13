import { Source, StructuredAnswer } from './conversation'; // Import Source and StructuredAnswer

export interface UserProfile {
  id: string;
  email: string;
  name: string;

  // Physical characteristics
  age?: number;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  height?: number; // in cm
  weight?: number; // in kg

  // Health goals
  goal?: 'weight-loss' | 'maintenance' | 'muscle-gain' | 'performance' | 'general-health'; // Note: DB might use different strings here too
  activityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active'; // Updated to match DB enum

  // Dietary preferences
  dietaryPreferences?: {
    isVegetarian?: boolean;
    isVegan?: boolean;
    isGlutenFree?: boolean;
    isDairyFree?: boolean;
    allergies?: string[];
    avoidedFoods?: string[];
    preferredFoods?: string[];
  };

  // Calculated values
  bmr?: number; // Basal Metabolic Rate
  tdee?: number; // Total Daily Energy Expenditure

  // Macro targets
  macroTargets?: {
    protein: number; // percentage
    carbs: number; // percentage
    fat: number; // percentage
  };

  // App preferences
  preferences?: {
    units: 'metric' | 'imperial';
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
  };

  createdAt: string;
  updatedAt: string;
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
  llmResponse?: StructuredAnswer; // Use the specific type
  sources?: Source[]; // NEW: Store sources used for this response
  userFeedback?: 'positive' | 'negative' | 'neutral' | string; // Could be free text
  metadata?: Record<string, any>; // Any extra context (e.g., time of day context used)
}
