'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DailyStats, WeeklyStats } from '@/types/stats'; // Assuming types are defined here

// Mock API fetching functions (replace with actual API calls)
const fetchDailyStats = async (): Promise<DailyStats> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  // Return mock data (Corrected: removed duplicate properties)
  return {
    date: new Date().toISOString().split('T')[0],
    // Example values based on comments during previous attempt:
    // Assume TDEE is 2300. Consumed 2200, Burned 400.
    // Net = TDEE - Consumed + Burned = 2300 - 2200 + 400 = 500 surplus.
    consumedCalories: 2200,
    burnedCalories: 400,
    netCalories: 500,
    macros: {
      protein: 150, // grams
      carbs: 250,   // grams
      fat: 70,      // grams
    },
    totalExerciseDuration: 60, // minutes
  };
};

const fetchWeeklyStats = async (): Promise<WeeklyStats> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  // Return mock data
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);

  return {
    startDate: weekAgo.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    averageNetCalories: 450,
    averageMacros: {
      protein: 145,
      carbs: 260,
      fat: 75,
    },
    totalExerciseDuration: 320, // minutes
  };
};


export default function StatsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch in parallel
        const [dailyData, weeklyData] = await Promise.all([
          fetchDailyStats(),
          fetchWeeklyStats(),
        ]);
        setDailyStats(dailyData);
        setWeeklyStats(weeklyData);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
        setError("Failed to load statistics. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []); // Run only on mount

  // Calculate progress for visualization (example: % of 2300 kcal goal)
  const calorieGoal = 2300; // Example goal, could come from profile
  const dailyConsumedPercent = dailyStats ? (dailyStats.consumedCalories / calorieGoal) * 100 : 0;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Statistics</h1>

      {/* Conditional Rendering for Loading State */}
      {isLoading && <p>Loading statistics...</p>}

      {/* Conditional Rendering for Error State */}
      {error && <p className="text-red-500">{error}</p>}

      {/* Conditional Rendering for Success State */}
      {!isLoading && !error && dailyStats && weeklyStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Today's Summary ({dailyStats.date})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-semibold">Net Calories:</p>
                <p className="text-2xl">{dailyStats.netCalories} kcal</p>
                <p className="text-sm text-muted-foreground">
                  (Consumed: {dailyStats.consumedCalories} kcal - Burned: {dailyStats.burnedCalories} kcal)
                  {/* Assuming TDEE is implicitly part of Net calculation */}
                </p>
              </div>
              <div>
                <p className="font-semibold">Calorie Consumption Progress:</p>
                <Progress value={dailyConsumedPercent} className="w-full" />
                <p className="text-sm text-muted-foreground">{dailyStats.consumedCalories} / {calorieGoal} kcal goal</p>
              </div>
              <div>
                <p className="font-semibold">Macronutrients:</p>
                <ul className="list-disc list-inside text-sm">
                  <li>Protein: {dailyStats.macros.protein} g</li>
                  <li>Carbs: {dailyStats.macros.carbs} g</li>
                  <li>Fat: {dailyStats.macros.fat} g</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Total Exercise:</p>
                <p>{dailyStats.totalExerciseDuration} minutes</p>
              </div>
            </CardContent>
          </Card>

          {/* Weekly Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary ({weeklyStats.startDate} to {weeklyStats.endDate})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-semibold">Average Net Calories:</p>
                <p className="text-2xl">{weeklyStats.averageNetCalories} kcal / day</p>
              </div>
              <div>
                <p className="font-semibold">Average Macronutrients (per day):</p>
                <ul className="list-disc list-inside text-sm">
                  <li>Protein: {weeklyStats.averageMacros.protein} g</li>
                  <li>Carbs: {weeklyStats.averageMacros.carbs} g</li>
                  <li>Fat: {weeklyStats.averageMacros.fat} g</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Total Weekly Exercise:</p>
                <p>{weeklyStats.totalExerciseDuration} minutes</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
