import { Source, StructuredAnswer } from './conversation'; // Import Source and StructuredAnswer

// Define Enums based on string literal unions used below
export enum ActivityLevel {
  Sedentary = 'sedentary',
  LightlyActive = 'lightly_active',
  ModeratelyActive = 'moderately_active',
  VeryActive = 'very_active',
  ExtraActive = 'extra_active',
}

export enum Goal {
  WeightLoss = 'weight-loss',
  Maintenance = 'maintenance',
  MuscleGain = 'muscle-gain',
  Performance = 'performance',
  GeneralHealth = 'general-health',
}


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
  goal?: Goal; // Use Goal enum
  activityLevel?: ActivityLevel; // Use ActivityLevel enum

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
