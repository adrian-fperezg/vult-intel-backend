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
    <div className="space-y-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">{t('landing.settings.sending.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('landing.settings.sending.desc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Interval Staggering */}
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
              <Clock className="size-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">{t('landing.settings.sending.intervalTitle')}</h3>
              <p className="text-xs text-slate-500">{t('landing.settings.sending.intervalDesc')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{t('landing.settings.sending.waitTime')}</label>
              <input 
                type="number"
                value={sendingInterval}
                onChange={e => setSendingInterval(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{t('landing.settings.sending.staggerDelayDesc')}</label>
              <input 
                type="number"
                value={staggerDelay}
                onChange={e => setStaggerDelay(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-teal-500/30 pl-3">
              {t('landing.settings.sending.waitTimeDesc')}
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
              <h3 className="font-bold text-white">{t('landing.settings.sending.dailyCapTitle')}</h3>
              <p className="text-xs text-slate-500">{t('landing.settings.sending.dailyCapDesc')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{t('landing.settings.sending.maxEmails')}</label>
              <input 
                type="number"
                value={globalDailyLimit}
                onChange={e => setGlobalDailyLimit(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/50 outline-none"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-3">
              {t('landing.settings.sending.maxEmailsDesc')}
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
              <h3 className="font-bold text-white">{t('landing.settings.sending.sendingWindowTitle')}</h3>
              <p className="text-xs text-slate-500">{t('landing.settings.sending.sendingWindowDesc')}</p>
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
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{t('landing.settings.sending.startTime')}</label>
                <input 
                  type="time"
                  value={sendingStartTime}
                  onChange={e => setSendingStartTime(e.target.value)}
                  disabled={!restrictSendingHours}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{t('landing.settings.sending.endTime')}</label>
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
              {t('landing.settings.sending.windowDesc')}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 pt-4">
          <TealButton 
            onClick={handleSave}
            loading={saving}
            className="h-14 px-10 rounded-2xl shadow-xl shadow-teal-500/10 text-base font-bold"
          >
            {t('landing.settings.sending.saveBtn')}
          </TealButton>
        </div>
      </div>
    </div>
  );
};

export default SendingTab;
