import { NextRequest, NextResponse } from 'next/server';
import { UserProfile } from '@/types/user';
// Import profile functions from Supabase lib
import { getUserProfile, updateUserProfile, saveGuestProfile } from '@/lib/db/supabase';
import { calculateBMR, calculateTDEE } from '@/lib/utils/calculations'; // Import calculation utils

// --- GET Handler ---
export async function GET(req: NextRequest) {
  try {
    const guestId = req.headers.get('X-Guest-ID');

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    console.log(`[API /api/profile] GET request for guestId: ${guestId}`);

    const profile = await getUserProfile(guestId);

    if (!profile) {
      console.log(`[API /api/profile] Profile not found for guestId: ${guestId}`);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Calculate BMR and TDEE
    let bmrResult: number | null = null;
    let tdeeResult: number | null = null;

    if (profile.gender && profile.age && profile.height && profile.weight) {
      // Pass profile subset as a single object
      bmrResult = calculateBMR({
        gender: profile.gender,
        age: profile.age,
        height: profile.height,
        weight: profile.weight,
      });
      if (bmrResult !== null && profile.activityLevel) {
        tdeeResult = calculateTDEE(bmrResult, profile.activityLevel);
      }
    } else {
        console.warn(`[API /api/profile] Cannot calculate BMR/TDEE due to missing profile data for guestId: ${guestId}`);
    }


    // Add calculated values (converting null to undefined) to the profile object to return
    const profileWithCalculations: UserProfile = {
      ...profile,
      bmr: bmrResult === null ? undefined : bmrResult,
      tdee: tdeeResult === null ? undefined : tdeeResult,
    };

    console.log(`[API /api/profile] Successfully fetched profile for guestId: ${guestId}. Returning:`, profileWithCalculations); // Log the response data
    return NextResponse.json(profileWithCalculations, { status: 200 });

  } catch (error) {
    console.error('[API /api/profile] GET Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}

// --- PUT Handler ---
export async function PUT(req: NextRequest) {
  console.log('[API /api/profile] Received PUT request'); // <-- Add this log
  try {
    const guestId = req.headers.get('X-Guest-ID');

    if (!guestId) {
      return NextResponse.json({ error: 'Missing X-Guest-ID header' }, { status: 400 });
    }

    let profileData: Partial<UserProfile>;
    try {
      profileData = await req.json();
    } catch (parseError) {
      console.error('[API /api/profile] PUT Error parsing request body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Optional: Add more specific validation for profileData fields here if needed
    // e.g., check types, ranges, allowed values for goal/activityLevel

    console.log(`[API /api/profile] PUT request to update profile for guestId: ${guestId}`);

    const updatedProfile = await updateUserProfile(guestId, profileData);

    if (!updatedProfile) {
      // This could be due to the profile not existing or a DB update error
      console.log(`[API /api/profile] Failed to update profile or profile not found for guestId: ${guestId}`);
      // Check if profile exists first? Or just return 404 assuming it should exist for an update.
      return NextResponse.json({ error: 'Profile not found or update failed' }, { status: 404 }); // Or 500 if update failed for other reasons
    }

    // Recalculate BMR/TDEE for the updated profile before returning
    let bmrResult: number | null = null;
    let tdeeResult: number | null = null;

    if (updatedProfile.gender && updatedProfile.age && updatedProfile.height && updatedProfile.weight) {
      bmrResult = calculateBMR({
        gender: updatedProfile.gender,
        age: updatedProfile.age,
        height: updatedProfile.height,
        weight: updatedProfile.weight,
      });
      if (bmrResult !== null && updatedProfile.activityLevel) {
        tdeeResult = calculateTDEE(bmrResult, updatedProfile.activityLevel);
      }
    }

    const finalUpdatedProfile: UserProfile = {
      ...updatedProfile,
      bmr: bmrResult === null ? undefined : bmrResult,
      tdee: tdeeResult === null ? undefined : tdeeResult,
    };


    console.log(`[API /api/profile] Successfully updated profile for guestId: ${guestId}`);
    return NextResponse.json(finalUpdatedProfile, { status: 200 }); // Return updated profile with calculations

  } catch (error) {
    console.error('[API /api/profile] PUT Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}

// POST handler removed as per plan (replaced by PUT) - Re-adding for initial guest creation

// --- POST Handler (for creating new profiles) ---
export async function POST(req: NextRequest) {
  console.log('[API /api/profile] Received POST request');
  try {
    let body: { guestId: string; profileData: Partial<UserProfile> };
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[API /api/profile] POST Error parsing request body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { guestId, profileData } = body;

    if (!guestId || !profileData) {
      return NextResponse.json({ error: 'Missing guestId or profileData in request body' }, { status: 400 });
    }

    console.log(`[API /api/profile] POST request to create profile for guestId: ${guestId}`);

    // Use saveGuestProfile for creating the initial profile
    await saveGuestProfile(guestId, profileData); // saveGuestProfile returns void or throws error

    // Since saveGuestProfile doesn't return the profile, we just return success status
    // The frontend already has the profile data optimistically.
    // If we needed to return the full profile with calculated fields,
    // we would call getUserProfile here after saving.

    console.log(`[API /api/profile] Successfully created profile for guestId: ${guestId}`);
    return NextResponse.json({ message: 'Profile created successfully' }, { status: 201 }); // 201 Created status

  } catch (error) {
    console.error('[API /api/profile] POST Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
