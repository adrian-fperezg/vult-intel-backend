import React, { useState, useEffect } from 'react';
import { Clock, Zap, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TealButton, OutreachEmptyState } from '../../OutreachCommon';
import { toast } from 'react-hot-toast';
import { useOutreachApi } from '@/hooks/useOutreachApi';

export const SendingTab: React.FC = () => {
  const api = useOutreachApi();
  
  // State
  const [sendingInterval, setSendingInterval] = useState(20);
  const [staggerDelay, setStaggerDelay] = useState(2);
  const [globalDailyLimit, setGlobalDailyLimit] = useState(50);
  const [restrictSendingHours, setRestrictSendingHours] = useState(false);
  const [sendingStartTime, setSendingStartTime] = useState('09:00');
  const [sendingEndTime, setSendingEndTime] = useState('17:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [api.activeProjectId]);

  const loadSettings = async () => {
    if (!api.activeProjectId) return;
    try {
      setLoading(true);
      const settings = await api.fetchSettings();
      
      if (settings) {
        if (settings.sending_interval_minutes !== undefined) setSendingInterval(settings.sending_interval_minutes);
        if (settings.stagger_delay !== undefined) setStaggerDelay(settings.stagger_delay);
        if (settings.global_daily_limit !== undefined) setGlobalDailyLimit(settings.global_daily_limit);
        if (settings.restrict_sending_hours !== undefined) setRestrictSendingHours(settings.restrict_sending_hours);
        if (settings.sending_start_time !== undefined) setSendingStartTime(settings.sending_start_time);
        if (settings.sending_end_time !== undefined) setSendingEndTime(settings.sending_end_time);
      }
    } catch (err) {
      console.error('Failed to load sending settings:', err);
      toast.error('Failed to load sending settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!api.activeProjectId) return;
    setSaving(true);
    try {
      await api.updateSettings({
        sending_interval_minutes: sendingInterval,
        stagger_delay: staggerDelay,
        global_daily_limit: globalDailyLimit,
        restrict_sending_hours: restrictSendingHours,
        sending_start_time: sendingStartTime,
        sending_end_time: sendingEndTime
      });
      toast.success('Sending configuration updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save sending settings');
    } finally {
      setSaving(false);
    }
  };

  if (!api.activeProjectId) {
    return <OutreachEmptyState icon={<Zap />} title="No project selected" description="Select a project to manage sending settings." />;
  }

  return (
    <div className="space-y-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Sending Configuration</h2>
        <p className="text-sm text-slate-400 mt-1">Optimize your outreach delivery and protect your domains</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Interval Staggering */}
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
              <Clock className="size-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Sending Interval</h3>
              <p className="text-xs text-slate-500">Per-mailbox staggering logic</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Wait Time (Minutes)</label>
              <input 
                type="number"
                value={sendingInterval}
                onChange={e => setSendingInterval(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Delay between emails (minutes)</label>
              <input 
                type="number"
                value={staggerDelay}
                onChange={e => setStaggerDelay(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-teal-500/30 pl-3">
              "Minimum wait time between emails sent from the exact same mailbox/alias. This spreads out your outreach to appear more human to spam filters."
            </p>
          </div>
        </div>

        {/* Daily Limits */}
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
           <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Mail className="size-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Daily Sending Cap</h3>
              <p className="text-xs text-slate-500">Global safety limits</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Max Emails Per Day / Project</label>
              <input 
                type="number"
                value={globalDailyLimit}
                onChange={e => setGlobalDailyLimit(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/50 outline-none"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-3">
              "Override the aggregate daily send limit for this project. Keep this low (50-100) to protect new domains."
            </p>
          </div>
        </div>

        {/* Sending Window */}
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
           <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Clock className="size-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white">Sending Window</h3>
              <p className="text-xs text-slate-500">Scheduled delivery hours</p>
            </div>
            <button
              onClick={() => setRestrictSendingHours(!restrictSendingHours)}
              className={cn(
                'w-12 h-6 rounded-full border transition-all relative',
                restrictSendingHours ? 'bg-teal-500 border-teal-400' : 'bg-white/10 border-white/10'
              )}
            >
              <span className={cn(
                'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                restrictSendingHours ? 'left-6' : 'left-0.5'
              )} />
            </button>
          </div>

          <div className={cn("space-y-4 transition-opacity", !restrictSendingHours && "opacity-40 pointer-events-none")}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Start Time</label>
                <input 
                  type="time"
                  value={sendingStartTime}
                  onChange={e => setSendingStartTime(e.target.value)}
                  disabled={!restrictSendingHours}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">End Time</label>
                <input 
                  type="time"
                  value={sendingEndTime}
                  onChange={e => setSendingEndTime(e.target.value)}
                  disabled={!restrictSendingHours}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-amber-500/30 pl-3">
              "When enabled, emails will only be sent during these hours. Sequences will automatically reschedule to the next valid slot."
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 pt-4">
          <TealButton 
            onClick={handleSave}
            loading={saving}
            className="h-14 px-10 rounded-2xl shadow-xl shadow-teal-500/10 text-base font-bold"
          >
            Save Sending Configuration
          </TealButton>
        </div>
      </div>
    </div>
  );
};

export default SendingTab;
