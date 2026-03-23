import React, { useState } from 'react';
import { X, Clock, Calendar, Globe, Zap } from 'lucide-react';
import { TealButton } from '../OutreachCommon';
import { cn } from '@/lib/utils';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (date: string) => void;
  initialDate?: string;
}

export default function ScheduleModal({ isOpen, onClose, onSchedule, initialDate }: ScheduleModalProps) {
  const [date, setDate] = useState(initialDate ? initialDate.split('T')[0] : new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(initialDate ? initialDate.split('T')[1]?.slice(0, 5) : '09:00');
  const [useBestTime, setUseBestTime] = useState(false);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (useBestTime) {
      // In a real app, "best time" might be a flag or a specifically calculated timestamp
      // For now, we'll just set it to 9 AM of the selected date if "best time" is toggled
      onSchedule(`${date}T09:00:00`);
    } else {
      onSchedule(`${date}T${time}:00`);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-[#30363d] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="size-5 text-teal-400" />
            Schedule Email
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Select Date</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
              <input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors color-scheme-dark"
              />
            </div>
          </div>

          {/* Time Picker */}
          {!useBestTime && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Select Time</label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
                <input 
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors color-scheme-dark"
                />
              </div>
            </div>
          )}

          {/* Smart Send Toggle */}
          <button 
            onClick={() => setUseBestTime(!useBestTime)}
            className={cn(
              "w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
              useBestTime 
                ? "bg-teal-500/10 border-teal-500/30 text-teal-400" 
                : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10"
            )}
          >
            <div className={cn(
              "size-8 rounded-lg flex items-center justify-center shrink-0",
              useBestTime ? "bg-teal-500 text-slate-900" : "bg-white/5 text-slate-500"
            )}>
              <Zap className="size-4 fill-current" />
            </div>
            <div>
              <p className="text-sm font-bold">Smart Send</p>
              <p className="text-xs opacity-70">Automatically send at the best time for engagement</p>
            </div>
          </button>

          {/* Timezone Info */}
          <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500 font-medium">
            <Globe className="size-3" />
            Timezone: {timezone}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <TealButton
            onClick={handleConfirm}
            className="flex-1"
          >
            Confirm Schedule
          </TealButton>
        </div>
      </div>
    </div>
  );
}
