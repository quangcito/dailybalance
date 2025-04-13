import { UserProfile } from '@/types/user';

/**
 * Calculates Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 * @param profile - The user profile containing age, gender, height, and weight.
 * @returns The calculated BMR in calories per day, or null if essential data is missing.
 */
export function calculateBMR(profile: Pick<UserProfile, 'age' | 'gender' | 'height' | 'weight'>): number | null {
  const { age, gender, height, weight } = profile;

  if (!age || !gender || !height || !weight) {
    console.warn('Missing required data for BMR calculation:', { age, gender, height, weight });
    return null; // Cannot calculate without essential data
  }

  // Mifflin-St Jeor Equation:
  // For men: BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age (years) + 5
  // For women: BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age (years) - 161

  // Assuming height is in cm and weight is in kg as per standard formulas.
  // Adjust if the UserProfile stores them differently (e.g., inches, lbs).
  // The current UserProfile type just says 'number', so we assume metric for now.
  // TODO: Add unit conversion if necessary based on how data is stored/inputted.

  let bmr: number;

  if (gender.toLowerCase() === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else if (gender.toLowerCase() === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    // Handle non-binary or other genders - using an average or a different formula might be appropriate.
    // For simplicity, let's average the male and female offsets (+5 and -161) -> ~ -78
    // This is a placeholder and might need refinement based on product requirements.
    console.warn(`Calculating BMR for gender "${gender}" using an averaged formula.`);
    bmr = 10 * weight + 6.25 * height - 5 * age - 78;
  }

  return Math.round(bmr);
}

/**
 * Defines activity level multipliers for TDEE calculation.
 */
const activityLevelMultipliers: { [key: string]: number } = {
  sedentary: 1.2, // Little or no exercise
  lightly_active: 1.375, // Light exercise/sports 1-3 days/week
  moderately_active: 1.55, // Moderate exercise/sports 3-5 days/week
  very_active: 1.725, // Hard exercise/sports 6-7 days a week
  extra_active: 1.9, // Very hard exercise/sports & physical job
};

/**
 * Calculates Total Daily Energy Expenditure (TDEE).
 * @param bmr - The Basal Metabolic Rate.
 * @param activityLevel - The user's activity level (e.g., 'sedentary', 'lightly_active').
 * @returns The calculated TDEE in calories per day, or the BMR if activity level is unknown.
 */
export function calculateTDEE(bmr: number | null, activityLevel: UserProfile['activityLevel']): number | null {
  if (bmr === null) {
    return null;
  }

  const level = activityLevel?.toLowerCase() || 'sedentary'; // Default to sedentary if null/undefined
  const multiplier = activityLevelMultipliers[level];

  if (!multiplier) {
    console.warn(`Unknown activity level: "${activityLevel}". Defaulting TDEE multiplier to 1.2 (sedentary).`);
    return Math.round(bmr * 1.2);
  }

  return Math.round(bmr * multiplier);
}
