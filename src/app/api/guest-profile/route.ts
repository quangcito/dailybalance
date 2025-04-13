import { NextRequest, NextResponse } from 'next/server';
import { UserProfile } from '@/types/user';
import { saveGuestProfile } from '@/lib/db/supabase';

interface RequestBody {
  guestId: string;
  profileData: Partial<UserProfile>;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { guestId, profileData } = body;

    if (!guestId || !profileData) {
      return NextResponse.json({ error: 'Missing guestId or profileData' }, { status: 400 });
    }

    // Basic validation on profileData if needed (e.g., check age type)
    if (typeof profileData.age !== 'number' && profileData.age !== undefined) {
        return NextResponse.json({ error: 'Invalid profile data: age must be a number or undefined' }, { status: 400 });
    }
    // Add more validation as necessary...

    console.log(`[API /api/guest-profile] Received request to save profile for guestId: ${guestId}`);

    await saveGuestProfile(guestId, profileData);

    console.log(`[API /api/guest-profile] Successfully saved profile for guestId: ${guestId}`);
    // Return a success response, perhaps just status 201 or the saved profile ID
    return NextResponse.json({ message: 'Guest profile saved successfully', guestId: guestId }, { status: 201 });

  } catch (error) {
    console.error('[API /api/guest-profile] Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // Check for specific Supabase errors if needed (e.g., duplicate key)
    // For now, return a generic 500
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
