import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Palette, Save, Loader2, ToggleLeft, ToggleRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface BrandKit {
  brandName: string;
  primaryColor: string;
  accentColor: string;
  visualStyle: 'dark' | 'light' | 'vibrant' | 'muted';
  lightingPreference: string;
  alwaysAvoid: string;
  promptSuffix: string;
  isActive: boolean;
}

const DEFAULT_KIT: BrandKit = {
  brandName: '',
  primaryColor: '#f59e0b',
  accentColor: '#0d1117',
  visualStyle: 'dark',
  lightingPreference: '',
  alwaysAvoid: '',
  promptSuffix: '',
  isActive: false,
};

const VISUAL_STYLES = [
  { id: 'dark',    label: 'Dark & Cinematic' },
  { id: 'light',   label: 'Bright & Airy' },
  { id: 'vibrant', label: 'Bold & Vibrant' },
  { id: 'muted',   label: 'Muted & Elegant' },
] as const;

export default function VeoStudioBrandKit() {
  const { currentUser } = useAuth();
  const [kit, setKit] = useState<BrandKit>(DEFAULT_KIT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';

  useEffect(() => {
    async function load() {
      try {
        const token = await currentUser?.getIdToken();
        const res = await fetch(`${apiBase}/api/veo-studio/brand-kit`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setKit({ ...DEFAULT_KIT, ...data });
        }
      } catch {} finally {
        setIsLoading(false);
      }
    }
    load();
  }, [currentUser]);

  const set = <K extends keyof BrandKit>(key: K) => (value: BrandKit[K]) =>
    setKit(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    setSavedOk(false);
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch(`${apiBase}/api/veo-studio/brand-kit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(kit),
      });
      if (!res.ok) throw new Error();
      setSavedOk(true);
      toast.success('Brand Kit saved!');
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      toast.error('Failed to save Brand Kit');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="size-5 animate-spin text-amber-400" />
        <span className="text-sm">Loading Brand Kit…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <Palette className="size-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-bold">Brand Kit</h2>
              <p className="text-xs text-slate-500">Applied automatically to every generation when active</p>
            </div>
          </div>
          {/* Active toggle */}
          <button
            onClick={() => set('isActive')(!kit.isActive)}
            className="flex items-center gap-2 text-sm font-bold transition-colors"
          >
            {kit.isActive ? (
              <><ToggleRight className="size-6 text-amber-400" /><span className="text-amber-400">Active</span></>
            ) : (
              <><ToggleLeft className="size-6 text-slate-500" /><span className="text-slate-500">Inactive</span></>
            )}
          </button>
        </div>

        {/* Brand identity */}
        <section className="space-y-4 p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Brand Identity</h3>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Brand Name</label>
            <input
              type="text"
              value={kit.brandName}
              onChange={(e) => set('brandName')(e.target.value)}
              placeholder="e.g. Vult Intel"
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={kit.primaryColor}
                  onChange={(e) => set('primaryColor')(e.target.value)}
                  className="size-10 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={kit.primaryColor}
                  onChange={(e) => set('primaryColor')(e.target.value)}
                  className="flex-1 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500/40"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={kit.accentColor}
                  onChange={(e) => set('accentColor')(e.target.value)}
                  className="size-10 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={kit.accentColor}
                  onChange={(e) => set('accentColor')(e.target.value)}
                  className="flex-1 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500/40"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Visual Style</label>
            <div className="grid grid-cols-2 gap-2">
              {VISUAL_STYLES.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => set('visualStyle')(id as BrandKit['visualStyle'])}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                    kit.visualStyle === id
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Generation behavior */}
        <section className="space-y-4 p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Generation Behavior</h3>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Preferred Lighting
            </label>
            <input
              type="text"
              value={kit.lightingPreference}
              onChange={(e) => set('lightingPreference')(e.target.value)}
              placeholder="e.g. dramatic side lighting, golden hour, neon-lit"
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Always Avoid
            </label>
            <input
              type="text"
              value={kit.alwaysAvoid}
              onChange={(e) => set('alwaysAvoid')(e.target.value)}
              placeholder="e.g. watermarks, people's faces, low resolution"
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Custom Prompt Suffix
            </label>
            <textarea
              value={kit.promptSuffix}
              onChange={(e) => set('promptSuffix')(e.target.value)}
              rows={3}
              placeholder="Add any additional context always appended to your prompts, e.g.: 'Always show the product prominently center-frame. Brand colors: deep navy and gold.'"
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm uppercase tracking-widest rounded-xl transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Loader2 className="size-4 animate-spin" /> Saving…</>
          ) : savedOk ? (
            <><CheckCircle2 className="size-4" /> Saved!</>
          ) : (
            <><Save className="size-4" /> Save Brand Kit</>
          )}
        </button>
      </div>
    </div>
  );
}
