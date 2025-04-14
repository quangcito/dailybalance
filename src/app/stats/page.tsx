'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr'; // Import useSWR
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button'; // Import Button for period toggle
import { DailyStats, WeeklyStats } from '@/types/stats';

// --- SWR Fetcher ---
// Generic fetcher that includes the Guest ID header
const fetcher = async (url: string) => {
  const guestId = localStorage.getItem('guestId'); // Retrieve guestId from localStorage
  if (!guestId) {
    throw new Error('Guest ID not found in localStorage.');
  }

  const res = await fetch(url, {
    headers: {
      'X-Guest-ID': guestId, // Add the guest ID header
    },
  });

  if (!res.ok) {
    const errorInfo = await res.json().catch(() => ({})); // Try to parse error JSON
    const error = new Error(errorInfo.error || `An error occurred while fetching the data. Status: ${res.status}`);
    throw error;
  }

  return res.json();
};


export default function StatsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily'); // State for selected period
  const [guestId, setGuestId] = useState<string | null>(null);
  const [isGuestIdChecked, setIsGuestIdChecked] = useState<boolean>(false); // State to track if localStorage check is done

  // Get guestId from localStorage on component mount (client-side only)
   useEffect(() => {
    const storedGuestId = localStorage.getItem('guestId');
    setGuestId(storedGuestId);
    setIsGuestIdChecked(true); // Mark check as complete
  }, []);

  // Use SWR to fetch stats based on the selected period
  // The key changes when 'period' changes, triggering a re-fetch
  const swrKey = guestId ? `/api/stats?period=${period}` : null;
  const { data: statsData, error, isLoading } = useSWR<DailyStats | WeeklyStats>(swrKey, fetcher);

  // Determine display error
  const displayError = error ? (error.message || "Failed to load statistics.") : null;

  // Example calorie goal (could eventually come from user profile)
  const calorieGoal = 2300;

  // Helper to render stats based on period
  const renderStats = () => {
    if (!statsData) return null;

    if (period === 'daily') {
      const dailyStats = statsData as DailyStats;
      const dailyConsumedPercent = (dailyStats.consumedCalories / calorieGoal) * 100;
      return (
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
      );
    } else if (period === 'weekly') {
      const weeklyStats = statsData as WeeklyStats;
      return (
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
      );
    }
    return null;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Statistics</h1>

      {/* Period Toggle Buttons */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={period === 'daily' ? 'default' : 'outline'}
          onClick={() => setPeriod('daily')}
        >
          Daily
        </Button>
        <Button
          variant={period === 'weekly' ? 'default' : 'outline'}
          onClick={() => setPeriod('weekly')}
        >
          Weekly
        </Button>
      </div>

      {/* Combined Loading State (Initial ID check + SWR loading) */}
      {(!isGuestIdChecked || isLoading) && <p>Loading statistics...</p>}

      {/* Error State (only show if not loading) */}
      {isGuestIdChecked && !isLoading && displayError && <p className="text-red-500 mb-4">{displayError}</p>}

      {/* Guest ID Not Found State (only show if checked, not loading, and no guestId) */}
      {isGuestIdChecked && !isLoading && !guestId && <p className="text-orange-500 mb-4">Guest ID not found. Cannot load stats.</p>}
      {/* Success State - Render stats based on period */}
      {/* Profile Display State (only show if checked, guestId exists, statsData loaded, no error, not loading) */}
      {isGuestIdChecked && guestId && statsData && !isLoading && !displayError && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Render the appropriate stats card */}
          {renderStats()}

          {/* Placeholder for potential second card (e.g., charts, trends) */}
          {/* <Card>
            <CardHeader><CardTitle>Trends (Placeholder)</CardTitle></CardHeader>
            <CardContent><p>Charts or trend data could go here.</p></CardContent>
          </Card> */}
        </div>
      )}

      {/* No Data State (Show only if ID check done, ID exists, no error, not loading, but no data) */}
      {isGuestIdChecked && guestId && !isLoading && !displayError && !statsData && (
        <p>No statistics data available for the selected period.</p>
       )}

    </div>
  );
}
