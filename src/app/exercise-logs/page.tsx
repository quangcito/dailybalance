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

import { ExerciseLog } from '@/types/exercise';
import { cn } from "@/lib/utils";

// --- Exercise Log Table Component ---
const ExerciseLogTable = ({ logs }: { logs: ExerciseLog[] }) => {
  const dailyTotals = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        acc.duration += log.duration || 0;
        acc.caloriesBurned += log.caloriesBurned || 0;
        return acc;
      },
      { duration: 0, caloriesBurned: 0 }
    );
  }, [logs]);

  return (
    <Table className="mt-4">
      <TableCaption>{logs.length === 0 ? 'No exercise logs found for this date.' : 'A list of your exercise logs for the selected date.'}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Duration (min)</TableHead>
          <TableHead>Intensity</TableHead>
          <TableHead className="text-right">Calories Burned</TableHead>
          {/* Optional: Add columns for specific details if needed */}
          {/* <TableHead>Details</TableHead> */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="font-medium">{log.name}</TableCell>
            <TableCell className="capitalize">{log.type}</TableCell>
            <TableCell className="text-right">{log.duration}</TableCell>
            <TableCell className="capitalize">{log.intensity}</TableCell>
            <TableCell className="text-right">{log.caloriesBurned}</TableCell>
            {/* Optional: Display specific details */}
            {/* <TableCell>
              {log.type === 'strength' && `Sets: ${log.strengthDetails?.sets ?? '-'}, Reps: ${log.strengthDetails?.reps ?? '-'}, Weight: ${log.strengthDetails?.weight ?? '-'}kg`}
              {log.type === 'cardio' && `Dist: ${log.cardioDetails?.distance ?? '-'}km, Pace: ${log.cardioDetails?.pace ?? '-'}min/km`}
            </TableCell> */}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2} className="font-bold">Daily Totals</TableCell>
          <TableCell className="text-right font-bold">{dailyTotals.duration} min</TableCell>
          <TableCell></TableCell> {/* Spacer for Intensity */}
          <TableCell className="text-right font-bold">{dailyTotals.caloriesBurned.toFixed(0)} kcal</TableCell>
          {/* <TableCell></TableCell> Optional: Spacer for Details */}
        </TableRow>
      </TableFooter>
    </Table>
  );
};

// --- Add Exercise Log Dialog Component ---
const AddExerciseLogDialog = ({ selectedDate, onLogAdded }: { selectedDate: Date, onLogAdded: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    duration: '',
    intensity: '',
    caloriesBurned: '',
    // Strength
    sets: '',
    reps: '',
    weight: '',
    // Cardio
    distance: '',
    pace: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (id: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    // Reset conditional fields if type changes
    if (id === 'type') {
        setFormData((prev) => ({
            ...prev,
            sets: '', reps: '', weight: '', distance: '', pace: ''
        }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const logData: Partial<ExerciseLog> = {
      date: format(selectedDate, 'yyyy-MM-dd'),
      name: formData.name,
      type: formData.type as ExerciseLog['type'],
      duration: Number(formData.duration) || 0,
      intensity: formData.intensity as ExerciseLog['intensity'],
      caloriesBurned: Number(formData.caloriesBurned) || 0,
      strengthDetails: formData.type === 'strength' ? {
        sets: Number(formData.sets) || undefined,
        reps: Number(formData.reps) || undefined,
        weight: Number(formData.weight) || undefined,
      } : undefined,
      cardioDetails: formData.type === 'cardio' ? {
        distance: Number(formData.distance) || undefined,
        pace: Number(formData.pace) || undefined,
      } : undefined,
    };

    // Basic Validation
    if (!logData.name || !logData.type || !logData.duration || !logData.intensity || !logData.caloriesBurned) {
        setError("Name, Type, Duration, Intensity, and Calories Burned are required.");
        setIsSubmitting(false);
        return;
    }

    try {
      const response = await fetch('/api/exercise-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Reset form and close dialog on success
      setFormData({ name: '', type: '', duration: '', intensity: '', caloriesBurned: '', sets: '', reps: '', weight: '', distance: '', pace: '' });
      setIsOpen(false);
      onLogAdded(); // Callback to refresh the log list

    } catch (err: any) {
      console.error("Failed to submit exercise log:", err);
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Exercise Log
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Exercise Log</DialogTitle>
          <DialogDescription>
            Manually enter exercise details for {format(selectedDate, 'PPP')}. Click save when done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name*</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Morning Run" />
            </div>
            {/* Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">Type*</Label>
              <Select onValueChange={handleSelectChange('type')} value={formData.type}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cardio">Cardio</SelectItem>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="flexibility">Flexibility</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
             {/* Duration */}
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="duration" className="text-right">Duration (min)*</Label>
              <Input id="duration" type="number" value={formData.duration} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 30" />
            </div>
             {/* Intensity */}
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="intensity" className="text-right">Intensity*</Label>
              <Select onValueChange={handleSelectChange('intensity')} value={formData.intensity}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select intensity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="vigorous">Vigorous</SelectItem>
                </SelectContent>
              </Select>
            </div>
             {/* Calories Burned */}
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="caloriesBurned" className="text-right">Calories Burned*</Label>
              <Input id="caloriesBurned" type="number" value={formData.caloriesBurned} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 300" />
            </div>

            {/* Conditional Fields */}
            {formData.type === 'strength' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sets" className="text-right">Sets</Label>
                  <Input id="sets" type="number" value={formData.sets} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="reps" className="text-right">Reps</Label>
                  <Input id="reps" type="number" value={formData.reps} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 10" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="weight" className="text-right">Weight (kg)</Label>
                  <Input id="weight" type="number" value={formData.weight} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 50" />
                </div>
              </>
            )}
            {formData.type === 'cardio' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="distance" className="text-right">Distance (km)</Label>
                  <Input id="distance" type="number" value={formData.distance} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 5" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="pace" className="text-right">Pace (min/km)</Label>
                  <Input id="pace" type="number" value={formData.pace} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 6" />
                </div>
              </>
            )}
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
export default function ExerciseLogsPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedDate = useMemo(() => {
    return selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  }, [selectedDate]);

 const fetchLogs = async (dateToFetch: string) => {
      if (!dateToFetch) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/exercise-logs?date=${dateToFetch}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: ExerciseLog[] = await response.json();
        setLogs(data);
      } catch (err: any) {
        console.error("Failed to fetch exercise logs:", err);
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
      <h1 className="text-2xl font-bold mb-4">Exercise Logs</h1>

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
         <AddExerciseLogDialog selectedDate={selectedDate || new Date()} onLogAdded={handleLogAdded} />
      </div>


      {/* Loading and Error States */}
      {isLoading && <p className="text-center py-4">Loading logs...</p>}
      {error && <p className="text-red-500 text-center py-4">{error}</p>}

      {/* Display Logs Table */}
      {!isLoading && !error && <ExerciseLogTable logs={logs} />}

    </div>
  );
}
