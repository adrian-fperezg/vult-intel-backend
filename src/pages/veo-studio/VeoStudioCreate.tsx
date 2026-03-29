import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Image,
  Type,
  Wand2,
  Upload,
  Loader2,
  Clapperboard,
  ChevronDown,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

type GenerationMode = 'text-to-video' | 'image-to-video' | 'text-to-image';
type StylePreset = 'cinematic' | 'documentary' | 'commercial' | 'music-video' | 'nature' | 'action' | 'dreamy';
type AspectRatio = '16:9' | '9:16' | '1:1';

interface GenerationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  outputType: 'video' | 'image';
  prompt: string;
}

const STYLE_PRESETS: Record<StylePreset, { label: string; suffix: string }> = {
  cinematic:     { label: '🎬 Cinematic',     suffix: 'cinematic photography, anamorphic lens, film grain, dramatic lighting' },
  documentary:   { label: '📽️ Documentary',   suffix: 'documentary style, natural lighting, handheld camera, authentic' },
  commercial:    { label: '💼 Commercial',    suffix: 'commercial advertisement, high-gloss, product quality lighting, sleek' },
  'music-video': { label: '🎵 Music Video',   suffix: 'music video style, dynamic cuts, creative lighting, vibrant colors' },
  nature:        { label: '🌿 Nature',         suffix: 'nature documentary, macro detail, soft natural light, golden hour' },
  action:        { label: '⚡ Action',         suffix: 'action shot, fast motion, dramatic angle, adrenaline, motion blur' },
  dreamy:        { label: '✨ Dreamy',         suffix: 'dreamlike, soft focus, ethereal light, slow motion, surreal atmosphere' },
};

interface VeoStudioCreateProps {
  projectId: string;
}

export default function VeoStudioCreate({ projectId }: VeoStudioCreateProps) {
  const { currentUser, isFounder } = useAuth();
  const [mode, setMode] = useState<GenerationMode>('text-to-video');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<StylePreset>('cinematic');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string>('');
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';
  
  useEffect(() => {
    async function checkBrandKit() {
      try {
        const token = await currentUser?.getIdToken();
        const res = await fetch(`${apiBase}/api/veo-studio/brand-kit`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-project-id': projectId
          }
        });
        if (res.ok) {
          const data = await res.json();
          // Default to true only if the kit exists and is explicitly active
          if (data && data.isActive) {
            setUseBrandKit(true);
          } else {
            setUseBrandKit(false);
          }
        } else {
          setUseBrandKit(false);
        }
      } catch (err) {
        setUseBrandKit(false);
      }
    }
    checkBrandKit();
  }, [currentUser, projectId, apiBase]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImage(ev.target?.result as string);
      setUploadedImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return toast.error('Enter a prompt first');
    setIsEnhancing(true);
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch(`${apiBase}/api/veo-studio/enhance-prompt`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'x-project-id': projectId
        },
        body: JSON.stringify({ prompt, mode, style })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPrompt(data.enhanced);
      toast.success('Prompt enhanced!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to enhance prompt');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return toast.error('Enter a prompt first');
    if (mode === 'image-to-video' && !uploadedImage) return toast.error('Upload a reference image first');

    setIsGenerating(true);
    setCurrentJob(null);

    try {
      const token = await currentUser?.getIdToken();
      const endpoint = mode === 'text-to-image'
        ? `${apiBase}/api/veo-studio/generate-image`
        : mode === 'image-to-video'
          ? `${apiBase}/api/veo-studio/animate-image`
          : `${apiBase}/api/veo-studio/generate-video`;

      const body: any = {
        prompt: `${prompt}. ${STYLE_PRESETS[style].suffix}`,
        aspectRatio,
        applyBrandKit: useBrandKit,
      };
      if (mode === 'image-to-video' && uploadedImage) {
        body.imageBase64 = uploadedImage;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'x-project-id': projectId
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      const isImageMode = mode === 'text-to-image';

      if (isImageMode) {
        setCurrentJob({
          jobId: data.jobId || 'img-' + Date.now(),
          status: 'completed',
          outputUrl: data.imageUrl,
          outputType: 'image',
          prompt,
        });
        setIsGenerating(false);
      } else {
        // Video: poll for completion
        const jobId = data.jobId;
        setCurrentJob({ jobId, status: 'processing', outputType: 'video', prompt });

        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${apiBase}/api/veo-studio/job-status/${jobId}`, {
              headers: { 
                'Authorization': `Bearer ${token}`,
                'x-project-id': projectId
              }
            });
            const statusData = await statusRes.json();

            if (statusData.status === 'completed') {
              clearInterval(pollInterval);
              setCurrentJob(prev => prev ? { ...prev, status: 'completed', outputUrl: statusData.outputUrl } : null);
              setIsGenerating(false);
              toast.success('Video ready!');
            } else if (statusData.status === 'failed') {
              clearInterval(pollInterval);
              setCurrentJob(prev => prev ? { ...prev, status: 'failed' } : null);
              setIsGenerating(false);
              toast.error('Generation failed. Credit has been refunded.');
            }
          } catch {
            // keep polling
          }
        }, 6000);

        // Timeout after 3 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          if (isGenerating) {
            setCurrentJob(prev => prev ? { ...prev, status: 'failed' } : null);
            setIsGenerating(false);
            toast.error('Generation timed out. Please try again.');
          }
        }, 180000);
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
      setIsGenerating(false);
    }
  };

  const modeTabs: Array<{ id: GenerationMode; icon: React.ElementType; label: string }> = [
    { id: 'text-to-video',  icon: Film,  label: 'Text → Video' },
    { id: 'image-to-video', icon: Image, label: 'Image → Video' },
    { id: 'text-to-image',  icon: Type,  label: 'Text → Image' },
  ];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel — controls */}
      <div className="w-[400px] shrink-0 flex flex-col border-r border-white/5 overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Mode selector */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Generation Mode</label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/[0.03] border border-white/8 rounded-xl">
              {modeTabs.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-bold transition-all',
                    mode === id
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Icon className="size-4" />
                  <span className="leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Image upload — only for image-to-video */}
          <AnimatePresence>
            {mode === 'image-to-video' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Reference Image</label>
                <button
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    'w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all text-sm font-medium',
                    uploadedImage
                      ? 'border-amber-500/40 bg-amber-500/5 text-amber-400'
                      : 'border-white/10 text-slate-500 hover:border-amber-500/30 hover:text-slate-300 hover:bg-white/[0.02]'
                  )}
                >
                  {uploadedImage ? (
                    <>
                      <CheckCircle2 className="size-6 text-amber-400" />
                      <span className="truncate max-w-[90%]">{uploadedImageName}</span>
                      <span className="text-xs text-slate-500">Click to change</span>
                    </>
                  ) : (
                    <>
                      <Upload className="size-6" />
                      <span>Upload reference image</span>
                      <span className="text-xs text-slate-600">PNG, JPG, WebP</span>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                {mode === 'text-to-image' ? 'Image Prompt' : 'Video Prompt'}
              </label>
              <span className="text-[10px] text-slate-600">{prompt.length} chars</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={
                mode === 'text-to-image'
                  ? 'A product shot on a marble surface with dramatic side lighting...'
                  : 'A drone shot over misty mountains at golden hour, slow parallax movement...'
              }
              className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/40 focus:bg-white/[0.05] transition-all"
            />
            <button
              onClick={handleEnhancePrompt}
              disabled={isEnhancing || !prompt.trim()}
              className="mt-2 flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-400 disabled:opacity-40 transition-colors font-semibold"
            >
              {isEnhancing ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              ✨ Enhance with AI
            </button>
          </div>

          {/* Style preset */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Style Preset</label>
            <div className="relative">
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as StylePreset)}
                className="w-full appearance-none bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
              >
                {(Object.keys(STYLE_PRESETS) as StylePreset[]).map((key) => (
                  <option key={key} value={key} className="bg-slate-900">{STYLE_PRESETS[key].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Aspect ratio — not for text-to-image for simplicity */}
          {mode !== 'text-to-image' && (
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Aspect Ratio</label>
              <div className="flex gap-2">
                {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                      aspectRatio === ar
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                    )}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Apply Brand Kit Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-xl mb-2">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Wand2 className="size-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-amber-200 leading-none mb-0.5">Apply Brand Kit</p>
                <p className="text-[10px] text-amber-500/60 font-medium">Use saved visual style & suffixes</p>
              </div>
            </div>
            <button
              onClick={() => setUseBrandKit(!useBrandKit)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                useBrandKit ? "bg-amber-500" : "bg-white/10"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  useBrandKit ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full relative overflow-hidden py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm uppercase tracking-widest rounded-xl transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.35)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Clapperboard className="size-4" />
                {mode === 'text-to-image' ? 'Generate Image' : 'Generate Video'}
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-slate-600">
            {mode === 'text-to-image' ? 'Does not use video credits' : 'Uses 1 video credit · 8s max · 720p'}
          </p>
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 20%, rgba(245,158,11,0.04) 0%, transparent 70%)' }}>

        <AnimatePresence mode="wait">
          {/* Idle state */}
          {!currentJob && !isGenerating && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <div className="size-20 rounded-3xl bg-amber-500/5 border border-amber-500/10 flex items-center justify-center mx-auto">
                <Clapperboard className="size-10 text-amber-400/30" strokeWidth={1.5} />
              </div>
              <p className="text-slate-600 text-sm font-medium">Set your prompt and hit Generate</p>
              <p className="text-slate-700 text-xs">Your creation will appear here</p>
            </motion.div>
          )}

          {/* Generating / loading state */}
          {isGenerating && (!currentJob || currentJob.status === 'processing') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6 w-full max-w-md"
            >
              <div className="relative size-24 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                <Clapperboard className="size-12 text-amber-400" strokeWidth={1.5} />
                <div className="absolute inset-0 rounded-3xl animate-ping bg-amber-500/10" style={{ animationDuration: '2s' }} />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Generating your {mode === 'text-to-image' ? 'image' : 'video'}…</p>
                <p className="text-slate-500 text-xs">This may take 30–90 seconds</p>
              </div>
              {/* Amber shimmer bar */}
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-[shimmer_1.5s_linear_infinite] rounded-full" />
              </div>
            </motion.div>
          )}

          {/* Failed state */}
          {currentJob?.status === 'failed' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-4"
            >
              <AlertCircle className="size-12 text-red-400 mx-auto" />
              <p className="text-white font-semibold">Generation failed</p>
              <p className="text-slate-500 text-sm">Your video credit has been refunded. Try again with a different prompt.</p>
            </motion.div>
          )}

          {/* Completed video */}
          {currentJob?.status === 'completed' && currentJob.outputType === 'video' && currentJob.outputUrl && (
            <motion.div
              key="video-result"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl space-y-4"
            >
              <div className="rounded-2xl overflow-hidden border border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.1)] bg-black">
                <video
                  src={currentJob.outputUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-3">
                <p className="flex-1 text-xs text-slate-500 truncate">"{currentJob.prompt}"</p>
                <a
                  href={currentJob.outputUrl}
                  download="veo-studio-video.mp4"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                >
                  <Download className="size-3.5" /> Download
                </a>
              </div>
            </motion.div>
          )}

          {/* Completed image */}
          {currentJob?.status === 'completed' && currentJob.outputType === 'image' && currentJob.outputUrl && (
            <motion.div
              key="image-result"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-xl space-y-4"
            >
              <div className="rounded-2xl overflow-hidden border border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                <img src={currentJob.outputUrl} alt="Generated" className="w-full" />
              </div>
              <div className="flex items-center gap-3">
                <p className="flex-1 text-xs text-slate-500 truncate">"{currentJob.prompt}"</p>
                <a
                  href={currentJob.outputUrl}
                  download="veo-studio-image.png"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                >
                  <Download className="size-3.5" /> Download
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
