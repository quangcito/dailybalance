export interface ExerciseLog {
  id: string;
  userId: string;

  // Exercise details
  name: string;
  type: 'cardio' | 'strength' | 'flexibility' | 'sports' | 'other';
  duration: number; // in minutes
  intensity: 'light' | 'moderate' | 'vigorous';

  // For strength exercises
  strengthDetails?: {
    sets?: number;
    reps?: number;
    weight?: number; // in kg
  };

  // For cardio exercises
  cardioDetails?: {
    distance?: number; // in km
    pace?: number; // in min/km
    heartRate?: number; // in bpm
  };

  // Calories and energy
  caloriesBurned: number;

  // Metadata
  loggedAt: string; // ISO timestamp
  date: string; // YYYY-MM-DD

  // Source of data
  source?: 'user-input' | 'ai-logging' | 'fitness-tracker';

  createdAt: string;
  updatedAt: string;
}
