'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr'; // Import useSWR
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { UserProfile, ActivityLevel, Goal } from '@/types/user';
import { calculateTDEE } from '@/lib/utils/calculations';

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

// --- Actual API Update Function ---
const handleProfileUpdate = async (guestId: string, profileData: Partial<UserProfile>): Promise<UserProfile> => {
    console.log("Submitting profile update via API:", profileData, "for guestId:", guestId);

    const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Guest-ID': guestId,
        },
        body: JSON.stringify(profileData),
    });

    if (!res.ok) {
        const errorInfo = await res.json().catch(() => ({}));
        throw new Error(errorInfo.error || `API Error: ${res.status}`);
    }

    const updatedProfile = await res.json();
    return updatedProfile;
};


export default function ProfilePage() {
  const [guestId, setGuestId] = useState<string | null>(null);
  const [isGuestIdChecked, setIsGuestIdChecked] = useState<boolean>(false); // State to track if localStorage check is done

  // Get guestId from localStorage on component mount (client-side only)
  useEffect(() => {
    const storedGuestId = localStorage.getItem('guestId');
    setGuestId(storedGuestId);
    setIsGuestIdChecked(true); // Mark check as complete
  }, []);

  // Use SWR to fetch profile data - only fetch if guestId is available
  const { data: profile, error: fetchError, isLoading, mutate } = useSWR<UserProfile>(
    guestId ? '/api/profile' : null, // Conditional fetching: only fetch if guestId exists
    fetcher // Use the fetcher with header logic
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Form state for editable fields - initialize when profile data loads
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>();
  const [goal, setGoal] = useState<Goal | undefined>();

  // Effect to update form state when profile data is fetched/updated
  useEffect(() => {
    console.log("[ProfilePage Effect] Profile data received:", profile); // Log received profile
    if (profile) {
      console.log("[ProfilePage Effect] Setting activityLevel:", profile.activityLevel); // Log value being set
      console.log("[ProfilePage Effect] Setting goal:", profile.goal); // Log value being set
      setActivityLevel(profile.activityLevel);
      setGoal(profile.goal);
    }
  }, [profile]); // Re-run when profile data changes

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!guestId) {
        setSubmitError("Cannot update profile: Guest ID is missing.");
        return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const updatedData: Partial<UserProfile> = {
      activityLevel: activityLevel,
      goal: goal,
    };

    try {
      // Use SWR mutate with the actual API update function
      await mutate(handleProfileUpdate(guestId, updatedData), {
        optimisticData: { ...profile, ...updatedData } as UserProfile, // Optimistically update UI
        rollbackOnError: true, // Rollback optimistic update if API call fails
        populateCache: true, // Update cache with the result of handleProfileUpdate promise
        revalidate: false, // Prevent immediate revalidation after successful update
      });

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000); // Hide success message

    } catch (err) {
      console.error("Failed to update profile:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to save changes. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recalculate TDEE based on form state if BMR exists
  const recalculatedTDEE = profile?.bmr ? calculateTDEE(profile.bmr, activityLevel || ActivityLevel.Sedentary) : undefined;

  // Determine display error
  const displayError = fetchError ? (fetchError.message || "Failed to load profile data.") : null;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      {/* Combined Loading State */}
      {(!isGuestIdChecked || isLoading) && <p>Loading profile...</p>}

      {/* Error State (only show if not loading) */}
      {isGuestIdChecked && !isLoading && displayError && <p className="text-red-500 mb-4">{displayError}</p>}

      {/* Guest ID Not Found State (only show if checked, not loading, and no guestId) */}
      {isGuestIdChecked && !isLoading && !guestId && <p className="text-orange-500 mb-4">Guest ID not found. Please ensure you have started a session.</p>}

      {/* Profile Display State (only show if checked, guestId exists, profile loaded, no error, not loading) */}
      {isGuestIdChecked && guestId && profile && !isLoading && !displayError && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
              <CardDescription>View and update your profile details and goals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Read-only fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={profile.name || ''} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profile.email || ''} readOnly disabled />
                </div>
              </div>

              {/* Calculated fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label htmlFor="bmr">Estimated BMR</Label>
                  <Input id="bmr" value={profile.bmr ? `${Math.round(profile.bmr)} kcal` : 'N/A'} readOnly disabled />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="tdee">Estimated TDEE</Label>
                  {/* Display TDEE based on form's activity level */}
                  <Input id="tdee" value={recalculatedTDEE ? `${Math.round(recalculatedTDEE)} kcal` : 'N/A'} readOnly disabled />
                  <p className="text-xs text-muted-foreground">Based on your profile and selected activity level.</p>
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="activityLevel">Activity Level</Label>
                  <Select
                    key={`activity-${activityLevel}`} // Add key based on state
                    value={activityLevel} // Bind back to local state
                    onValueChange={(value) => setActivityLevel(value as ActivityLevel)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="activityLevel">
                      <SelectValue placeholder="Select activity level" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ActivityLevel).map((level) => (
                        <SelectItem key={level} value={level}>
                          {level.replace(/([A-Z])/g, ' $1').trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal">Weight Goal</Label>
                   <Select
                    key={`goal-${goal}`} // Add key based on state
                    value={goal} // Bind back to local state
                    onValueChange={(value) => setGoal(value as Goal)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="goal">
                      <SelectValue placeholder="Select weight goal" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Goal).map((g) => (
                        <SelectItem key={g} value={g}>
                           {g.replace(/([A-Z])/g, ' $1').trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
                {/* Display submission status */}
                <div>
                    {submitSuccess && <p className="text-sm text-green-600">Profile updated successfully!</p>}
                    {submitError && <p className="text-sm text-red-500">{submitError}</p>}
                </div>
               <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !guestId}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
