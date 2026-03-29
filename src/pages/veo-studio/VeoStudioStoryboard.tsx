import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Wand2, Loader2, Film, Edit3, Check, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface Shot {
  id: string;
  shotNumber: number;
  title: string;
  description: string;
  prompt: string;
  duration: string;
  cameraAngle: string;
  isEditing: boolean;
  status: 'pending' | 'generating' | 'done' | 'failed';
  outputUrl?: string;
}

const TONE_OPTIONS = ['Inspirational', 'Mysterious', 'Energetic', 'Emotional', 'Professional', 'Playful'] as const;

export default function VeoStudioStoryboard() {
  const { currentUser } = useAuth();
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState<string>('Inspirational');
  const [shotCount, setShotCount] = useState(4);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [storyboardTitle, setStoryboardTitle] = useState('');

  const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';

  const handleGeneratePlan = async () => {
    if (!brief.trim()) return toast.error('Describe your video concept first');
    setIsPlanning(true);
    setShots([]);
    setStoryboardTitle('');
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch(`${apiBase}/api/veo-studio/storyboard-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ brief, tone, shotCount }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStoryboardTitle(data.title || 'Untitled Storyboard');
      setShots(
        (data.shots as Omit<Shot, 'id' | 'isEditing' | 'status'>[]).map((s, i) => ({
          ...s,
          id: `shot-${i}-${Date.now()}`,
          isEditing: false,
          status: 'pending',
        }))
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate storyboard');
    } finally {
      setIsPlanning(false);
    }
  };

  const toggleEdit = (id: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, isEditing: !s.isEditing } : s));
  };

  const updateShot = (id: string, field: keyof Shot, value: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeShot = (id: string) => {
    setShots(prev => prev.filter(s => s.id !== id));
  };

  const generateShot = async (id: string) => {
    const shot = shots.find(s => s.id === id);
    if (!shot) return;
    setShots(prev => prev.map(s => s.id === id ? { ...s, status: 'generating' } : s));
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch(`${apiBase}/api/veo-studio/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: shot.prompt, aspectRatio: '16:9' }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // Poll for completion
      const jobId = data.jobId;
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiBase}/api/veo-studio/job-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const statusData = await statusRes.json();
          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setShots(prev => prev.map(s => s.id === id ? { ...s, status: 'done', outputUrl: statusData.outputUrl } : s));
            toast.success(`Shot ${shot.shotNumber} ready!`);
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setShots(prev => prev.map(s => s.id === id ? { ...s, status: 'failed' } : s));
            toast.error(`Shot ${shot.shotNumber} failed`);
          }
        } catch {}
      }, 6000);
    } catch {
      setShots(prev => prev.map(s => s.id === id ? { ...s, status: 'failed' } : s));
      toast.error('Failed to start generation');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Planning panel */}
      <div className="shrink-0 border-b border-white/5 p-6 space-y-4 bg-[#0a0a0e]">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-amber-400" />
          <h2 className="text-white font-bold">Storyboard Planner</h2>
          <p className="text-xs text-slate-500 ml-2">Describe your concept and AI plans every shot</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Video Concept</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={2}
              placeholder="A brand launch video for a new SaaS product — showcasing the dashboard, team, and customer testimonials…"
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full appearance-none bg-white/[0.03] border border-white/8 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
            >
              {TONE_OPTIONS.map(t => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Shots</label>
            <select
              value={shotCount}
              onChange={(e) => setShotCount(Number(e.target.value))}
              className="w-full appearance-none bg-white/[0.03] border border-white/8 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
            >
              {[2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n} className="bg-slate-900">{n} shots</option>)}
            </select>
          </div>
          <button
            onClick={handleGeneratePlan}
            disabled={isPlanning || !brief.trim()}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm rounded-xl transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isPlanning ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {isPlanning ? 'Planning…' : '✨ Plan Storyboard'}
          </button>
        </div>
      </div>

      {/* Shots list */}
      <div className="flex-1 overflow-y-auto p-6">
        {shots.length === 0 && !isPlanning && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="size-16 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center justify-center">
              <BookOpen className="size-8 text-amber-400/30" strokeWidth={1.5} />
            </div>
            <p className="text-slate-500 text-sm max-w-sm">Describe your concept above and AI will plan every shot with prompts, camera angles, and timing.</p>
          </div>
        )}

        {isPlanning && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Loader2 className="size-10 text-amber-400 animate-spin" />
            <p className="text-white font-semibold">AI is planning your storyboard…</p>
            <p className="text-xs text-slate-500">This takes about 10 seconds</p>
          </div>
        )}

        {shots.length > 0 && (
          <div className="space-y-4">
            {storyboardTitle && (
              <div className="flex items-center gap-3 mb-6">
                <h3 className="text-xl font-bold text-white">{storyboardTitle}</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                  {shots.length} shots
                </span>
              </div>
            )}
            {shots.map((shot, idx) => (
              <motion.div
                key={shot.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border border-white/8 rounded-2xl overflow-hidden bg-white/[0.015] hover:border-amber-500/15 transition-colors"
              >
                {/* Shot header */}
                <div className="flex items-center gap-4 p-4 border-b border-white/5">
                  <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-black text-amber-400">{shot.shotNumber}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {shot.isEditing ? (
                      <input
                        value={shot.title}
                        onChange={(e) => updateShot(shot.id, 'title', e.target.value)}
                        className="w-full bg-transparent text-white font-bold text-sm focus:outline-none border-b border-amber-500/40"
                      />
                    ) : (
                      <p className="text-white font-bold text-sm">{shot.title}</p>
                    )}
                    <p className="text-slate-500 text-xs">{shot.duration} · {shot.cameraAngle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleEdit(shot.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                      {shot.isEditing ? <Check className="size-4" /> : <Edit3 className="size-4" />}
                    </button>
                    <button onClick={() => removeShot(shot.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Shot body */}
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1 block">Scene Description</label>
                    {shot.isEditing ? (
                      <textarea value={shot.description} onChange={(e) => updateShot(shot.id, 'description', e.target.value)} rows={2}
                        className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 text-xs text-slate-300 resize-none focus:outline-none focus:border-amber-500/30 transition-all" />
                    ) : (
                      <p className="text-xs text-slate-400 leading-relaxed">{shot.description}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1 block">AI Generation Prompt</label>
                    {shot.isEditing ? (
                      <textarea value={shot.prompt} onChange={(e) => updateShot(shot.id, 'prompt', e.target.value)} rows={3}
                        className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 text-xs text-amber-200/80 resize-none focus:outline-none focus:border-amber-500/30 transition-all font-mono" />
                    ) : (
                      <p className="text-xs text-amber-200/60 font-mono leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">{shot.prompt}</p>
                    )}
                  </div>

                  {/* Output or generate button */}
                  <div className="flex items-center gap-3">
                    {shot.status === 'done' && shot.outputUrl ? (
                      <div className="flex-1 rounded-xl overflow-hidden border border-amber-500/20" style={{ maxHeight: '120px' }}>
                        <video src={shot.outputUrl} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                      </div>
                    ) : (
                      <button
                        onClick={() => generateShot(shot.id)}
                        disabled={shot.status === 'generating'}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all',
                          shot.status === 'failed'
                            ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                            : 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                        )}
                      >
                        {shot.status === 'generating' ? <><Loader2 className="size-3 animate-spin" />Generating…</> : <><Film className="size-3" />Generate this shot</>}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Generate all remaining */}
            {shots.some(s => s.status === 'pending') && (
              <button
                onClick={() => shots.filter(s => s.status === 'pending').forEach(s => generateShot(s.id))}
                className="w-full py-3 border border-amber-500/20 text-amber-400 text-sm font-bold rounded-xl hover:bg-amber-500/5 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="size-4" /> Generate All Remaining Shots
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
