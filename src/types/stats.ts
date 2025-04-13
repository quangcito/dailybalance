// src/types/stats.ts

/**
 * Represents key statistics for a single day.
 */
export interface DailyStats {
  date: string; // Format: YYYY-MM-DD
  netCalories: number; // TDEE - consumedCalories + burnedCalories
  consumedCalories: number;
  burnedCalories: number;
  macros: {
    protein: number; // grams
    carbs: number;   // grams
    fat: number;     // grams
  };
  totalExerciseDuration: number; // minutes
}

/**
 * Represents aggregated statistics over a week.
 */
export interface WeeklyStats {
  startDate: string; // Format: YYYY-MM-DD
  endDate: string;   // Format: YYYY-MM-DD
  averageNetCalories: number;
  averageMacros: {
    protein: number; // average grams per day
    carbs: number;   // average grams per day
    fat: number;     // average grams per day
  };
  totalExerciseDuration: number; // total minutes for the week
}
