  'use client'; // Required for hooks like useState, useEffect

import React, { useState, useEffect, FormEvent, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import QueryInput from '@/components/answer-engine/query-input';
import AnswerCard from '@/components/answer-engine/answer-card';
import { ConversationMessage, UserMessage, SystemMessage, StructuredAnswer, Source } from '@/types/conversation';
import { UserProfile } from '@/types/user'; // Import UserProfile type
import { cn } from '@/lib/utils'; // Assuming you have a utility for class names

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, User, Bot } from 'lucide-react'; // Icons

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

// Guest Onboarding Dialog Component
const GuestOnboardingDialog = ({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: Partial<UserProfile>) => void }) => {
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
   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { name: string; value: string | number | boolean | undefined; type?: string; checked?: boolean } }) => {
       const { name, value, type } = e.target;
       const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

       // Handle nested state updates
       if (name.includes('.')) {
           const [parentKey, childKey] = name.split('.') as [keyof typeof formData, string];

           setFormData((prev: Partial<UserProfile & { allergiesStr?: string; avoidedFoodsStr?: string; preferredFoodsStr?: string }>) => {
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
            setFormData((prev: Partial<UserProfile & { allergiesStr?: string; avoidedFoodsStr?: string; preferredFoodsStr?: string }>) => ({
                ...prev,
                [name]: type === 'number'
                    // Ensure number inputs default to 0 if cleared, not undefined
                    ? (value === '' ? 0 : Number(value))
                    : (type === 'checkbox' ? checked : value),
            }));
        }
    };

    // Handler for Select components
    const handleSelectChange = (name: string) => (value: string) => {
        handleChange({ target: { name, value } });
    };

    // Handler for Checkbox components
    const handleCheckboxChange = (name: string) => (checked: boolean | 'indeterminate') => {
        // Assuming 'indeterminate' is not used or treated as false
        // Pass a structure consistent with how handleChange expects checkbox events
        handleChange({ target: { name, value: !!checked, type: 'checkbox', checked: !!checked } });
    };


   const handleFormSubmit = (e: FormEvent) => {
       e.preventDefault();

       // --- Validation ---
       // 1. Basic required fields check REMOVED to make submission more lax.
       //    The 'required' attribute on inputs provides basic browser validation.

       // 2. Macro target sum validation (only if all three are entered and non-zero)
       const { protein, carbs, fat } = formData.macroTargets ?? {};
       if (protein !== undefined && carbs !== undefined && fat !== undefined && (protein > 0 || carbs > 0 || fat > 0)) {
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
               allergies: formData.allergiesStr?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
               avoidedFoods: formData.avoidedFoodsStr?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
               preferredFoods: formData.preferredFoodsStr?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
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
       onOpenChange(false); // Close dialog on submit
   };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
                onInteractOutside={(e: Event) => e.preventDefault()} // Prevent closing on outside click
            >
                <DialogHeader>
                    <DialogTitle>Welcome! Tell us a bit about yourself.</DialogTitle>
                    <DialogDescription>
                        This helps us personalize your experience. Fill in what you're comfortable with.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleFormSubmit} className="space-y-4 py-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="age">Age</Label>
                            <Input id="age" name="age" type="number" value={formData.age ?? ''} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="gender">Gender</Label>
                            <Select name="gender" value={formData.gender ?? ''} onValueChange={handleSelectChange('gender')} required>
                                <SelectTrigger id="gender">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Female">Female</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Physical Stats */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="height">Height (cm)</Label>
                            <Input id="height" name="height" type="number" value={formData.height ?? ''} onChange={handleChange} />
                        </div>
                        <div>
                            <Label htmlFor="weight">Weight (kg)</Label>
                            <Input id="weight" name="weight" type="number" value={formData.weight ?? ''} onChange={handleChange} />
                        </div>
                    </div>

                    {/* Activity & Goal */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="activityLevel">Activity Level</Label>
                            <Select name="activityLevel" value={formData.activityLevel ?? ''} onValueChange={handleSelectChange('activityLevel')} required>
                                <SelectTrigger id="activityLevel">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sedentary">Sedentary (little/no exercise)</SelectItem>
                                    <SelectItem value="lightly_active">Lightly Active (1-3 days/week)</SelectItem>
                                    <SelectItem value="moderately_active">Moderately Active (3-5 days/week)</SelectItem>
                                    <SelectItem value="very_active">Very Active (6-7 days/week)</SelectItem>
                                    <SelectItem value="extra_active">Extra Active (very hard exercise/job)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="goal">Primary Goal</Label>
                            <Select name="goal" value={formData.goal ?? ''} onValueChange={handleSelectChange('goal')} required>
                                <SelectTrigger id="goal">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Weight Loss">Weight Loss</SelectItem>
                                    <SelectItem value="Weight Gain">Weight Gain</SelectItem>
                                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                                    <SelectItem value="Improve Fitness">Improve Fitness</SelectItem>
                                    <SelectItem value="Build Muscle">Build Muscle</SelectItem>
                                    <SelectItem value="Eat Healthier">Eat Healthier</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Dietary Preferences Checkboxes */}
                    <div>
                        <Label className="block mb-2">Dietary Preferences</Label>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="isVegetarian" name="dietaryPreferences.isVegetarian" checked={formData.dietaryPreferences?.isVegetarian ?? false} onCheckedChange={handleCheckboxChange('dietaryPreferences.isVegetarian')} />
                                <Label htmlFor="isVegetarian">Vegetarian</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="isVegan" name="dietaryPreferences.isVegan" checked={formData.dietaryPreferences?.isVegan ?? false} onCheckedChange={handleCheckboxChange('dietaryPreferences.isVegan')} disabled={formData.dietaryPreferences?.isVegetarian === false && formData.dietaryPreferences?.isVegan === true} />
                                <Label htmlFor="isVegan">Vegan</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="isGlutenFree" name="dietaryPreferences.isGlutenFree" checked={formData.dietaryPreferences?.isGlutenFree ?? false} onCheckedChange={handleCheckboxChange('dietaryPreferences.isGlutenFree')} />
                                <Label htmlFor="isGlutenFree">Gluten-Free</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="isDairyFree" name="dietaryPreferences.isDairyFree" checked={formData.dietaryPreferences?.isDairyFree ?? false} onCheckedChange={handleCheckboxChange('dietaryPreferences.isDairyFree')} />
                                <Label htmlFor="isDairyFree">Dairy-Free</Label>
                            </div>
                        </div>
                    </div>

                    {/* Dietary Preferences Text Inputs */}
                    <div>
                        <Label htmlFor="allergiesStr">Allergies (comma-separated)</Label>
                        <Input id="allergiesStr" name="allergiesStr" value={formData.allergiesStr ?? ''} onChange={handleChange} />
                    </div>
                    <div>
                        <Label htmlFor="avoidedFoodsStr">Foods to Avoid (comma-separated)</Label>
                        <Input id="avoidedFoodsStr" name="avoidedFoodsStr" value={formData.avoidedFoodsStr ?? ''} onChange={handleChange} />
                    </div>
                    <div>
                        <Label htmlFor="preferredFoodsStr">Preferred Foods (comma-separated)</Label>
                        <Input id="preferredFoodsStr" name="preferredFoodsStr" value={formData.preferredFoodsStr ?? ''} onChange={handleChange} />
                    </div>

                    {/* Macro Targets */}
                    <div>
                        <Label className="block mb-2">Macro Targets (%)</Label>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor="macroTargets.protein" className="text-xs text-muted-foreground">Protein</Label>
                                <Input id="macroTargets.protein" name="macroTargets.protein" type="number" value={formData.macroTargets?.protein ?? 0} onChange={handleChange} min="0" max="100" />
                            </div>
                            <div>
                                <Label htmlFor="macroTargets.carbs" className="text-xs text-muted-foreground">Carbs</Label>
                                <Input id="macroTargets.carbs" name="macroTargets.carbs" type="number" value={formData.macroTargets?.carbs ?? 0} onChange={handleChange} min="0" max="100" />
                            </div>
                            <div>
                                <Label htmlFor="macroTargets.fat" className="text-xs text-muted-foreground">Fat</Label>
                                <Input id="macroTargets.fat" name="macroTargets.fat" type="number" value={formData.macroTargets?.fat ?? 0} onChange={handleChange} min="0" max="100" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Optional. Percentages should add up to 100 if provided.</p>
                    </div>

                    {/* App Preferences */}
                    <div>
                        <Label className="block mb-2">App Preferences</Label>
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="preferences.units" className="text-xs text-muted-foreground">Units</Label>
                                <Select name="preferences.units" value={formData.preferences?.units ?? 'metric'} onValueChange={handleSelectChange('preferences.units')}>
                                    <SelectTrigger id="preferences.units">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="metric">Metric (kg, cm)</SelectItem>
                                        <SelectItem value="imperial" disabled>Imperial (lbs, ft/in - coming soon)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="preferences.theme" className="text-xs text-muted-foreground">Theme</Label>
                                <Select name="preferences.theme" value={formData.preferences?.theme ?? 'system'} onValueChange={handleSelectChange('preferences.theme')}>
                                    <SelectTrigger id="preferences.theme">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="light">Light</SelectItem>
                                        <SelectItem value="dark">Dark</SelectItem>
                                        <SelectItem value="system">System Default</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="preferences.notifications" name="preferences.notifications" checked={formData.preferences?.notifications ?? true} onCheckedChange={handleCheckboxChange('preferences.notifications')} />
                                <Label htmlFor="preferences.notifications">Enable Notifications</Label>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit">Start Chatting</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};


export default function Home() { // Remove explicit JSX.Element return type for now
  // Existing state
  const [conversationId, setConversationId] = useState<string | null>(null); // Session ID for chat history
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null); // Ref for scrolling

  // Guest Mode State
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestProfile, setGuestProfile] = useState<Partial<UserProfile> | null>(null); // Store collected profile data
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false); // Start hidden, check localStorage

  // Effect to manage conversation ID and Guest ID/Profile persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Conversation ID (Session based)
      let currentSessionId = sessionStorage.getItem('conversationId');
      if (!currentSessionId) {
        currentSessionId = uuidv4();
        if (currentSessionId) {
          sessionStorage.setItem('conversationId', currentSessionId);
        }
      }
      setConversationId(currentSessionId);

      // Guest ID / Profile (Local Storage based)
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

  // Effect to fetch initial chat history once guestId is available and onboarding is hidden
  useEffect(() => {
    const fetchAndSetHistory = async () => {
      if (guestId) {
        console.log(`[History Fetch] Fetching initial history for guestId: ${guestId}`);
        try {
          const response = await fetch(`/api/conversation/history?userId=${guestId}`);
          if (!response.ok) {
            let errorDetails = `HTTP error! status: ${response.status}`;
             try {
                const errorData = await response.json();
                errorDetails = errorData.error || errorData.details || errorDetails;
             } catch (jsonError) {
                errorDetails = response.statusText || errorDetails;
             }
            throw new Error(`Failed to fetch history: ${errorDetails}`);
          }
          const historyMessages: ConversationMessage[] = await response.json();
          if (Array.isArray(historyMessages)) {
             console.log(`[History Fetch] Received ${historyMessages.length} messages.`);
             setMessages(historyMessages); // Set initial messages from history
          } else {
             console.warn("[History Fetch] Received non-array data:", historyMessages);
             setMessages([]); // Set empty if data is invalid
          }
        } catch (error) {
          console.error("[History Fetch] Error fetching initial chat history:", error);
          setError(error instanceof Error ? error.message : 'Could not load chat history.');
          setMessages([]); // Set empty on error
        }
      }
    };

    if (!showOnboarding && guestId && messages.length === 0) {
       fetchAndSetHistory();
    }
  }, [guestId, showOnboarding]); // Dependencies: guestId, showOnboarding

  // Effect to scroll to bottom when messages change or loading starts/stops
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
        const response = await fetch('/api/guest-profile', { // Assuming this endpoint exists
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guestId: newGuestId,
            profileData: profileData,
          }),
        });

        if (!response.ok) {
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
        alert(`Could not save your profile preferences due to an error: ${error instanceof Error ? error.message : 'Unknown error'}. You can continue as a guest for this session, but your preferences won't be saved for next time unless you refresh and try again.`);
        setShowOnboarding(false); // Still hide onboarding to allow chat
      }
    }
  };

  // Handler for submitting a chat query
  const handleSubmit = async (query: string) => {
    if (!query.trim() || isLoading || !conversationId || !guestId) {
      setError("Cannot send message. Ensure you are properly initialized.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const userMessage: UserMessage = {
      role: 'user',
      query: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prevMessages: ConversationMessage[]) => [...prevMessages, userMessage]);

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
          errorDetails = response.statusText || errorDetails;
        }
        throw new Error(errorDetails);
      }

      const data = (await response.json()) as { answer: StructuredAnswer, sources: Source[] };

      const systemMessage: SystemMessage = {
        role: 'system',
        answer: data.answer,
        sources: data.sources,
        timestamp: new Date().toISOString(),
      };
      setMessages((prevMessages: ConversationMessage[]) => [...prevMessages, systemMessage]);
    } catch (err) {
      console.error("API call failed:", err);
      setError(err instanceof Error ? err.message : 'Failed to get answer.');
    } finally {
      setIsLoading(false);
    }
  };

  // Group messages by date using useMemo
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, ConversationMessage[]>();
    messages.forEach((msg: ConversationMessage) => {
      const dateKey = msg.timestamp.slice(0, 10); // YYYY-MM-DD
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)?.push(msg);
    });
     const sortedEntries = Array.from(groups.entries()).sort(([dateA], [dateB]) => {
        return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
    return new Map(sortedEntries);
  }, [messages]);


  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Onboarding Dialog */}
      <GuestOnboardingDialog
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onSubmit={handleGuestProfileSubmit}
      />

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8"> {/* Increased main spacing */}
        {Array.from(groupedMessages.entries()).map((entry: [string, ConversationMessage[]], mapIndex: number) => {
          const [dateString, messagesForDate] = entry;
          return ( // Add return statement
          <React.Fragment key={dateString}>
            {/* Date Separator */}
             <div className="relative my-6"> {/* Increased vertical margin */}
                <div className="absolute inset-0 flex items-center">
                    <Separator />
                </div>
                <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs text-muted-foreground uppercase">
                        {formatDateHeader(dateString)}
                    </span>
                </div>
            </div>

            {/* Messages for this date */}
            <div className="space-y-8"> {/* Further increased spacing between messages */}
            {messagesForDate.map((msg: ConversationMessage, msgIndex: number) => (
               <div key={`${dateString}-${msgIndex}`} className={cn('flex items-end gap-5', msg.role === 'user' ? 'justify-end' : 'justify-start')}> {/* Further increased gap */}
                 {/* Avatar (System) */}
                 {msg.role === 'system' && (
                    <Avatar className="w-8 h-8 border border-border"> {/* Add border */}
                        <AvatarFallback><Bot size={16} /></AvatarFallback>
                        {/* <AvatarImage src="/path/to/bot-avatar.png" /> */}
                    </Avatar>
                 )}

                 {/* Message Content */}
                 <Card className={cn('max-w-xl shadow-sm', msg.role === 'user' ? 'bg-primary text-primary-foreground' : '')}>
                   <CardContent className="p-3"> {/* Adjusted padding */}
                     {msg.role === 'user' ? (
                       <p className="text-sm">{msg.query}</p>
                     ) : (
                       // Pass theme context if AnswerCard needs it, otherwise remove prop
                       <AnswerCard answer={msg.answer} sources={msg.sources} />
                     )}
                     <p className="text-xs text-right opacity-70 mt-2"> {/* Slightly increased margin and opacity */}
                       {new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                     </p>
                   </CardContent>
                 </Card>

                 {/* Avatar (User) */}
                 {msg.role === 'user' && (
                    <Avatar className="w-8 h-8 border border-border"> {/* Add border */}
                        <AvatarFallback><User size={16} /></AvatarFallback>
                        {/* <AvatarImage src="/path/to/user-avatar.png" /> */}
                    </Avatar>
                 )}
               </div>
            ))}
            </div> {/* Close spacing wrapper */}
          </React.Fragment>
         ); // Close return statement
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-5 justify-start"> {/* Further increased gap */}
             <Avatar className="w-8 h-8 border border-border"> {/* Add border */}
                <AvatarFallback><Bot size={16} /></AvatarFallback>
             </Avatar>
             <div className="max-w-xl rounded-lg p-4 shadow-sm bg-card space-y-2"> {/* Increased padding */}
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
             </div>
          </div>
        )}

         {/* Error Message */}
         {error && (
            <Alert variant="destructive" className="max-w-xl mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
         )}

         {/* Scroll Anchor */}
         <div ref={messagesEndRef} />
      </main>

      {/* Input Area - Sticky Footer */}
      <footer className="sticky bottom-0 bg-background p-6 border-t"> {/* Increased padding */}
        <QueryInput onSubmit={handleSubmit} disabled={isLoading || showOnboarding} />
      </footer>
    </div>
  );
} // Ensure this closing brace matches the 'export default function Home()'
