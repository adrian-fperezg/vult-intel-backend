import { useState } from 'react';
import { Search, Plus, Image as ImageIcon, Download, Loader, BarChart3, Type, ArrowRight, Video, X } from 'lucide-react';
import { generateImage, generateVideo } from '@/services/ai';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/contexts/TranslationContext';

// Add type definition for window.aistudio
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function DesignLab() {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{ url: string, prompt: string, type: 'image' | 'video' }[]>([]);
  const [prompt, setPrompt] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      const url = await generateImage(prompt);
      setGeneratedImages(prev => [{ url, prompt, type: 'image' }, ...prev]);
      setPrompt('');
      setShowGenerator(false);
    } catch (error) {
      console.error(error);
      alert("Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnimate = async (imageUrl: string) => {
    try {
      // Check for API key
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        // Assume success and continue, or return and ask user to click again
        // The guidelines say "assume the key selection was successful... Do not add delay"
      }

      setIsAnimating(true);
      const videoUrl = await generateVideo("Animate this image cinematically", imageUrl);
      setGeneratedImages(prev => [{ url: videoUrl, prompt: "Animated version", type: 'video' }, ...prev]);
    } catch (error) {
      console.error(error);
      alert("Failed to animate image. Please ensure you have selected a paid API key.");
    } finally {
      setIsAnimating(false);
      setSelectedImage(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between px-8 py-6 glass-panel border-b-0 border-l-0 border-r-0 border-t-0 bg-background-dark/80 backdrop-blur-md">
        <div>
          <h2 className="text-white text-2xl font-bold tracking-tight">{t('contentGenerator')}</h2>
          <div className="flex items-center gap-2 mt-1">
            <ArrowRight className="text-slate-400 size-4" />
            <p className="text-slate-400 text-sm">{t('designLabSubtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <input
              className="pl-10 pr-4 py-2 bg-surface-dark border border-surface-border rounded-full text-sm text-white focus:outline-none focus:border-primary w-64 transition-all"
              placeholder={t('searchAssets')}
              type="text"
            />
            <Search className="absolute left-3 top-2.5 text-slate-500 size-[18px]" />
          </div>
          <button
            onClick={() => setShowGenerator(true)}
            className="px-4 py-2 bg-primary hover:bg-blue-600 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center gap-2"
          >
            <ImageIcon className="size-[18px]" />
            {t('generateVisuals')}
          </button>
        </div>
      </header>

      {showGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-dark border border-surface-border rounded-xl p-6 w-[500px] shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">{t('generateNewAsset')}</h3>
              <button onClick={() => setShowGenerator(false)} className="text-slate-400 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('describeVisual')}
              className="w-full h-32 bg-background-dark border border-surface-border rounded-lg p-3 text-white focus:border-primary focus:outline-none resize-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowGenerator(false)}
                className="px-4 py-2 text-slate-400 hover:text-white font-medium"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
                className="px-4 py-2 bg-primary hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                {isGenerating ? <Loader className="animate-spin size-4" /> : <ImageIcon className="size-4" />}
                {t('generate')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-8 max-w-7xl mx-auto space-y-10 pb-20 w-full">
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Search className="text-accent-teal size-6" />
                {t('competitorBenchmarking')}
              </h3>
              <p className="text-slate-400 text-sm mt-1">{t('competitorBenchmarkingDesc')}</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs font-medium text-white bg-surface-dark border border-surface-border rounded hover:bg-white/5 transition-colors">SaaS</button>
              <button className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors">E-commerce</button>
              <button className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors">Fintech</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="glass-panel rounded-xl overflow-hidden hover:border-primary/50 transition-all group relative">
              <div className="aspect-[16/10] bg-surface-dark relative border-b border-surface-border">
                <div className="absolute top-0 w-full h-6 bg-surface-dark/90 border-b border-surface-border flex items-center px-2 gap-1.5 z-10">
                  <div className="size-2 rounded-full bg-red-500/50"></div>
                  <div className="size-2 rounded-full bg-yellow-500/50"></div>
                  <div className="size-2 rounded-full bg-green-500/50"></div>
                </div>
                <div className="pt-6 h-full w-full bg-slate-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900"></div>
                  <div className="w-[80%] h-[120px] bg-slate-700/30 rounded-lg absolute top-12 border border-white/5 flex flex-col items-center justify-center p-4">
                    <div className="w-1/2 h-4 bg-white/10 rounded mb-2"></div>
                    <p className="text-xs text-blue-300 mt-2 font-medium">{t('availableOnGrowth')}</p>
                    <div className="mt-4 px-4 py-1.5 bg-blue-500/20 border border-blue-500 text-blue-400 text-xs rounded shadow-[0_0_15px_rgba(59,130,246,0.5)]">Start Scaling</div>
                  </div>
                </div>
                <div className="absolute top-8 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                  <div className="size-3 rounded-full bg-white/20"></div>
                  Linear.app
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-white text-sm font-semibold">Hero Section V3</h4>
                    <p className="text-xs text-slate-500">Captured 2h ago</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20">Gradient</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20">Minimal</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="glass-panel rounded-xl overflow-hidden hover:border-primary/50 transition-all group relative">
              <div className="aspect-[16/10] bg-surface-dark relative border-b border-surface-border">
                <div className="absolute top-0 w-full h-6 bg-surface-dark/90 border-b border-surface-border flex items-center px-2 gap-1.5 z-10">
                  <div className="size-2 rounded-full bg-red-500/50"></div>
                  <div className="size-2 rounded-full bg-yellow-500/50"></div>
                  <div className="size-2 rounded-full bg-green-500/50"></div>
                </div>
                <div className="pt-6 h-full w-full bg-slate-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 to-slate-900"></div>
                  <div className="w-full h-full p-6 grid grid-cols-2 gap-2">
                    <div className="col-span-1 bg-white/5 rounded h-24 border border-white/5"></div>
                    <div className="col-span-1 bg-white/5 rounded h-24 border border-white/5"></div>
                    <div className="col-span-2 h-4 bg-purple-500/20 border border-purple-500/50 rounded shadow-[0_0_15px_rgba(168,85,247,0.3)]"></div>
                  </div>
                </div>
                <div className="absolute top-8 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                  <div className="size-3 rounded-full bg-white/20"></div>
                  Stripe.com
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-white text-sm font-semibold">Pricing Table</h4>
                    <p className="text-xs text-slate-500">Captured 5h ago</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20">Dark Mode</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="glass-panel rounded-xl overflow-hidden hover:border-primary/50 transition-all group relative">
              <div className="aspect-[16/10] bg-surface-dark relative border-b border-surface-border">
                <div className="absolute top-0 w-full h-6 bg-surface-dark/90 border-b border-surface-border flex items-center px-2 gap-1.5 z-10">
                  <div className="size-2 rounded-full bg-red-500/50"></div>
                  <div className="size-2 rounded-full bg-yellow-500/50"></div>
                  <div className="size-2 rounded-full bg-green-500/50"></div>
                </div>
                <div className="pt-6 h-full w-full bg-slate-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#000000]"></div>
                  <div className="absolute right-0 top-10 w-1/2 h-full bg-gradient-to-l from-green-900/40 to-transparent"></div>
                  <div className="absolute left-8 top-16 w-1/3 flex flex-col gap-2">
                    <div className="h-6 w-full bg-white/10 rounded"></div>
                    <div className="h-2 w-2/3 bg-white/5 rounded"></div>
                    <div className="h-8 w-24 bg-white/10 border border-white/20 rounded mt-2"></div>
                  </div>
                </div>
                <div className="absolute top-8 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                  <div className="size-3 rounded-full bg-white/20"></div>
                  Vercel.com
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-white text-sm font-semibold">Dev Experience</h4>
                    <p className="text-xs text-slate-500">Captured 1d ago</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] border border-green-500/20">Technical</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Loader className="text-accent-purple size-6" />
                {t('visualMoodBoard')}
              </h3>
              <p className="text-slate-400 text-sm mt-1">{t('visualMoodBoardDesc')}</p>
            </div>
            <button className="text-sm font-medium text-primary hover:text-blue-400 transition-colors flex items-center gap-1">
              {t('editGuidelines')}
              <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4 auto-rows-[200px]">
            {generatedImages.map((img, idx) => (
              <div key={idx} className="col-span-2 row-span-2 rounded-2xl overflow-hidden relative group border border-surface-border">
                {img.type === 'video' ? (
                  <video src={img.url} autoPlay loop muted className="w-full h-full object-cover" />
                ) : (
                  <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                )}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-white font-medium truncate">{img.prompt}</p>
                  <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                    {img.type === 'image' && (
                      <button
                        onClick={() => handleAnimate(img.url)}
                        disabled={isAnimating}
                        className="bg-white/10 hover:bg-white/20 backdrop-blur text-xs px-3 py-1.5 rounded-full text-white transition-colors flex items-center gap-1"
                      >
                        {isAnimating ? <Loader className="animate-spin size-3" /> : <Video className="size-3" />}
                        {t('animateVeo')}
                      </button>
                    )}
                    <button className="bg-white/10 hover:bg-white/20 backdrop-blur p-1.5 rounded-full text-white transition-colors"><Download className="size-4" /></button>
                  </div>
                </div>
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur border border-white/10 rounded-full px-2 py-1 flex items-center gap-1 text-[10px] text-white">
                  <Loader className="size-3 text-accent-purple" /> AI
                </div>
              </div>
            ))}

            <div className="col-span-2 row-span-2 rounded-2xl overflow-hidden relative group border border-surface-border">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-20 group-hover:opacity-30 transition-opacity"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-64 bg-gradient-to-tr from-blue-600/40 to-purple-600/40 blur-[80px] rounded-full"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <p className="text-white font-medium">Cyberpunk Dashboard Concept</p>
                <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                  <button className="bg-white/10 hover:bg-white/20 backdrop-blur text-xs px-3 py-1.5 rounded-full text-white transition-colors">{t('useAsBase')}</button>
                  <button className="bg-white/10 hover:bg-white/20 backdrop-blur p-1.5 rounded-full text-white transition-colors"><Download className="size-4" /></button>
                </div>
              </div>
              <div className="absolute top-4 right-4 bg-black/40 backdrop-blur border border-white/10 rounded-full px-2 py-1 flex items-center gap-1 text-[10px] text-white">
                <Loader className="size-3 text-accent-purple" /> AI
              </div>
            </div>

            <div className="col-span-1 row-span-1 rounded-2xl overflow-hidden relative group border border-surface-border bg-surface-dark">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 border-4 border-slate-700/50 rounded-full border-t-primary"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-white text-sm font-medium">Loader Animation</p>
              </div>
            </div>

            <div className="col-span-1 row-span-1 rounded-2xl overflow-hidden relative group border border-surface-border bg-surface-dark">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-black p-4 flex flex-col gap-2 justify-center items-center">
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-green-400"></div>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="w-1/3 h-full bg-blue-400"></div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-white text-sm font-medium">Progress Bars</p>
              </div>
            </div>

            <div className="col-span-1 row-span-1 rounded-2xl overflow-hidden relative group border border-surface-border bg-surface-dark">
              <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500">Aa</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-white text-sm font-medium">Type Scale</p>
              </div>
            </div>

            <div
              onClick={() => setShowGenerator(true)}
              className="col-span-1 row-span-1 rounded-2xl border-2 border-dashed border-surface-border hover:border-primary/50 hover:bg-surface-dark/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
            >
              <div className="size-10 rounded-full bg-surface-dark group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus className="text-slate-400 group-hover:text-primary size-6" />
              </div>
              <p className="text-sm text-slate-400 font-medium">{t('newPrompt')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
