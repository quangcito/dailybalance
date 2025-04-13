export interface FoodLog {
  id: string;
  userId: string;

  // Food details
  name: string;
  description?: string;
  portionSize?: string;

  // Nutrition information
  calories: number;
  macros?: {
    protein: number; // in grams
    carbs: number; // in grams
    fat: number; // in grams
    fiber?: number; // in grams
    sugar?: number; // in grams
  };

  // Micronutrients (optional)
  micronutrients?: {
    [key: string]: number; // name: amount
  };

  // Metadata
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  loggedAt: string; // ISO timestamp
  date: string; // YYYY-MM-DD

  // Source of data
  source?: 'user-input' | 'ai-logging' | 'database';

  createdAt: string;
  updatedAt: string;
}
