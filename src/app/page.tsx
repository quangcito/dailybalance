'use client'; // Required for hooks like useState, useEffect

import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import QueryInput from '@/components/answer-engine/query-input';
import AnswerCard from '@/components/answer-engine/answer-card';
import { ConversationMessage, UserMessage, SystemMessage, StructuredAnswer, Source } from '@/types/conversation';
import { UserProfile } from '@/types/user'; // Import UserProfile type
// Helper function to format date headers
const formatDateHeader = (dateString: string): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const messageDate = new Date(dateString + 'T00:00:00'); // Ensure comparison is based on date part

  // Reset time parts for accurate date comparison
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);
  messageDate.setHours(0, 0, 0, 0);

  if (messageDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (messageDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  return messageDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};


export default function Home() {
  // Existing state
  const [conversationId, setConversationId] = useState<string | null>(null); // Session ID for chat history
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Guest Mode State
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestProfile, setGuestProfile] = useState<Partial<UserProfile> | null>(null); // Store collected profile data
  const [showOnboarding, setShowOnboarding] = useState<boolean>(true); // Show onboarding form by default
  // Effect to manage conversation ID and Guest ID/Profile persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Conversation ID (Session based)
      let currentSessionId = sessionStorage.getItem('conversationId');
      if (!currentSessionId) {
        currentSessionId = uuidv4();
        sessionStorage.setItem('conversationId', currentSessionId);
      }
      setConversationId(currentSessionId);

      // Load chat history from sessionStorage
      const storedMessages = sessionStorage.getItem(`chatHistory_${currentSessionId}`);
      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages);
          if (Array.isArray(parsedMessages)) {
            setMessages(parsedMessages);
          } else {
             console.warn("Stored chat history is not an array:", parsedMessages);
             sessionStorage.removeItem(`chatHistory_${currentSessionId}`); // Clear invalid data
          }
        } catch (e) {
          console.error("Failed to parse chat history from sessionStorage", e);
          sessionStorage.removeItem(`chatHistory_${currentSessionId}`); // Clear corrupted data
        }
      }
      // Guest ID & Profile (Persistent)
      const storedGuestId = localStorage.getItem('guestId');
      if (storedGuestId) {
        setGuestId(storedGuestId);
        const storedProfile = localStorage.getItem(`guestProfile_${storedGuestId}`);
        if (storedProfile) {
          try {
            setGuestProfile(JSON.parse(storedProfile));
          } catch (e) {
            console.error("Failed to parse guest profile from localStorage", e);
            localStorage.removeItem(`guestProfile_${storedGuestId}`); // Clear corrupted data
            localStorage.removeItem('guestId'); // Force re-onboarding
            setShowOnboarding(true); // Show onboarding if profile is corrupt
            setGuestId(null); // Reset guestId state
            setGuestProfile(null); // Reset guestProfile state
            return; // Exit early
          }
        }
        setShowOnboarding(false); // Existing guest, hide onboarding
      } else {
        setShowOnboarding(true); // New guest, show onboarding
      }
    }
  }, []); // Runs once on mount

  // Handler for the guest onboarding form submission
  const handleGuestProfileSubmit = async (profileData: Partial<UserProfile>) => { // Make async
    if (typeof window !== 'undefined') {
      const newGuestId = uuidv4();

      // Optimistically update state and localStorage first
      setGuestId(newGuestId);
      setGuestProfile(profileData);
      localStorage.setItem('guestId', newGuestId);
      localStorage.setItem(`guestProfile_${newGuestId}`, JSON.stringify(profileData));

      // Now, try to save the profile to the backend
      try {
        console.log(`[handleGuestProfileSubmit] Attempting to save profile to backend for guestId: ${newGuestId}`);
        const response = await fetch('/api/guest-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guestId: newGuestId,
            profileData: profileData,
          }),
        });

        if (!response.ok) {
          // Attempt to parse error details from backend
          let errorDetails = `Failed to save guest profile. Status: ${response.status}`;
          try {
              const errorData = await response.json();
              errorDetails = errorData.error || errorData.details || errorDetails;
          } catch (jsonError) {
              errorDetails = response.statusText || errorDetails;
          }
          throw new Error(errorDetails);
        }

        console.log(`[handleGuestProfileSubmit] Profile saved successfully for guestId: ${newGuestId}`);
        setShowOnboarding(false); // Hide onboarding only after successful save

      } catch (error) {
        console.error("Error saving guest profile to backend:", error);
        // Inform user, but allow them to continue with localStorage data for the session
        alert(`Could not save your profile preferences due to an error: ${error instanceof Error ? error.message : 'Unknown error'}. You can continue as a guest for this session, but your preferences won't be saved for next time unless you refresh and try again.`);
        // Decide if we should revert localStorage/state here or let them proceed.
        // For now, let them proceed with the session using localStorage data.
        setShowOnboarding(false); // Still hide onboarding to allow chat
      }
    }
  };
  // Handler for submitting a chat query
  const handleSubmit = async (query: string) => {
    // Ensure guestId is available before submitting
    if (!query.trim() || isLoading || !conversationId || !guestId) {
      setError("Guest session not initialized properly. Please refresh.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const userMessage: UserMessage = {
      role: 'user',
      query: query,
      timestamp: new Date().toISOString(),
    };
    // Update state and sessionStorage
    const updatedMessagesUser = [...messages, userMessage];
    setMessages(updatedMessagesUser);
    if (conversationId) {
        sessionStorage.setItem(`chatHistory_${conversationId}`, JSON.stringify(updatedMessagesUser));
    }
    // --- Placeholder for API Call ---
    console.log(`Submitting query: "${query}" with conversationId: ${conversationId}`);
    // Replace with actual fetch call to '/api/conversation'
    // Example structure:
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: guestId, // Use guestId as the userId
          query: query,
          sessionId: conversationId,
          guestProfileData: guestProfile, // Send collected guest profile data
        }),
      });

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error || errorData.details || errorDetails;
        } catch (jsonError) {
          // If response is not JSON, use the status text
          errorDetails = response.statusText || errorDetails;
        }
        throw new Error(errorDetails);
      }

      // Type assertion for the expected response structure
      const data = (await response.json()) as { answer: StructuredAnswer, sources: Source[] };



      const systemMessage: SystemMessage = {
        role: 'system',
        answer: data.answer,
        sources: data.sources,
        timestamp: new Date().toISOString(),
      };
      // Update state and sessionStorage
      setMessages((prevMessages) => {
          const updatedMessagesSystem = [...prevMessages, systemMessage];
          if (conversationId) {
              sessionStorage.setItem(`chatHistory_${conversationId}`, JSON.stringify(updatedMessagesSystem));
          }
          return updatedMessagesSystem;
      });
    } catch (err) {
      console.error("API call failed:", err);
      setError(err instanceof Error ? err.message : 'Failed to get answer.');
    } finally {
      setIsLoading(false);
    }
    // --- End Placeholder ---
  };

  // Group messages by date using useMemo
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, ConversationMessage[]>();
    messages.forEach((msg) => {
      const dateKey = msg.timestamp.slice(0, 10); // YYYY-MM-DD
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)?.push(msg);
    });
    // Sort groups by date (newest first) - convert Map to array, sort, convert back if needed, or sort keys
     const sortedEntries = Array.from(groups.entries()).sort(([dateA], [dateB]) => {
        // Sort dates chronologically (oldest first for display top-down)
        return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
    return new Map(sortedEntries);
  }, [messages]);

  // Simple inline onboarding form component
  const GuestOnboardingForm = ({ onSubmit }: { onSubmit: (data: Partial<UserProfile>) => void }) => {
    // Initialize state with new fields
    const [formData, setFormData] = useState<Partial<UserProfile & { allergiesStr?: string; avoidedFoodsStr?: string; preferredFoodsStr?: string }>>({ // Add temp string fields
      age: undefined,
      gender: undefined,
      activityLevel: undefined,
      goal: undefined,
      height: undefined, // New
      weight: undefined, // New
      dietaryPreferences: { // New object structure
        isVegetarian: false,
        isVegan: false,
        isGlutenFree: false,
        isDairyFree: false,
        allergies: [], // Initialize as empty arrays
        avoidedFoods: [],
        preferredFoods: [],
      },
      allergiesStr: '',
      avoidedFoodsStr: '',
      preferredFoodsStr: '',
      macroTargets: { // New object structure - Use 0 as default for required numbers
          protein: 0,
          carbs: 0,
          fat: 0,
      },
      preferences: { // New object structure
          units: 'metric', // Default value
          theme: 'system', // Default value
          notifications: true, // Default value
      },
    });

   // Unified handler for simple inputs, selects, checkboxes, and nested objects
   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
       const { name, value, type } = e.target;
       const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

       // Handle nested state updates
       if (name.includes('.')) {
           const [parentKey, childKey] = name.split('.') as [keyof typeof formData, string];

           setFormData(prev => {
               const parentState = prev?.[parentKey];
               // Ensure parent object exists before updating child
               if (typeof parentState === 'object' && parentState !== null) {
                   return {
                       ...prev,
                       [parentKey]: {
                           ...(parentState as object), // Cast to object
                           [childKey]: type === 'number'
                               // Ensure number inputs default to 0 if cleared, not undefined
                               ? (value === '' ? 0 : Number(value))
                               : (type === 'checkbox' ? checked : value),
                       },
                       // Special handling for vegan/vegetarian dependency
                       ...(parentKey === 'dietaryPreferences' && childKey === 'isVegan' && checked && { dietaryPreferences: { ...(parentState as any), isVegan: true, isVegetarian: true } }),
                       ...(parentKey === 'dietaryPreferences' && childKey === 'isVegetarian' && !checked && { dietaryPreferences: { ...(parentState as any), isVegetarian: false, isVegan: false } }),
                   };
               }
               return prev; // Should not happen if form is structured correctly
           });
       } else {
            // Handle top-level state updates (like allergiesStr, etc.)
            setFormData(prev => ({
                ...prev,
                [name]: type === 'number'
                    // Ensure number inputs default to 0 if cleared, not undefined
                    ? (value === '' ? 0 : Number(value))
                    : (type === 'checkbox' ? checked : value),
            }));
        }
    };



   const handleFormSubmit = (e: FormEvent) => {
       e.preventDefault();

       // --- Validation ---
       // 1. Basic required fields check REMOVED to make submission more lax.
       //    The 'required' attribute on inputs provides basic browser validation.
       // if (!formData.age || !formData.gender || !formData.activityLevel || !formData.goal) {
       //     alert("Please fill in Age, Gender, Activity Level, and Primary Goal.");
       //     return;
       // }

       // 2. Macro target sum validation (only if all three are entered)
       const { protein, carbs, fat } = formData.macroTargets ?? {};
       if (protein !== undefined && carbs !== undefined && fat !== undefined) {
           const sum = protein + carbs + fat;
           if (sum !== 100) {
               alert(`Macro target percentages (Protein: ${protein}%, Carbs: ${carbs}%, Fat: ${fat}%) must add up to 100%. Current sum: ${sum}%`);
               return;
           }
       }
       // --- End Validation ---


       // Prepare final data, parsing string arrays
       const finalProfileData: Partial<UserProfile> = {
           ...formData,
           dietaryPreferences: {
               ...(formData.dietaryPreferences ?? {}),
               allergies: formData.allergiesStr?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
               avoidedFoods: formData.avoidedFoodsStr?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
               preferredFoods: formData.preferredFoodsStr?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
           },
           // Ensure macroTargets and preferences are included
           macroTargets: formData.macroTargets,
           preferences: formData.preferences,
       };
       // Remove temporary string fields before submitting
       delete (finalProfileData as any).allergiesStr;
       delete (finalProfileData as any).avoidedFoodsStr;
       delete (finalProfileData as any).preferredFoodsStr;

       onSubmit(finalProfileData);

   };

    return (
      <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-50">
        {/* Add max-height and overflow-y-auto to the form's container */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md overflow-y-auto max-h-[calc(100vh-8rem)]">
          <form onSubmit={handleFormSubmit}> {/* Form tag doesn't need the classes directly */}
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Welcome! Tell us a bit about yourself.</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This helps us personalize your experience.</p>

          <div className="mb-4">
            <label htmlFor="age" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age ?? ''}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
            <select
              id="gender"
              name="gender"
              value={formData.gender ?? ''}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="" disabled>Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="activityLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Activity Level</label> {/* Corrected: htmlFor */}
            <select
              id="activityLevel" // Corrected: id
              name="activityLevel" // Corrected: name
              value={formData.activityLevel ?? ''} // Corrected: value binding
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="" disabled>Select...</option>
              {/* Update values to match the ACTUAL DB enum values */}
              <option value="sedentary">Sedentary (little or no exercise)</option>
              <option value="lightly_active">Lightly Active (light exercise/sports 1-3 days/week)</option>
              <option value="moderately_active">Moderately Active (moderate exercise/sports 3-5 days/week)</option>
              <option value="very_active">Very Active (hard exercise/sports 6-7 days a week)</option>
              <option value="extra_active">Extra Active (very hard exercise/sports & physical job)</option>
            </select>
          </div>

           {/* --- ADDED BACK: Primary Goal Field --- */}
           <div className="mb-4">
               <label htmlFor="goal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Goal</label>
               <select
                 id="goal"
                 name="goal"
                 value={formData.goal ?? ''}
                 onChange={handleChange}
                 required
                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
               >
                 <option value="" disabled>Select...</option>
                 <option value="Weight Loss">Weight Loss</option>
                 <option value="Weight Gain">Weight Gain</option>
                 <option value="Maintenance">Maintenance</option>
                 <option value="Improve Fitness">Improve Fitness</option>
                 <option value="Build Muscle">Build Muscle</option>
                 <option value="Eat Healthier">Eat Healthier</option>
               </select>
           </div>
           {/* --- End Added Back Field --- */}


          {/* --- New Fields --- */}
           <div className="grid grid-cols-2 gap-4 mb-4">
             <div>
                <label htmlFor="height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height (cm)</label>
                <input type="number" id="height" name="height" value={formData.height ?? ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
             </div>
              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weight (kg)</label>
                <input type="number" id="weight" name="weight" value={formData.weight ?? ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
           </div>

           <div className="mb-4">
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Dietary Preferences</label>
             <div className="space-y-2">
               <div className="flex items-center">
                 <input id="isVegetarian" name="dietaryPreferences.isVegetarian" type="checkbox" checked={formData.dietaryPreferences?.isVegetarian ?? false} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
                 <label htmlFor="isVegetarian" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Vegetarian</label>
               </div>
               <div className="flex items-center">
                 <input id="isVegan" name="dietaryPreferences.isVegan" type="checkbox" checked={formData.dietaryPreferences?.isVegan ?? false} onChange={handleChange} disabled={formData.dietaryPreferences?.isVegetarian === false && formData.dietaryPreferences?.isVegan === true} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
                 <label htmlFor="isVegan" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Vegan</label>
               </div>
                <div className="flex items-center">
                 <input id="isGlutenFree" name="dietaryPreferences.isGlutenFree" type="checkbox" checked={formData.dietaryPreferences?.isGlutenFree ?? false} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
                 <label htmlFor="isGlutenFree" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Gluten-Free</label>
               </div>
                <div className="flex items-center">
                 <input id="isDairyFree" name="dietaryPreferences.isDairyFree" type="checkbox" checked={formData.dietaryPreferences?.isDairyFree ?? false} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
                 <label htmlFor="isDairyFree" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Dairy-Free</label>
               </div>
             </div>
           </div>

            <div className="mb-4">
                <label htmlFor="allergiesStr" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies (comma-separated)</label>
                <input type="text" id="allergiesStr" name="allergiesStr" value={formData.allergiesStr ?? ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
             <div className="mb-4">
                <label htmlFor="avoidedFoodsStr" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Foods to Avoid (comma-separated)</label>
                <input type="text" id="avoidedFoodsStr" name="avoidedFoodsStr" value={formData.avoidedFoodsStr ?? ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
             <div className="mb-6">
                <label htmlFor="preferredFoodsStr" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Foods (comma-separated)</label>
                <input type="text" id="preferredFoodsStr" name="preferredFoodsStr" value={formData.preferredFoodsStr ?? ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            {/* --- Macro Targets --- */}
             <div className="mb-4">
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Macro Targets (%)</label>
                 <div className="grid grid-cols-3 gap-4">
                     <div>
                         <label htmlFor="macroTargets.protein" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Protein</label>
                         <input type="number" id="macroTargets.protein" name="macroTargets.protein" value={formData.macroTargets?.protein ?? 0} onChange={handleChange} min="0" max="100" className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                     </div>
                     <div>
                         <label htmlFor="macroTargets.carbs" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Carbs</label>
                         <input type="number" id="macroTargets.carbs" name="macroTargets.carbs" value={formData.macroTargets?.carbs ?? 0} onChange={handleChange} min="0" max="100" className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                     </div>
                     <div>
                         <label htmlFor="macroTargets.fat" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fat</label>
                         <input type="number" id="macroTargets.fat" name="macroTargets.fat" value={formData.macroTargets?.fat ?? 0} onChange={handleChange} min="0" max="100" className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                     </div>
                 </div>
                  <p className="text-xs text-gray-500 mt-1">Percentages must add up to 100.</p>
             </div>

             {/* --- App Preferences --- */}
              <div className="mb-6">
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">App Preferences</label>
                 <div className="space-y-3">
                     <div>
                         <label htmlFor="preferences.units" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Units</label>
                         <select id="preferences.units" name="preferences.units" value={formData.preferences?.units ?? 'metric'} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                             <option value="metric">Metric (kg, cm)</option>
                             <option value="imperial">Imperial (lbs, ft/in - not fully supported yet)</option>
                         </select>
                     </div>
                      <div>
                         <label htmlFor="preferences.theme" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Theme</label>
                         <select id="preferences.theme" name="preferences.theme" value={formData.preferences?.theme ?? 'system'} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                             <option value="light">Light</option>
                             <option value="dark">Dark</option>
                             <option value="system">System Default</option>
                         </select>
                     </div>
                      <div className="flex items-center">
                          <input id="preferences.notifications" name="preferences.notifications" type="checkbox" checked={formData.preferences?.notifications ?? true} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
                          <label htmlFor="preferences.notifications" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Enable Notifications</label>
                      </div>
                 </div>
              </div>
            {/* --- End New Fields --- */}


            <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Start Chatting
          </button>
          </form>
        </div> {/* Close the scrollable div */}
      </div>
    );
  };


  return (
    <div className="flex flex-col h-screen p-4 bg-gray-50 dark:bg-gray-900 relative"> {/* Added relative positioning */}
      {showOnboarding && <GuestOnboardingForm onSubmit={handleGuestProfileSubmit} />}

      {!showOnboarding && (
        <>
          {/* Message History */}
          <main className="flex-1 overflow-y-auto p-4 space-y-4">
            {Array.from(groupedMessages.entries()).map(([dateString, messagesForDate]) => (
              <React.Fragment key={dateString}>
                {/* Date Separator */}
                <div className="text-center my-4">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                    {formatDateHeader(dateString)}
                  </span>
                </div>
                {/* Messages for this date */}
                {messagesForDate.map((msg, index) => (
                   <div key={`${dateString}-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-xl p-3 rounded-lg shadow-md ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
                       {msg.role === 'user' ? (
                         <p>{msg.query}</p>
                       ) : (
                         <AnswerCard answer={msg.answer} sources={msg.sources} />
                       )}
                       <p className="text-xs text-right opacity-70 mt-1">
                         {new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                       </p>
                     </div>
                   </div>
                ))}
              </React.Fragment>
            ))}
            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                 <div className="max-w-xl p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse">
                   Thinking...
                 </div>
              </div>
            )}
             {/* Error Message */}
             {error && (
              <div className="flex justify-start">
                 <div className="max-w-xl p-3 rounded-lg bg-red-100 border border-red-400 text-red-700">
                   <p><strong>Error:</strong> {error}</p>
                 </div>
              </div>
            )}
          </main>

          {/* Input Area */}
          <footer className="p-4 border-t dark:border-gray-700">
            <QueryInput onSubmit={handleSubmit} disabled={isLoading} />
          </footer>
        </>
      )}
    </div>
  );
}
