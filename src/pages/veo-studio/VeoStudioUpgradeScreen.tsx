import { motion } from 'framer-motion';
import { Clapperboard, Check, Sparkles, Wand2, Film, Image, BookOpen, Palette } from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const ADDON_VEO_PRODUCT_ID = 'prod_U54OcVdHHV38Qv';

const FEATURES = [
  { icon: Film, text: 'AI cinematic video from text prompts' },
  { icon: Image, text: 'Image-to-video animation engine' },
  { icon: Wand2, text: 'Smart prompt enhancer for cinematic style' },
  { icon: BookOpen, text: 'Multi-scene storyboard planner' },
  { icon: Palette, text: 'Brand Kit: consistent visual identity per video' },
  { icon: Sparkles, text: '32 video generations per month (8s max, 720p)' },
];

export default function VeoStudioUpgradeScreen() {
  const { startCheckout, isLoading } = useCheckout();
  const [isStarting, setIsStarting] = useState(false);

  const handleUnlock = async () => {
    setIsStarting(true);
    await startCheckout(ADDON_VEO_PRODUCT_ID, window.location.origin + '/veo-studio', window.location.origin + '/veo-studio');
    setIsStarting(false);
  };

  const busy = isLoading || isStarting;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full py-16 px-8 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,158,11,0.08) 0%, transparent 70%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-2xl w-full text-center space-y-10"
      >
        {/* Hero Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 200 }}
          className="flex items-center justify-center"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-amber-500/25 blur-3xl scale-150 animate-pulse" />
            <div className="relative size-28 rounded-[2rem] bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 flex items-center justify-center shadow-2xl backdrop-blur-sm">
              <Clapperboard className="size-14 text-amber-400 drop-shadow-lg" strokeWidth={1.5} />
            </div>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-black uppercase tracking-[0.2em]">
            <Sparkles className="size-3.5" /> Premium Add-on · $49/mo
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-none">
            Veo{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Studio Pack
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-lg mx-auto leading-relaxed">
            AI-cinematic video & image generation powered by Google's Veo 3.1. Turn words into stunning visuals — directly inside Vult Intel.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left"
        >
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.025] border border-white/8 hover:border-amber-500/20 transition-colors">
              <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="size-4 text-amber-400" />
              </div>
              <span className="text-sm text-slate-300 leading-snug font-medium pt-1">{text}</span>
            </div>
          ))}
        </motion.div>

        {/* Spec pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {['Veo 3.1 Fast', '720p HD', '16:9 Aspect', 'Image → Video', '8s Max Duration', 'Prompt Enhancer'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-slate-400">
              {tag}
            </span>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex flex-col items-center gap-3"
        >
          <button
            onClick={handleUnlock}
            disabled={busy}
            className="group relative overflow-hidden min-w-[260px] py-4 px-8 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-base uppercase tracking-widest rounded-2xl transition-all hover:shadow-[0_0_40px_rgba(245,158,11,0.4)] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_0.8s_forwards]" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              {busy ? (
                <><Loader2 className="size-5 animate-spin" /> Processing…</>
              ) : (
                <><Clapperboard className="size-5" /> Unlock Veo Studio</>
              )}
            </span>
          </button>
          <p className="text-xs text-slate-500">Cancel anytime · Instant access · Billed monthly</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
