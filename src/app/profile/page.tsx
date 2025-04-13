'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { UserProfile, ActivityLevel, Goal } from '@/types/user'; // Assuming types are defined here
import { calculateBMR, calculateTDEE } from '@/lib/utils/calculations'; // Assuming calculation utils exist

// Mock API fetching function (replace with actual API call)
const fetchProfile = async (): Promise<UserProfile> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 700));
  // Return mock data (aligning with UserProfile type)
  const mockProfileData = {
    id: 'guest-123', // Example guest ID
    name: 'Alex Doe',
    email: 'alex.doe@example.com', // Typically comes from auth, read-only here
    age: 30,
    gender: 'male', // Corrected to lowercase to match type
    height: 180, // cm
    weight: 75, // kg
    activityLevel: ActivityLevel.ModeratelyActive,
    goal: Goal.Maintenance, // Corrected enum member access
    // Calculated fields will be derived after fetch
    bmr: undefined,
    tdee: undefined,
    // Optional fields - provide defaults or leave undefined if not applicable
    dietaryPreferences: { isVegetarian: true }, // Corrected structure
    macroTargets: { protein: 150, carbs: 250, fat: 70 },
    preferences: {
        theme: 'dark' as NonNullable<UserProfile['preferences']>['theme'], // Use NonNullable
        units: 'metric' as NonNullable<UserProfile['preferences']>['units'], // Use NonNullable
        notifications: true
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Calculate BMR/TDEE based on fetched data
  // Corrected: Pass a single object argument
  const bmr = calculateBMR({
      gender: mockProfileData.gender as UserProfile['gender'], // Assert type
      weight: mockProfileData.weight,
      height: mockProfileData.height,
      age: mockProfileData.age
  });
  const tdee = calculateTDEE(bmr, mockProfileData.activityLevel);

  // Ensure the returned object conforms to UserProfile, especially gender and preferences
  const finalProfile: UserProfile = {
      ...mockProfileData,
      gender: mockProfileData.gender as UserProfile['gender'], // Assert type
      preferences: mockProfileData.preferences, // Use the already typed object
      bmr: bmr ?? undefined,
      tdee: tdee ?? undefined,
  };
  return finalProfile;
};

// Mock API submission function (replace with actual API call)
const updateProfile = async (profileData: Partial<UserProfile>): Promise<UserProfile> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("Submitting profile update:", profileData);
  // In a real scenario, this would return the updated profile from the backend
  // For mock, we'll just return the submitted data merged with some defaults
  const updatedMock = {
    id: 'guest-123',
    name: 'Alex Doe', // Assuming name isn't editable in this form
    email: 'alex.doe@example.com',
    age: 30,
    gender: 'Male',
    height: 180,
    weight: 75, // Assuming weight isn't directly edited here
    activityLevel: profileData.activityLevel || ActivityLevel.Sedentary,
    goal: profileData.goal || Goal.WeightLoss, // Corrected enum member access
    bmr: 1800, // Example static BMR/TDEE for mock return
    tdee: 2400,
    updatedAt: new Date().toISOString(),
    // Include other fields if necessary
  };
  return updatedMock as UserProfile;
};


export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Form state for editable fields
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>();
  const [goal, setGoal] = useState<Goal | undefined>();

  // Fetch profile data on mount
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchProfile();
        setProfile(data);
        // Initialize form state with fetched data
        setActivityLevel(data.activityLevel);
        setGoal(data.goal);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
        setError("Failed to load profile data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSubmitSuccess(false);

    const updatedData: Partial<UserProfile> = {
      activityLevel: activityLevel,
      goal: goal,
    };

    try {
      const updatedProfile = await updateProfile(updatedData);
      setProfile(updatedProfile); // Update local state with response
      setSubmitSuccess(true);
      // Optionally reset form state if needed, but usually keep it reflecting current state
      // setActivityLevel(updatedProfile.activityLevel);
      // setGoal(updatedProfile.goal);
    } catch (err) {
      console.error("Failed to update profile:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setIsSubmitting(false);
      // Hide success message after a delay
      if (submitSuccess) {
          setTimeout(() => setSubmitSuccess(false), 3000);
      }
    }
  };

  // Recalculate BMR/TDEE if relevant inputs change (weight, height, age, gender, activityLevel)
  // For this form, only activityLevel is editable, so we only need to recalculate TDEE
  const recalculatedTDEE = profile?.bmr ? calculateTDEE(profile.bmr, activityLevel || ActivityLevel.Sedentary) : undefined;


  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      {isLoading && <p>Loading profile...</p>}
      {error && !isSubmitting && <p className="text-red-500 mb-4">{error}</p>}

      {profile && !isLoading && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
              <CardDescription>View and update your profile details and goals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label htmlFor="bmr">Estimated BMR (Basal Metabolic Rate)</Label>
                  <Input id="bmr" value={profile.bmr ? `${Math.round(profile.bmr)} kcal` : 'N/A'} readOnly disabled />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="tdee">Estimated TDEE (Total Daily Energy Expenditure)</Label>
                  <Input id="tdee" value={recalculatedTDEE ? `${Math.round(recalculatedTDEE)} kcal` : 'N/A'} readOnly disabled />
                  <p className="text-xs text-muted-foreground">Based on your profile and selected activity level.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="activityLevel">Activity Level</Label>
                  <Select
                    value={activityLevel}
                    onValueChange={(value) => setActivityLevel(value as ActivityLevel)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="activityLevel">
                      <SelectValue placeholder="Select activity level" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ActivityLevel).map((level) => (
                        <SelectItem key={level} value={level}>
                          {/* Simple formatting for display */}
                          {level.replace(/([A-Z])/g, ' $1').trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal">Weight Goal</Label>
                   <Select
                    value={goal}
                    onValueChange={(value) => setGoal(value as Goal)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="goal">
                      <SelectValue placeholder="Select weight goal" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Goal).map((g) => (
                        <SelectItem key={g} value={g}>
                           {/* Simple formatting for display */}
                          {g.replace(/([A-Z])/g, ' $1').trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
                {submitSuccess && <p className="text-sm text-green-600">Profile updated successfully!</p>}
                {error && isSubmitting && <p className="text-sm text-red-500">{error}</p>}
                <span></span> {/* Spacer */}
               <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
