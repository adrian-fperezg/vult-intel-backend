import React, { useState, useEffect } from 'react';
import { Clock, Zap, Mail, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TealButton, OutreachEmptyState } from '../../OutreachCommon';
import { toast } from 'react-hot-toast';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useTranslation } from '@/contexts/TranslationContext';

export const SendingTab: React.FC = () => {
  const api = useOutreachApi();
  const { t } = useTranslation();
  
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
      toast.error(t('landing.settings.sending.loadError') || 'Failed to load sending settings');
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
      toast.success(t('landing.settings.sending.saveSuccess'));
    } catch (err: any) {
      toast.error(err.message || t('landing.settings.sending.saveError') || 'Failed to save sending settings');
    } finally {
      setSaving(false);
    }
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState 
        icon={<FolderOpen />} 
        title={t('common.noProject')} 
        description={t('common.noProjectDesc')} 
      />
    );
  }

  return (
    <div className="space-y-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="px-2">
        <h2 className="text-3xl font-black text-white tracking-tight">{t('landing.settings.sending.title')}</h2>
        <p className="text-base text-slate-500 mt-2 font-medium">{t('landing.settings.sending.desc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Interval Staggering */}
        <div className="p-10 rounded-[2rem] bg-white/[0.02] border border-white/10 space-y-8 hover:bg-white/[0.03] transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
              <Clock className="size-6 text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">{t('landing.settings.sending.intervalTitle')}</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('landing.settings.sending.intervalDesc')}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">{t('landing.settings.sending.waitTime')}</label>
              <input 
                type="number"
                value={sendingInterval}
                onChange={e => setSendingInterval(parseInt(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-teal-500/40 outline-none transition-all placeholder:text-slate-700"
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">{t('landing.settings.sending.staggerDelayDesc')}</label>
              <input 
                type="number"
                value={staggerDelay}
                onChange={e => setStaggerDelay(parseInt(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-teal-500/40 outline-none transition-all placeholder:text-slate-700"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-teal-500/30 pl-4 py-1">
              {t('landing.settings.sending.waitTimeDesc')}
            </p>
          </div>
        </div>

        {/* Daily Limits */}
        <div className="p-10 rounded-[2rem] bg-white/[0.02] border border-white/10 space-y-8 hover:bg-white/[0.03] transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
              <Mail className="size-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">{t('landing.settings.sending.dailyCapTitle')}</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('landing.settings.sending.dailyCapDesc')}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">{t('landing.settings.sending.maxEmails')}</label>
              <input 
                type="number"
                value={globalDailyLimit}
                onChange={e => setGlobalDailyLimit(parseInt(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-indigo-500/40 outline-none transition-all placeholder:text-slate-700"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-4 py-1">
              {t('landing.settings.sending.maxEmailsDesc')}
            </p>
          </div>
        </div>

        {/* Sending Window */}
        <div className="p-10 rounded-[2rem] bg-white/[0.02] border border-white/10 space-y-8 hover:bg-white/[0.03] transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
              <Clock className="size-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-white tracking-tight">{t('landing.settings.sending.sendingWindowTitle')}</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('landing.settings.sending.sendingWindowDesc')}</p>
            </div>
            <button
              onClick={() => setRestrictSendingHours(!restrictSendingHours)}
              className={cn(
                'w-14 h-7 rounded-full border transition-all relative',
                restrictSendingHours ? 'bg-teal-500 border-teal-400' : 'bg-white/10 border-white/10'
              )}
            >
              <span className={cn(
                'absolute top-0.5 size-6 rounded-full bg-white shadow-xl transition-all',
                restrictSendingHours ? 'left-[1.75rem]' : 'left-0.5'
              )} />
            </button>
          </div>

          <div className={cn("space-y-6 transition-all duration-500", !restrictSendingHours ? "opacity-20 pointer-events-none grayscale" : "opacity-100")}>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">{t('landing.settings.sending.startTime')}</label>
                <input 
                  type="time"
                  value={sendingStartTime}
                  onChange={e => setSendingStartTime(e.target.value)}
                  disabled={!restrictSendingHours}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-teal-500/40 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">{t('landing.settings.sending.endTime')}</label>
                <input 
                  type="time"
                  value={sendingEndTime}
                  onChange={e => setSendingEndTime(e.target.value)}
                  disabled={!restrictSendingHours}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-teal-500/40 outline-none transition-all"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-amber-500/30 pl-4 py-1">
              {t('landing.settings.sending.windowDesc')}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 pt-6">
          <TealButton 
            onClick={handleSave}
            loading={saving}
            className="h-16 px-12 rounded-[2rem] shadow-2xl shadow-teal-500/20 text-lg font-black tracking-tight"
          >
            {t('landing.settings.sending.saveBtn')}
          </TealButton>
        </div>
      </div>
    </div>
  );
};

export default SendingTab;
