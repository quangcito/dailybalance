'use client';

import React, { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr'; // Import useSWR
import { format } from 'date-fns';
import { Calendar as CalendarIcon, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { FoodLog } from '@/types/nutrition';
import { cn } from "@/lib/utils";

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

// --- Food Log Table Component (Unchanged) ---
const FoodLogTable = ({ logs }: { logs: FoodLog[] }) => {
  const dailyTotals = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        acc.calories += log.calories || 0;
        acc.protein += log.macros?.protein || 0;
        acc.carbs += log.macros?.carbs || 0;
        acc.fat += log.macros?.fat || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [logs]);

  return (
    <Table className="mt-4">
      <TableCaption>{logs.length === 0 ? 'No food logs found for this date.' : 'A list of your food logs for the selected date.'}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Meal</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Portion</TableHead>
          <TableHead className="text-right">Calories</TableHead>
          <TableHead className="text-right">Protein (g)</TableHead>
          <TableHead className="text-right">Carbs (g)</TableHead>
          <TableHead className="text-right">Fat (g)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="capitalize">{log.mealType}</TableCell>
            <TableCell className="font-medium">{log.name}</TableCell>
            <TableCell>{log.portionSize || '-'}</TableCell>
            <TableCell className="text-right">{log.calories}</TableCell>
            <TableCell className="text-right">{log.macros?.protein ?? '-'}</TableCell>
            <TableCell className="text-right">{log.macros?.carbs ?? '-'}</TableCell>
            <TableCell className="text-right">{log.macros?.fat ?? '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-bold">Daily Totals</TableCell>
          <TableCell className="text-right font-bold">{dailyTotals.calories.toFixed(0)}</TableCell>
          <TableCell className="text-right font-bold">{dailyTotals.protein.toFixed(1)}</TableCell>
          <TableCell className="text-right font-bold">{dailyTotals.carbs.toFixed(1)}</TableCell>
          <TableCell className="text-right font-bold">{dailyTotals.fat.toFixed(1)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
};

// --- Add Food Log Dialog Component ---
// Accepts mutateLogs function from SWR to trigger revalidation
const AddFoodLogDialog = ({ selectedDate, mutateLogs }: { selectedDate: Date, mutateLogs: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    mealType: '',
    name: '',
    calories: '',
    portionSize: '',
    protein: '',
    carbs: '',
    fat: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, mealType: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const guestId = localStorage.getItem('guestId');
    if (!guestId) {
        setError("Guest ID not found. Cannot save log.");
        setIsSubmitting(false);
        return;
    }

    const logData: Partial<FoodLog> = {
      // userId will be set by the backend using the header
      date: format(selectedDate, 'yyyy-MM-dd'),
      mealType: formData.mealType as FoodLog['mealType'] || undefined, // Send undefined if empty
      name: formData.name,
      calories: Number(formData.calories) || undefined, // Send undefined if 0 or NaN
      portionSize: formData.portionSize || undefined,
      macros: {
        protein: Number(formData.protein) || 0, // Default to 0 if empty/NaN
        carbs: Number(formData.carbs) || 0,
        fat: Number(formData.fat) || 0,
      },
      source: 'user-input', // Explicitly set source
    };

    // Basic Validation
    if (!logData.mealType || !logData.name || logData.calories === undefined) {
        setError("Meal Type, Name, and Calories are required.");
        setIsSubmitting(false);
        return;
    }

    try {
      const response = await fetch('/api/food-logs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Guest-ID': guestId, // Include guest ID header
        },
        body: JSON.stringify(logData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Reset form and close dialog on success
      setFormData({ mealType: '', name: '', calories: '', portionSize: '', protein: '', carbs: '', fat: '' });
      setIsOpen(false);
      mutateLogs(); // Trigger SWR revalidation to refresh the list

    } catch (err: any) {
      console.error("Failed to submit food log:", err);
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Food Log
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Food Log</DialogTitle>
          <DialogDescription>
            Manually enter food details for {format(selectedDate, 'PPP')}. Click save when done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Meal Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mealType" className="text-right">Meal Type*</Label>
              <Select onValueChange={handleSelectChange} value={formData.mealType}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select meal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name*</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Apple" />
            </div>
            {/* Calories */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="calories" className="text-right">Calories*</Label>
              <Input id="calories" type="number" value={formData.calories} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 95" />
            </div>
            {/* Portion Size */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="portionSize" className="text-right">Portion</Label>
              <Input id="portionSize" value={formData.portionSize} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 1 medium" />
            </div>
            {/* Protein */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="protein" className="text-right">Protein (g)</Label>
              <Input id="protein" type="number" value={formData.protein} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 0.5" />
            </div>
            {/* Carbs */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="carbs" className="text-right">Carbs (g)</Label>
              <Input id="carbs" type="number" value={formData.carbs} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 25" />
            </div>
            {/* Fat */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fat" className="text-right">Fat (g)</Label>
              <Input id="fat" type="number" value={formData.fat} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 0.3" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
          <DialogFooter>
             <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
             </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Log'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};


// --- Main Page Component ---
export default function FoodLogsPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [guestId, setGuestId] = useState<string | null>(null);

  // Get guestId from localStorage on component mount (client-side only)
   useEffect(() => {
    const storedGuestId = localStorage.getItem('guestId');
    setGuestId(storedGuestId);
  }, []);

  const formattedDate = useMemo(() => {
    return selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  }, [selectedDate]);

  // Use SWR to fetch logs for the selected date
  // The key includes the date, so SWR automatically re-fetches when the date changes
  // Conditional fetching: only fetch if guestId and formattedDate are available
  const swrKey = guestId && formattedDate ? `/api/food-logs?date=${formattedDate}` : null;
  const { data: logs, error, isLoading, mutate: mutateLogs } = useSWR<FoodLog[]>(swrKey, fetcher);

  // Determine display error
  const displayError = error ? (error.message || "Failed to load logs.") : null;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Food Logs</h1>

      <div className="flex items-center gap-4 mb-4">
         {/* Date Picker */}
         <Popover>
           <PopoverTrigger asChild>
             <Button
               variant={"outline"}
               className={cn(
                 "w-[280px] justify-start text-left font-normal",
                 !selectedDate && "text-muted-foreground"
               )}
             >
               <CalendarIcon className="mr-2 h-4 w-4" />
               {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
             </Button>
           </PopoverTrigger>
           <PopoverContent className="w-auto p-0">
             <Calendar
               mode="single"
               selected={selectedDate}
               onSelect={setSelectedDate}
               initialFocus
             />
           </PopoverContent>
         </Popover>

         {/* Add Log Dialog Trigger - Pass mutateLogs */}
         <AddFoodLogDialog selectedDate={selectedDate || new Date()} mutateLogs={mutateLogs} />
      </div>


      {/* Loading and Error States */}
      {isLoading && <p className="text-center py-4">Loading logs...</p>}
      {displayError && !isLoading && <p className="text-red-500 text-center py-4">{displayError}</p>}
      {!guestId && !isLoading && <p className="text-orange-500 text-center py-4">Guest ID not found. Cannot load or save logs.</p>}


      {/* Display Logs Table */}
      {!isLoading && !displayError && logs && <FoodLogTable logs={logs} />}
      {!isLoading && !displayError && !logs && swrKey && <p className="text-center py-4">No logs found for this date.</p> /* Show if fetch was attempted but returned null/undefined */}


    </div>
  );
}
