import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Film, Image, Trash2, Download, Loader2, Library, Play, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface LibraryAsset {
  id: string;
  outputUrl: string;
  outputType: 'video' | 'image';
  prompt: string;
  createdAt: string;
  style?: string;
}

interface VeoStudioLibraryProps {
  projectId: string;
}

export default function VeoStudioLibrary({ projectId }: VeoStudioLibraryProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const token = await currentUser?.getIdToken();
        const res = await fetch(`${apiBase}/api/veo-studio/library`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-project-id': projectId
          }
        });
        if (!res.ok) throw new Error('Failed to load library');
        const data = await res.json();
        setAssets(data.assets ?? []);
      } catch {
        toast.error('Could not load your library');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [currentUser, projectId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch(`${apiBase}/api/veo-studio/library/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-project-id': projectId
        }
      });
      if (!res.ok) throw new Error();
      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = assets.filter(a => {
    const matchesType = filter === 'all' || a.outputType === filter;
    const matchesSearch = !search || a.prompt.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="size-5 animate-spin text-amber-400" />
        <span className="text-sm">Loading library…</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by prompt…"
            className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/30 transition-all"
          />
        </div>
        {/* Type filter */}
        <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-xl">
          {(['all', 'video', 'image'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                filter === f ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {f === 'all' ? <><SlidersHorizontal className="size-3 inline mr-1" />All</> : f === 'video' ? <><Film className="size-3 inline mr-1" />Videos</> : <><Image className="size-3 inline mr-1" />Images</>}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-600 ml-auto">{filtered.length} assets</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="size-16 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center justify-center">
              <Library className="size-8 text-amber-400/30" strokeWidth={1.5} />
            </div>
            <p className="text-slate-500 text-sm">
              {assets.length === 0
                ? 'Your library is empty. Generate your first video!'
                : 'No assets match your filter.'}
            </p>
            {assets.length === 0 && (
              <button
                onClick={() => navigate('/veo-studio?tab=create')}
                className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold rounded-xl hover:bg-amber-500/20 transition-colors"
              >
                Go to Create
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((asset) => (
              <motion.div
                key={asset.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative aspect-video rounded-xl overflow-hidden border border-white/8 bg-black hover:border-amber-500/30 transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                onMouseEnter={() => setHoveredId(asset.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {asset.outputType === 'video' ? (
                  <video
                    src={asset.outputUrl}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    ref={(el) => {
                      if (el) {
                        hoveredId === asset.id ? el.play().catch(() => {}) : el.pause();
                      }
                    }}
                  />
                ) : (
                  <img src={asset.outputUrl} alt="" className="w-full h-full object-cover" />
                )}

                {/* Type badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] font-bold text-slate-300">
                  {asset.outputType === 'video'
                    ? <><Play className="size-2.5 fill-current" />Video</>
                    : <><Image className="size-2.5" />Image</>}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 gap-2">
                  <p className="text-[10px] text-slate-300 leading-snug line-clamp-2">"{asset.prompt}"</p>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={asset.outputUrl}
                      download
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-500/30 transition-colors"
                    >
                      <Download className="size-3" /> Download
                    </a>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      disabled={deletingId === asset.id}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      {deletingId === asset.id
                        ? <Loader2 className="size-3 animate-spin" />
                        : <Trash2 className="size-3" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
