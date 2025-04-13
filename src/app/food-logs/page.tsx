'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  DialogClose, // Import DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label"; // Assuming Label exists or add it: npx shadcn@latest add label

import { FoodLog } from '@/types/nutrition';
import { cn } from "@/lib/utils";

// --- Food Log Table Component ---
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
const AddFoodLogDialog = ({ selectedDate, onLogAdded }: { selectedDate: Date, onLogAdded: () => void }) => {
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

    const logData: Partial<FoodLog> = {
      date: format(selectedDate, 'yyyy-MM-dd'),
      mealType: formData.mealType as FoodLog['mealType'],
      name: formData.name,
      calories: Number(formData.calories) || 0,
      portionSize: formData.portionSize || undefined,
      macros: {
        protein: Number(formData.protein) || 0,
        carbs: Number(formData.carbs) || 0,
        fat: Number(formData.fat) || 0,
      },
    };

    // Basic Validation
    if (!logData.mealType || !logData.name || !logData.calories) {
        setError("Meal Type, Name, and Calories are required.");
        setIsSubmitting(false);
        return;
    }

    try {
      const response = await fetch('/api/food-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Reset form and close dialog on success
      setFormData({ mealType: '', name: '', calories: '', portionSize: '', protein: '', carbs: '', fat: '' });
      setIsOpen(false);
      onLogAdded(); // Callback to refresh the log list

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
             {/* Use DialogClose for the Cancel button */}
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
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Removed showAddForm state, handled by Dialog internal state

  const formattedDate = useMemo(() => {
    return selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  }, [selectedDate]);

  const fetchLogs = async (dateToFetch: string) => {
      if (!dateToFetch) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/food-logs?date=${dateToFetch}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: FoodLog[] = await response.json();
        setLogs(data);
      } catch (err: any) {
        console.error("Failed to fetch food logs:", err);
        setError(`Failed to load logs: ${err.message}`);
        setLogs([]); // Clear logs on error
      } finally {
        setIsLoading(false);
      }
    };

  // Fetch logs when the selected date changes
  useEffect(() => {
    fetchLogs(formattedDate);
  }, [formattedDate]);

  // Callback passed to the dialog to refresh logs after adding
  const handleLogAdded = () => {
     console.log("Log added, re-fetching...");
     fetchLogs(formattedDate); // Re-fetch logs for the current date
  }

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

         {/* Add Log Dialog Trigger */}
         <AddFoodLogDialog selectedDate={selectedDate || new Date()} onLogAdded={handleLogAdded} />
      </div>


      {/* Loading and Error States */}
      {isLoading && <p className="text-center py-4">Loading logs...</p>}
      {error && <p className="text-red-500 text-center py-4">{error}</p>}

      {/* Display Logs Table */}
      {!isLoading && !error && <FoodLogTable logs={logs} />}

    </div>
  );
}
