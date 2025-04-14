import { NextRequest, NextResponse } from 'next/server';
import { DailyStats, WeeklyStats } from '@/types/stats';
// import { UserProfile } from '@/types/user';
// import { FoodLog } from '@/types/nutrition';
// import { ExerciseLog } from '@/types/exercise';
import {
  getUserProfile,
  getDailyFoodLogs,
  getDailyExerciseLogs,
  // We might need functions to fetch logs for a date range later for weekly stats
} from '@/lib/db/supabase';
import { calculateBMR, calculateTDEE } from '@/lib/utils/calculations';
import { format, eachDayOfInterval, subDays } from 'date-fns'; // Added parseISO

// --- GET Handler ---
// Fetches daily or weekly stats for a given guest
// Expects period ('daily' or 'weekly') as a query parameter
export async function GET(req: NextRequest) {
  try {
    const guestId = req.headers.get('X-Guest-ID');
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'daily'; // Default to 'daily'

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    if (period !== 'daily' && period !== 'weekly') {
      return NextResponse.json({ error: 'Invalid period parameter. Use "daily" or "weekly".' }, { status: 400 });
    }

    console.log(`[API /api/stats] GET request for guestId: ${guestId}, period: ${period}`);

    // Fetch profile once, needed for both daily and weekly TDEE calculations
    const profile = await getUserProfile(guestId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Calculate BMR/TDEE (needed for net calories)
    let baseBmr: number | null = null;
    let baseTdee: number | null = null;
    if (profile.gender && profile.age && profile.height && profile.weight) {
      baseBmr = calculateBMR(profile); // Pass profile object
      if (baseBmr !== null && profile.activityLevel) {
        baseTdee = calculateTDEE(baseBmr, profile.activityLevel);
      }
    }

    // --- Daily Stats Logic ---
   if (period === 'daily') {
     // Get date from query param sent by frontend, fallback to server date if missing
     const targetDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');
     console.log(`[API /api/stats] Using target date for daily stats: ${targetDate}`); // Log the date being used

      // Fetch logs for the target date
     const [foodLogs, exerciseLogs] = await Promise.all([
       getDailyFoodLogs(guestId, targetDate),
       getDailyExerciseLogs(guestId, targetDate),
      ]);

      // Calculate daily totals from logs
      let consumedCalories = 0;
      let burnedCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalExerciseDuration = 0;

      foodLogs.forEach(log => {
        consumedCalories += log.calories || 0;
        totalProtein += log.macros?.protein || 0;
        totalCarbs += log.macros?.carbs || 0;
        totalFat += log.macros?.fat || 0;
      });

      exerciseLogs.forEach(log => {
        burnedCalories += log.caloriesBurned || 0;
        totalExerciseDuration += log.duration || 0;
      });

      // Calculate net calories (handle null TDEE)
      const netCalories = baseTdee !== null ? baseTdee - consumedCalories + burnedCalories : 0 - consumedCalories + burnedCalories;

      const dailyStats: DailyStats = {
        date: targetDate, // Use the determined target date
        netCalories: Math.round(netCalories),
        consumedCalories: Math.round(consumedCalories),
        burnedCalories: Math.round(burnedCalories),
        macros: {
          protein: Math.round(totalProtein),
          carbs: Math.round(totalCarbs),
          fat: Math.round(totalFat),
        },
        totalExerciseDuration: Math.round(totalExerciseDuration),
      };

      return NextResponse.json(dailyStats, { status: 200 });
    }

    // --- Weekly Stats Logic ---
    else if (period === 'weekly') {
      const today = new Date();
      const startDate = subDays(today, 6); // Start date is 6 days ago
      const endDate = today; // End date is today
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const numberOfDays = dateRange.length; // Should be 7

      console.log(`[API /api/stats] Calculating weekly stats from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);

      // Fetch logs for each day in the range
      const dailyLogPromises = dateRange.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return Promise.all([
          getDailyFoodLogs(guestId, dateStr),
          getDailyExerciseLogs(guestId, dateStr),
        ]);
      });

      const dailyLogs = await Promise.all(dailyLogPromises);

      // Aggregate totals over the week
      // @ts-ignore - ESLint incorrectly flags this as unused, but it's used in the loop below (line 145)
      let totalConsumedCalories = 0;
      // @ts-ignore - ESLint incorrectly flags this as unused, but it's used in the loop below (line 146)
      let totalBurnedCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalExerciseDuration = 0;
      let totalNetCalories = 0; // Sum of daily net calories

      dailyLogs.forEach(([foodLogs, exerciseLogs]) => {
        let dailyConsumed = 0;
        let dailyBurned = 0;

        foodLogs.forEach(log => {
          dailyConsumed += log.calories || 0;
          totalProtein += log.macros?.protein || 0;
          totalCarbs += log.macros?.carbs || 0;
          totalFat += log.macros?.fat || 0;
        });

        exerciseLogs.forEach(log => {
          dailyBurned += log.caloriesBurned || 0;
          totalExerciseDuration += log.duration || 0;
        });

        totalConsumedCalories += dailyConsumed;
        totalBurnedCalories += dailyBurned;

        // Calculate daily net calories using the base TDEE
        const dailyNet = baseTdee !== null ? baseTdee - dailyConsumed + dailyBurned : 0 - dailyConsumed + dailyBurned;
        totalNetCalories += dailyNet;
      });

      // Calculate averages
      const averageNetCalories = totalNetCalories / numberOfDays;
      const averageProtein = totalProtein / numberOfDays;
      const averageCarbs = totalCarbs / numberOfDays;
      const averageFat = totalFat / numberOfDays;

      const weeklyStats: WeeklyStats = {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        averageNetCalories: Math.round(averageNetCalories),
        averageMacros: {
          protein: Math.round(averageProtein),
          carbs: Math.round(averageCarbs),
          fat: Math.round(averageFat),
        },
        totalExerciseDuration: Math.round(totalExerciseDuration), // Total duration for the week
      };

      return NextResponse.json(weeklyStats, { status: 200 });
    }

  } catch (error) {
    console.error('[API /api/stats] GET Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
