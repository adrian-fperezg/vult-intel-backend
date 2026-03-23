import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  History,
  Rocket,
  ChevronDown,
  Plus,
  Settings2,
  Sparkles,
  LayoutTemplate,
  CheckCircle2,
  Globe,
  Copy,
  Save,
  Share2,
  MoreHorizontal,
  AlignLeft,
  Type,
  Hash,
  MessageSquare,
  Megaphone,
  Mail,
  FileText,
  Video,
  Smartphone,
  PenTool,
  X,
  Upload,
  ListTodo,
  Trash2,
  RotateCcw,
  FilePlus,
  ChevronRight,
  Info,
  Clock,
  Search,
  Target,
  Users,
  Download,
  Edit2,
  Bookmark,
  BookmarkCheck,
  PanelRight,
  Lightbulb,
  Eye,
  Link,
  ArrowRight,
  Zap,
  Calendar,
  ChevronLeft,
  Cloud,
  CloudOff,
  Image as ImageIcon,
  Play,
  Monitor,
  Layers,
  Square,
  Maximize2,
  Loader2,
  User,
  LayoutGrid,
  Layers2,
} from 'lucide-react';
import { safeJsonParse } from '@/utils/jsonUtils';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getProjectById, getProjects, Project } from '@/services/scanService';
import { GoogleGenAI } from "@google/genai";
import { logContentGenerated } from '@/services/analytics';
import {
  analyzeResearchSources,
  generateBrainstorming,
  ResearchAnalysis,
  ResearchIdea,
  incrementTokens,
  constructSystemContext,
  generateImage,
  generateVideo,
  validateQuota
} from '@/services/ai';
import {
  saveWorkbenchIdea,
  getWorkbenchIdeas,
  deleteWorkbenchIdea,
  WorkbenchIdea
} from '@/services/researchHubService';
import {
  saveCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  CalendarEvent,
  CalendarEventType,
  EVENT_TYPE_CONFIG,
} from '@/services/calendarService';
import {
  ContentPillar,
  BuyerPersona,
  getContentPillars,
  getBuyerPersonas,
} from '@/services/brandStrategyService';
import { saveDraft, getDrafts, deleteDraft } from '@/services/contentDraftService';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useProject, ActiveProjectData } from '@/contexts/ProjectContext';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { PersonaPurposeConfig } from '@/components/PersonaPurposeConfig';
import { getLanguageDirective } from '@/utils/aiLanguageUtils';
import { exportToDocx } from '@/utils/docxExport';
import { savePersonaPreset, getPersonaPresets, deletePersonaPreset, BrandPersonaPreset } from '@/services/personaPresetsService';
import toast from 'react-hot-toast';

// Initialize Gemini (Insecure: Migrate to backend proxy)
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// --- Data Models ---

interface Campaign {
  id: string;
  title: string;
  lastModified: number;
  isDeleted: boolean;

  // State Snapshot
  userInstruction: string;
  contentTypeId: string;
  platformId: string;
  objectiveId: string;
  selectedPillarId: string;
  selectedAudience: string;

  // Dynamic Lists
  targetAudiences: string[];
  contentPillars: { id: string, label: string, desc: string }[];

  // Brand Persona
  voicePlayful: number;
  voiceCasual: number;
  voiceConservative: number;
  detailLevel: number;
  persuasionLevel: number;
  formattingRules: string;
  prohibitedTerms: string;
  currentPresetId: string | null;

  // Context
  contextFiles: { name: string, content: string }[];
  useExternalSources: boolean;

  // Format
  includeEmojis: boolean;
  includeHashtags: boolean;
  includeCTA: boolean;
  includeBulletPoints: boolean;
  includeQuestions: boolean;
  includeHook: boolean;
  targetWordCount: number | null;

  // Output
  generatedContent: string | null;
  aiInsight: string | null;
  variants: string[];
  activeTab: 'create' | 'planning' | 'research' | 'brainstorm';
}

const CONTENT_TYPES = [
  { id: 'social_post', label: 'Social Media Post', icon: MessageSquare },
  { id: 'social_caption', label: 'Social Caption', icon: Type },
  { id: 'video_script', label: 'Short Form Video Script', icon: Video },
  { id: 'blog_outline', label: 'Blog Outline', icon: ListTodo },
  { id: 'blog_draft', label: 'Blog Draft', icon: AlignLeft },
  { id: 'email_campaign', label: 'Email Campaign', icon: Mail },
  { id: 'email_sequence', label: 'Email Sequence', icon: LayoutTemplate },
  { id: 'landing_copy', label: 'Landing Page Copy', icon: Globe },
  { id: 'ad_copy', label: 'Ad Copy', icon: Megaphone },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'product_desc', label: 'Product Description', icon: Sparkles },
  { id: 'press_release', label: 'Press Release', icon: FileText },
];

const PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', maxLength: 3000 },
  { id: 'twitter', label: 'X (Twitter)', icon: '🐦', maxLength: 280 },
  { id: 'instagram', label: 'Instagram', icon: '📸', maxLength: 2200 },
  { id: 'facebook', label: 'Facebook', icon: '📘', maxLength: 63206 },
  { id: 'youtube', label: 'YouTube', icon: '▶️', maxLength: 5000 },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', maxLength: 2200 },
  { id: 'pinterest', label: 'Pinterest', icon: '📌', maxLength: 500 },
  { id: 'email', label: 'Email', icon: '✉️', maxLength: null },
  { id: 'sms', label: 'SMS', icon: '📱', maxLength: 160 },
  { id: 'google_ads', label: 'Google Ads', icon: '🔍', maxLength: 90 },
];

const OBJECTIVES = [
  { id: 'awareness', label: 'Awareness' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'lead_gen', label: 'Lead Generation' },
  { id: 'conversion', label: 'Conversion' },
  { id: 'retention', label: 'Retention' },
  { id: 'education', label: 'Education' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'event_promo', label: 'Event Promotion' },
];

const TONE_OPTIONS = [
  'Professional', 'Casual', 'Authoritative', 'Friendly', 'Witty', 'Urgent', 'Empathetic', 'Inspirational'
];

const PILLARS = [
  { id: 'thought-leadership', label: 'Thought Leadership', desc: 'Industry trends & insights' },
  { id: 'product', label: 'Product Updates', desc: 'Features & releases' },
  { id: 'culture', label: 'Company Culture', desc: 'Behind the scenes' },
  { id: 'educational', label: 'Educational', desc: 'How-to guides & tips' },
];

// --- Components ---

// --- Components ---

function BrandPersonaModal({
  isOpen,
  onClose,
  project,
  voicePlayful, setVoicePlayful,
  voiceCasual, setVoiceCasual,
  voiceConservative, setVoiceConservative,
  detailLevel, setDetailLevel,
  persuasionLevel, setPersuasionLevel,
  formattingRules, setFormattingRules,
  prohibitedTerms, setProhibitedTerms,
  presets, setPresets,
  currentPresetId, setCurrentPresetId
}: {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  voicePlayful: number; setVoicePlayful: (v: number) => void;
  voiceCasual: number; setVoiceCasual: (v: number) => void;
  voiceConservative: number; setVoiceConservative: (v: number) => void;
  detailLevel: number; setDetailLevel: (v: number) => void;
  persuasionLevel: number; setPersuasionLevel: (v: number) => void;
  formattingRules: string; setFormattingRules: (v: string) => void;
  prohibitedTerms: string; setProhibitedTerms: (v: string) => void;
  presets: BrandPersonaPreset[]; setPresets: (v: BrandPersonaPreset[]) => void;
  currentPresetId: string | null; setCurrentPresetId: (v: string | null) => void;
}) {
  const [newPresetName, setNewPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [activeSection, setActiveSection] = useState<'voice' | 'rules'>('voice');
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSavePreset = async () => {
    if (!newPresetName.trim() || !project) return;
    try {
      const savedPreset = await savePersonaPreset(project.id, {
        name: newPresetName,
        playful: voicePlayful,
        casual: voiceCasual,
        conservative: voiceConservative,
        detailLevel,
        persuasionLevel,
        formattingRules,
        prohibitedTerms
      });
      setPresets([savedPreset, ...presets]);
      setCurrentPresetId(savedPreset.id);
      setNewPresetName('');
      setIsSavingPreset(false);
      toast.success("Preset saved successfully");
    } catch (error) {
      toast.error("Error saving preset");
    }
  };

  const confirmDeletePreset = async () => {
    if (!presetToDelete) return;
    try {
      await deletePersonaPreset(presetToDelete);
      setPresets(presets.filter(p => p.id !== presetToDelete));
      if (currentPresetId === presetToDelete) {
        setCurrentPresetId(null);
      }
      toast.success("Preset deleted");
    } catch (error) {
      toast.error("Error deleting preset");
    } finally {
      setPresetToDelete(null);
    }
  };

  const loadPreset = (preset: BrandPersonaPreset) => {
    setVoicePlayful(preset.playful);
    setVoiceCasual(preset.casual);
    setVoiceConservative(preset.conservative);
    setDetailLevel(preset.detailLevel);
    setPersuasionLevel(preset.persuasionLevel);
    setFormattingRules(preset.formattingRules);
    setProhibitedTerms(preset.prohibitedTerms);
    setCurrentPresetId(preset.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-surface-dark border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white">Brand Persona & Style</h2>
            <p className="text-sm text-slate-400 mt-1">Define the voice, tone, and strict rules for content generation.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-white/5 bg-surface-dark p-6 space-y-3 flex flex-col">
            <button
              onClick={() => setActiveSection('voice')}
              className={cn("w-full text-left px-5 py-3 rounded-xl font-medium text-sm transition-colors", activeSection === 'voice' ? "bg-blue-500/10 text-blue-400 font-semibold" : "text-slate-400 hover:text-white hover:bg-white/5")}
            >
              Voice Trainer
            </button>
            <button
              onClick={() => setActiveSection('rules')}
              className={cn("w-full text-left px-5 py-3 rounded-xl font-medium text-sm transition-colors", activeSection === 'rules' ? "bg-blue-500/10 text-blue-400 font-semibold" : "text-slate-400 hover:text-white hover:bg-white/5")}
            >
              Rules & Constraints
            </button>

            <div className="pt-4 mt-4 border-t border-white/5 flex-1 overflow-y-auto">
              <h3 className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saved Presets</h3>
              <div className="space-y-1">
                {presets.map(preset => (
                  <div key={preset.id} className="group relative flex items-center justify-between">
                    <button
                      onClick={() => loadPreset(preset)}
                      className={cn(
                        "flex-1 text-left px-4 py-2 rounded-lg transition-colors text-xs flex justify-between pr-8",
                        currentPresetId === preset.id ? "bg-white/5 text-white" : "text-slate-500 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <span className="truncate max-w-[130px]">{preset.name}</span>
                      {currentPresetId === preset.id && <span className="text-emerald-500 shrink-0">Active</span>}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPresetToDelete(preset.id); }}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-white/10 rounded transition-all"
                      title="Delete Preset"
                    >
                      <Trash2 className="size-3 cursor-pointer" />
                    </button>
                  </div>
                ))}
                {presets.length === 0 && (
                  <div className="px-4 py-2 text-xs text-slate-600 italic">No saved presets yet.</div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              {isSavingPreset ? (
                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10 shadow-inner">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Preset Name..."
                    className="w-full bg-surface-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSavePreset} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded-lg transition-colors font-medium">Save</button>
                    <button onClick={() => setIsSavingPreset(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 text-xs py-2 rounded-lg transition-colors font-medium">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsSavingPreset(true)}
                  className="w-full py-3 border border-dashed border-white/10 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:border-white/20 transition-colors flex items-center justify-center gap-2 hover:bg-white/[0.02]"
                >
                  <Plus className="size-4" /> Save Current Settings
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-10 overflow-y-auto bg-[#0B0F19]">
            <div className="max-w-3xl space-y-10">

              {activeSection === 'voice' && (
                <div className="space-y-10">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <Sparkles className="size-5 text-blue-500" /> Voice Trainer
                      </h3>
                      <button
                        onClick={() => {
                          setVoicePlayful(0);
                          setVoiceCasual(0);
                          setVoiceConservative(0);
                          setDetailLevel(40);
                          setPersuasionLevel(60);
                        }}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        Reset to Defaults
                      </button>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Adjust how much the AI should deviate from the strict context documents.
                      <strong className="text-white"> 0%</strong> means strictly using the uploaded context style.
                      Higher percentages blend in the selected trait.
                    </p>

                    <div className="space-y-8 bg-surface-dark p-8 rounded-2xl border border-white/10 shadow-lg">
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm font-medium text-slate-300">
                          <span>Strict Context</span>
                          <span>Playful & Witty</span>
                        </div>
                        <input
                          type="range"
                          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          value={voicePlayful}
                          onChange={(e) => setVoicePlayful(parseInt(e.target.value))}
                          min="0" max="100"
                        />
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>0% (Use Docs)</span>
                          <span>{voicePlayful}%</span>
                          <span>100% (Max Playful)</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-sm font-medium text-slate-300">
                          <span>Strict Context</span>
                          <span>Casual & Friendly</span>
                        </div>
                        <input
                          type="range"
                          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          value={voiceCasual}
                          onChange={(e) => setVoiceCasual(parseInt(e.target.value))}
                          min="0" max="100"
                        />
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>0% (Use Docs)</span>
                          <span>{voiceCasual}%</span>
                          <span>100% (Max Casual)</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-sm font-medium text-slate-300">
                          <span>Strict Context</span>
                          <span>Innovative & Bold</span>
                        </div>
                        <input
                          type="range"
                          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          value={voiceConservative} // 0 = Conservative (Context), 100 = Innovative
                          onChange={(e) => setVoiceConservative(parseInt(e.target.value))}
                          min="0" max="100"
                        />
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>0% (Use Docs)</span>
                          <span>{voiceConservative}%</span>
                          <span>100% (Max Innovative)</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/5">
                      <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Content Intensity</h4>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4 bg-surface-dark p-6 rounded-2xl border border-white/5">
                          <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <span>Concise</span>
                            <span>Detailed</span>
                          </div>
                          <input
                            type="range"
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            value={detailLevel}
                            onChange={(e) => setDetailLevel(parseInt(e.target.value))}
                            min="0" max="100"
                          />
                          <div className="text-center text-xs font-mono font-medium text-purple-400">{detailLevel}%</div>
                        </div>
                        <div className="space-y-4 bg-surface-dark p-6 rounded-2xl border border-white/5">
                          <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <span>Informative</span>
                            <span>Persuasive</span>
                          </div>
                          <input
                            type="range"
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            value={persuasionLevel}
                            onChange={(e) => setPersuasionLevel(parseInt(e.target.value))}
                            min="0" max="100"
                          />
                          <div className="text-center text-xs font-mono font-medium text-emerald-400">{persuasionLevel}%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'rules' && (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                      <FileText className="size-5 text-purple-500" /> Formatting Rules
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">Specific structural rules the AI must follow (e.g., "Always start with a question", "Use bullet points for lists").</p>
                    <textarea
                      value={formattingRules}
                      onChange={(e) => setFormattingRules(e.target.value)}
                      placeholder="- Always use H2 for subheaders&#10;- Keep paragraphs under 3 lines&#10;- Use emoji at the end of sentences only"
                      className="w-full h-48 bg-surface-dark border border-white/10 rounded-2xl p-6 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 resize-none shadow-inner"
                    />
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                      <X className="size-5 text-red-500" /> Prohibited Terms
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">Words or phrases the AI is strictly forbidden from using.</p>
                    <textarea
                      value={prohibitedTerms}
                      onChange={(e) => setProhibitedTerms(e.target.value)}
                      placeholder="synergy, deep dive, rockstar, guru, ..."
                      className="w-full h-32 bg-surface-dark border border-white/10 rounded-2xl p-6 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 resize-none shadow-inner"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        <div className="p-5 border-t border-white/5 bg-surface-dark flex justify-end gap-3 rounded-b-3xl">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">Done</button>
        </div>
      </motion.div>
    </div>
  );
}

export default function ContentGenerator() {
  const { projectId } = useParams();
  const location = useLocation();
  const initialPrompt = location.state?.initialPrompt || '';
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const { currentUser } = useAuth();
  const { totalLimits, metrics } = useUserMetrics();
  const { activeProject } = useProject();

  // Cloud save indicator
  const [savedToCloud, setSavedToCloud] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);

  // Effective project id key for Firestore scoping
  const effectiveProjectId = projectId || 'global';

  // Campaign State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [isCampaignMenuOpen, setIsCampaignMenuOpen] = useState(false);

  // UI State
  const [isBrandPersonaOpen, setIsBrandPersonaOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'planning' | 'research' | 'brainstorm'>('create');
  const [generationMode, setGenerationMode] = useState<'copy' | 'design'>('copy');
  const [generateSocialVariations, setGenerateSocialVariations] = useState(false);
  // Unified generation: whether to also auto-generate a cover image in parallel
  const [includeCoverImage, setIncludeCoverImage] = useState(false);
  // Inline image generated together with copy
  const [generatedCoverUrl, setGeneratedCoverUrl] = useState<string | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  // Social Variations state
  const [socialVariations, setSocialVariations] = useState<{ platform: string; icon: string; copy: string }[] | null>(null);
  const [isGeneratingSocialVariations, setIsGeneratingSocialVariations] = useState(false);
  const [socialVariationsOpen, setSocialVariationsOpen] = useState(false);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  // --- Design Lab State ---
  const [imagePrompt, setImagePrompt] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [imageStyle, setImageStyle] = useState('Photorealistic');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoDuration, setVideoDuration] = useState('5s');
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [generatedMediaUrl, setGeneratedMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [generationPurpose, setGenerationPurpose] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('New Campaign');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isContentTypeOpen, setIsContentTypeOpen] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Brand Persona State
  const [voicePlayful, setVoicePlayful] = useState(20);
  const [voiceCasual, setVoiceCasual] = useState(30);
  const [voiceConservative, setVoiceConservative] = useState(40);
  const [formattingRules, setFormattingRules] = useState('');
  const [prohibitedTerms, setProhibitedTerms] = useState('');
  const [presets, setPresets] = useState<BrandPersonaPreset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveProjectId) {
      getPersonaPresets(effectiveProjectId).then(setPresets).catch(console.error);
    }
  }, [effectiveProjectId]);

  // Target Audience State
  const [targetAudiences, setTargetAudiences] = useState<string[]>(['CTOs', 'Product Leads', 'Decision Makers']);
  const [selectedAudience, setSelectedAudience] = useState<string>('CTOs');
  const [newAudienceInput, setNewAudienceInput] = useState('');
  const [isAddingAudience, setIsAddingAudience] = useState(false);

  // Content Pillars State
  const [contentPillars, setContentPillars] = useState(PILLARS);
  const [newPillarInput, setNewPillarInput] = useState('');
  const [isAddingPillar, setIsAddingPillar] = useState(false);

  // Context Source State
  const [contextFiles, setContextFiles] = useState<{ name: string, content: string }[]>([]);
  const [useExternalSources, setUseExternalSources] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controls State
  const [userInstruction, setUserInstruction] = useState(initialPrompt);

  const searchParams = new URLSearchParams(location.search);
  const targetDateFromUrl = searchParams.get('targetDate');
  const [targetDate, setTargetDate] = useState<string | null>(targetDateFromUrl);

  useEffect(() => {
    if (initialPrompt) {
      setUserInstruction(initialPrompt);
    }
  }, [initialPrompt]);
  const [contentType, setContentType] = useState(CONTENT_TYPES[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [selectedPillar, setSelectedPillar] = useState(PILLARS[0].id);

  // Format Controls
  const [includeEmojis, setIncludeEmojis] = useState(true);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeCTA, setIncludeCTA] = useState(true);
  const [includeBulletPoints, setIncludeBulletPoints] = useState(false);
  const [includeQuestions, setIncludeQuestions] = useState(false);
  const [includeHook, setIncludeHook] = useState(true);

  // Sliders State (Legacy - kept for compatibility if needed, but UI moved to modal)
  const [detailLevel, setDetailLevel] = useState(40);
  const [persuasionLevel, setPersuasionLevel] = useState(60);

  // Length State
  const [targetWordCount, setTargetWordCount] = useState<number | null>(null);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);

  // Research Hub State
  const [researchUrlInput, setResearchUrlInput] = useState('');
  const [researchSources, setResearchSources] = useState<{ label: string; content: string; type: 'file' | 'url' }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [researchAnalysis, setResearchAnalysis] = useState<ResearchAnalysis | null>(null);

  // --- Brainstorm State ---
  const [brainstormPrompt, setBrainstormPrompt] = useState('');
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [brainstormIdeas, setBrainstormIdeas] = useState<ResearchIdea[]>([]);

  const [workbenchIdeas, setWorkbenchIdeas] = useState<WorkbenchIdea[]>([]);
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null);
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);
  const researchFileInputRef = useRef<HTMLInputElement>(null);

  // --- Media Generation Handlers ---
  const handleGenerateImage = async () => {
    if (!imagePrompt) return;
    setIsGeneratingMedia(true);
    setGeneratedMediaUrl(null);
    setMediaError(null);
    try {
      // Enrich with project context
      const projectContext = activeProject?.project
        ? `\nBusiness: ${activeProject.project.name} (${activeProject.project.niche}). Description: ${activeProject.project.description}`
        : '';

      const personaContext = activeProject?.personas?.find(p => p.id === selectedPersonaId)
        ? `\nTarget Persona: ${activeProject.personas.find(p => p.id === selectedPersonaId)?.name}. Goals: ${activeProject.personas.find(p => p.id === selectedPersonaId)?.goals}`
        : '';

      const purposeContext = generationPurpose ? `\nObjective: ${generationPurpose}` : '';
      const fullPrompt = `${imagePrompt} style: ${imageStyle}${projectContext}${personaContext}${purposeContext}`;

      const url = await generateImage(fullPrompt, currentUser?.uid);
      setGeneratedMediaUrl(url);
      logContentGenerated('image', 'design_lab');
    } catch (err) {
      console.error('Image generation failed:', err);
      setMediaError(err instanceof Error ? err.message : 'Failed to generate image. Please try again.');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt) return;
    setIsGeneratingMedia(true);
    setGeneratedMediaUrl(null);
    setMediaError(null);
    try {
      // Enrich with project context
      const projectContext = activeProject?.project
        ? `\nBusiness: ${activeProject.project.name} (${activeProject.project.niche})`
        : '';

      const purposeContext = generationPurpose ? `\nObjective: ${generationPurpose}` : '';
      const fullPrompt = `Generate a video with aspect ratio ${videoAspectRatio} and duration ${videoDuration}s. Prompt: ${videoPrompt}${projectContext}${purposeContext}`;

      const url = await generateVideo(fullPrompt, undefined, currentUser?.uid);
      setGeneratedMediaUrl(url);
      logContentGenerated('video', 'design_lab');
    } catch (err) {
      console.error('Video generation failed:', err);
      setMediaError(err instanceof Error ? err.message : 'Failed to generate video. Please try again.');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const handleDownloadMedia = async () => {
    if (!generatedMediaUrl) return;
    try {
      const response = await fetch(generatedMediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vult-intel-${mediaType}-${Date.now()}.${mediaType === 'image' ? 'png' : 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Refs for click outside
  const contentTypeRef = useRef<HTMLDivElement>(null);
  const campaignMenuRef = useRef<HTMLDivElement>(null);


  // Helper to get suggested length
  const getSuggestedLength = (type: string, plat: string, obj: string) => {
    // Logic for suggested length based on best practices
    if (plat === 'twitter') return { min: 20, max: 50, unit: 'words', reason: 'Short & punchy for feed' };
    if (plat === 'linkedin') {
      if (type === 'social_post') return { min: 150, max: 300, unit: 'words', reason: 'Depth for engagement' };
      return { min: 50, max: 150, unit: 'words', reason: 'Standard update' };
    }
    if (type === 'blog_draft') return { min: 800, max: 1500, unit: 'words', reason: 'SEO optimization' };
    if (type === 'email_campaign') return { min: 100, max: 200, unit: 'words', reason: 'High click-through rate' };
    return { min: 100, max: 300, unit: 'words', reason: 'Balanced for platform' };
  };

  const suggestedLength = getSuggestedLength(contentType.id, platform.id, objective.id);

  useEffect(() => {
    // Update target word count when suggestion changes, if not manually set
    setTargetWordCount(Math.floor((suggestedLength.min + suggestedLength.max) / 2));
  }, [contentType.id, platform.id, objective.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contentTypeRef.current && !contentTypeRef.current.contains(event.target as Node)) {
        setIsContentTypeOpen(false);
      }
      if (campaignMenuRef.current && !campaignMenuRef.current.contains(event.target as Node)) {
        setIsCampaignMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (activeProject) {
      setProject(activeProject.project);

      // Map brand strategy to content generator state
      if (activeProject.personas.length > 0) {
        const personasLabels = activeProject.personas.map(p => p.name);
        setTargetAudiences(prev => [...new Set([...prev, ...personasLabels])]);
      }

      if (activeProject.pillars.length > 0) {
        const pillarsList = activeProject.pillars.map(p => ({
          id: p.id || Math.random().toString(36).substring(7),
          label: p.name,
          desc: p.coreTheme
        }));
        setContentPillars(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = pillarsList.filter(p => !existingIds.has(p.id));
          return [...prev, ...newOnes];
        });
      }
    }
  }, [activeProject]);

  // --- Campaign Management ---

  const createDefaultCampaign = (): Campaign => {
    return {
      id: Math.random().toString(36).substring(7),
      title: 'New Campaign',
      lastModified: Date.now(),
      isDeleted: false,
      userInstruction: '',
      contentTypeId: CONTENT_TYPES[0].id,
      platformId: PLATFORMS[0].id,
      objectiveId: OBJECTIVES[0].id,
      selectedPillarId: PILLARS[0].id,
      selectedAudience: 'CTOs',
      targetAudiences: ['CTOs', 'Product Leads', 'Decision Makers'],
      contentPillars: PILLARS,
      voicePlayful: 20,
      voiceCasual: 30,
      voiceConservative: 40,
      detailLevel: 40,
      persuasionLevel: 60,
      formattingRules: '',
      prohibitedTerms: '',
      currentPresetId: null,
      contextFiles: [],
      useExternalSources: false,
      includeEmojis: true,
      includeHashtags: true,
      includeCTA: true,
      includeBulletPoints: false,
      includeQuestions: false,
      includeHook: true,
      targetWordCount: null,
      generatedContent: null,
      aiInsight: null,
      variants: [],
      activeTab: 'create'
    };
  };

  const handleCreateCampaign = () => {
    const newCampaign = createDefaultCampaign();
    setCampaigns(prev => [...prev, newCampaign]);
    loadCampaign(newCampaign);
    setIsCampaignMenuOpen(false);
  };

  const handleSaveDraft = async () => {
    const campaignData: Campaign = {
      id: currentCampaignId || Math.random().toString(36).substring(7),
      title: campaignTitle,
      lastModified: Date.now(),
      isDeleted: false,
      userInstruction,
      contentTypeId: contentType.id,
      platformId: platform.id,
      objectiveId: objective.id,
      selectedPillarId: selectedPillar,
      selectedAudience,
      targetAudiences,
      contentPillars,
      voicePlayful,
      voiceCasual,
      voiceConservative,
      detailLevel,
      persuasionLevel,
      formattingRules,
      prohibitedTerms,
      currentPresetId,
      contextFiles,
      useExternalSources,
      includeEmojis,
      includeHashtags,
      includeCTA,
      includeBulletPoints,
      includeQuestions,
      includeHook,
      targetWordCount,
      generatedContent,
      aiInsight,
      variants,
      activeTab
    };

    if (currentCampaignId) {
      setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? campaignData : c));
    } else {
      setCampaigns(prev => [...prev, campaignData]);
      setCurrentCampaignId(campaignData.id);
    }

    // ── Cloud persist ──────────────────────────────────────────────────
    if (currentUser) {
      setIsSavingToCloud(true);
      try {
        await saveDraft(currentUser.uid, effectiveProjectId, campaignData);
        setSavedToCloud(true);
        setTimeout(() => setSavedToCloud(false), 2000);
      } catch (err) {
        console.error('Cloud save failed:', err);
      } finally {
        setIsSavingToCloud(false);
      }
    }
  };

  const loadCampaign = (campaign: Campaign) => {
    setCurrentCampaignId(campaign.id);
    setCampaignTitle(campaign.title);
    setUserInstruction(campaign.userInstruction);
    setContentType(CONTENT_TYPES.find(c => c.id === campaign.contentTypeId) || CONTENT_TYPES[0]);
    setPlatform(PLATFORMS.find(p => p.id === campaign.platformId) || PLATFORMS[0]);
    setObjective(OBJECTIVES.find(o => o.id === campaign.objectiveId) || OBJECTIVES[0]);
    setSelectedPillar(campaign.selectedPillarId);
    setSelectedAudience(campaign.selectedAudience);
    setTargetAudiences(campaign.targetAudiences || ['CTOs', 'Product Leads', 'Decision Makers']);
    setContentPillars(campaign.contentPillars || PILLARS);
    setVoicePlayful(campaign.voicePlayful);
    setVoiceCasual(campaign.voiceCasual);
    setVoiceConservative(campaign.voiceConservative);
    setDetailLevel(campaign.detailLevel);
    setPersuasionLevel(campaign.persuasionLevel);
    setFormattingRules(campaign.formattingRules);
    setProhibitedTerms(campaign.prohibitedTerms);
    setCurrentPresetId(campaign.currentPresetId);
    setContextFiles(campaign.contextFiles);
    setUseExternalSources(campaign.useExternalSources);
    setIncludeEmojis(campaign.includeEmojis);
    setIncludeHashtags(campaign.includeHashtags);
    setIncludeCTA(campaign.includeCTA);
    setIncludeBulletPoints(campaign.includeBulletPoints);
    setIncludeQuestions(campaign.includeQuestions);
    setIncludeHook(campaign.includeHook);
    setTargetWordCount(campaign.targetWordCount);
    setGeneratedContent(campaign.generatedContent);
    setAiInsight(campaign.aiInsight);
    setVariants(campaign.variants);
    setActiveTab(campaign.activeTab);
    setIsCampaignMenuOpen(false);
  };

  const handleDeleteCampaign = (id: string) => {
    // 1. Calculate new state
    const updatedCampaigns = campaigns.map(c => c.id === id ? { ...c, isDeleted: true } : c);

    // 2. Determine next action
    if (currentCampaignId === id) {
      const remaining = updatedCampaigns.filter(c => !c.isDeleted);
      if (remaining.length > 0) {
        // Switch to first available
        setCampaigns(updatedCampaigns);
        loadCampaign(remaining[0]);
      } else {
        // Create new if none left
        const newCampaign = createDefaultCampaign();
        setCampaigns([...updatedCampaigns, newCampaign]);
        loadCampaign(newCampaign);
      }
    } else {
      // Just update state if not deleting current
      setCampaigns(updatedCampaigns);
    }
  };

  const handleRestoreCampaign = (id: string) => {
    setCampaigns(campaigns.map(c => c.id === id ? { ...c, isDeleted: false } : c));
  };

  const handlePermanentDelete = async (id: string) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
    // Remove from Firestore
    try {
      await deleteDraft(effectiveProjectId, id);
    } catch (err) {
      console.error('Failed to delete draft from Firestore:', err);
    }
  };

  // Auto-save draft on changes (debounced 1s → also persists to Firestore)
  useEffect(() => {
    if (currentCampaignId) {
      const timer = setTimeout(() => {
        handleSaveDraft();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [
    campaignTitle, userInstruction, contentType, platform, objective, selectedPillar, selectedAudience,
    voicePlayful, voiceCasual, voiceConservative, detailLevel, persuasionLevel, formattingRules, prohibitedTerms,
    contextFiles, useExternalSources, includeEmojis, includeHashtags, includeCTA, includeBulletPoints,
    includeQuestions, includeHook, targetWordCount, generatedContent, aiInsight, variants, activeTab,
    currentUser, effectiveProjectId, currentCampaignId
  ]);

  // Load drafts from Firestore on mount / when user changes
  useEffect(() => {
    if (!currentUser) return;
    getDrafts(currentUser.uid, effectiveProjectId).then(drafts => {
      if (drafts.length > 0) {
        // Convert DraftRecord back to Campaign shape (they are structurally identical)
        const loaded = drafts as unknown as Campaign[];
        setCampaigns(loaded);
        // Load the most recent non-deleted draft automatically
        const first = loaded.find(d => !d.isDeleted);
        if (first) loadCampaign(first);
      }
    }).catch(console.error);
  }, [currentUser, effectiveProjectId]);

  const handleAddAudience = () => {
    if (newAudienceInput.trim()) {
      setTargetAudiences([...targetAudiences, newAudienceInput.trim()]);
      setSelectedAudience(newAudienceInput.trim());
      setNewAudienceInput('');
      setIsAddingAudience(false);
    }
  };

  const handleAddPillar = () => {
    if (newPillarInput.trim()) {
      const newId = newPillarInput.toLowerCase().replace(/\s+/g, '-');
      const newPillar = { id: newId, label: newPillarInput.trim(), desc: 'Custom pillar' };
      setContentPillars([...contentPillars, newPillar]);
      setSelectedPillar(newId);
      setNewPillarInput('');
      setIsAddingPillar(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setContextFiles(prev => [...prev, { name: file.name, content }]);
        };
        reader.readAsText(file);
      });
    }
  };

  const removeFile = (index: number) => {
    setContextFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Research Hub Handlers
  const handleResearchFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setResearchSources(prev => [...prev, { label: file.name, content, type: 'file' }]);
      };
      reader.readAsText(file);
    });
    // Reset the input so same file can be re-added
    if (event.target) event.target.value = '';
  };

  const handleAddResearchUrl = () => {
    const url = researchUrlInput.trim();
    if (!url) return;
    // Store URL as a source — Gemini will receive it as a text reference label + URL content hint
    setResearchSources(prev => [...prev, { label: url, content: `[URL Reference] ${url}`, type: 'url' }]);
    setResearchUrlInput('');
  };

  const handleRemoveResearchSource = (index: number) => {
    setResearchSources(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzeSources = async () => {
    if (researchSources.length === 0) return;
    setIsAnalyzing(true);
    setResearchAnalysis(null);
    try {
      const analysis = await analyzeResearchSources(researchSources, project?.niche || 'Marketing', currentUser?.uid, activeProject || undefined);
      setResearchAnalysis(analysis);
    } catch (err) {
      console.error('Research analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateBrainstorm = async () => {
    if (!brainstormPrompt.trim()) {
      alert("Please enter a focus prompt to brainstorm ideas.");
      return;
    }
    setIsBrainstorming(true);
    try {
      const ideas = await generateBrainstorming(brainstormPrompt, currentUser?.uid, activeProject || undefined);
      if (ideas && ideas.length > 0) {
        setBrainstormIdeas(ideas);
      }
    } catch (e) {
      alert("Failed to generate brainstorm ideas. Please try again.");
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleUseInCreate = (idea: ResearchIdea) => {
    setUserInstruction(idea.readyPrompt);
    setActiveTab('create');
  };

  const handleSaveToWorkbench = async (idea: ResearchIdea, index: number) => {
    if (!effectiveProjectId) return;
    const tempId = `temp-${index}`;
    setSavingIdeaId(tempId);
    try {
      await saveWorkbenchIdea(effectiveProjectId, {
        projectId: effectiveProjectId,
        title: idea.title,
        suggestedFormat: idea.suggestedFormat,
        angle: idea.angle,
        readyPrompt: idea.readyPrompt,
      });
      // Reload workbench
      const ideas = await getWorkbenchIdeas(effectiveProjectId);
      setWorkbenchIdeas(ideas);
    } catch (err) {
      console.error('Failed to save to workbench:', err);
    } finally {
      setSavingIdeaId(null);
    }
  };

  const confirmDeleteWorkbenchIdea = async () => {
    if (!ideaToDelete || !effectiveProjectId) return;
    try {
      await deleteWorkbenchIdea(effectiveProjectId, ideaToDelete);
      setWorkbenchIdeas(prev => prev.filter(i => i.id !== ideaToDelete));
      toast.success("Idea removed from Workbench");
    } catch (err) {
      console.error('Failed to delete workbench idea:', err);
      toast.error("Failed to delete idea");
    } finally {
      setIdeaToDelete(null);
    }
  };

  // Load workbench ideas on mount / project change
  useEffect(() => {
    if (!effectiveProjectId) return;
    getWorkbenchIdeas(effectiveProjectId).then(setWorkbenchIdeas).catch(console.error);
  }, [effectiveProjectId]);

  // ---- Calendar State ----
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calView, setCalView] = useState<'month' | 'week'>('month');
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [promptTargetDate, setPromptTargetDate] = useState<string | null>(null);
  const [eventModalDate, setEventModalDate] = useState('');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('social_post');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [dragEventId, setDragEventId] = useState<string | null>(null);

  // Load calendar events on mount / project change
  useEffect(() => {
    if (!projectId) return;
    getCalendarEvents(projectId).then(setCalEvents).catch(console.error);
  }, [projectId]);

  const openCreateEventModal = (dateStr: string) => {
    setEditingEvent(null);
    setEventModalDate(dateStr);
    setEventTitle('');
    setEventType('social_post');
    setEventDescription('');
    setEventStartTime('09:00');
    setEventEndTime('10:00');
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventModalDate(event.date);
    setEventTitle(event.title);
    setEventType(event.eventType);
    setEventDescription(event.description || '');
    setEventStartTime(event.startTime || '09:00');
    setEventEndTime(event.endTime || '10:00');
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!projectId || !eventTitle.trim()) return;
    setIsSavingEvent(true);
    try {
      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, {
          title: eventTitle.trim(),
          eventType,
          description: eventDescription,
          startTime: eventStartTime,
          endTime: eventEndTime,
          date: eventModalDate,
          colorKey: eventType,
        });
        setCalEvents(prev =>
          prev.map(e =>
            e.id === editingEvent.id
              ? { ...e, title: eventTitle.trim(), eventType, description: eventDescription, startTime: eventStartTime, endTime: eventEndTime, date: eventModalDate, colorKey: eventType }
              : e
          )
        );
      } else {
        const newId = await saveCalendarEvent(projectId, {
          projectId,
          title: eventTitle.trim(),
          eventType,
          description: eventDescription,
          date: eventModalDate,
          startTime: eventStartTime,
          endTime: eventEndTime,
          colorKey: eventType,
        });
        setCalEvents(prev => [...prev, {
          id: newId,
          projectId,
          title: eventTitle.trim(),
          eventType,
          description: eventDescription,
          date: eventModalDate,
          startTime: eventStartTime,
          endTime: eventEndTime,
          colorKey: eventType,
          createdAt: Date.now(),
        }]);
      }
      setIsEventModalOpen(false);
    } catch (err) {
      console.error('Failed to save event:', err);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteCalendarEvent(eventId);
      setCalEvents(prev => prev.filter(e => e.id !== eventId));
      setIsEventModalOpen(false);
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const handleEventDrop = async (eventId: string, newDate: string) => {
    setCalEvents(prev => prev.map(e => e.id === eventId ? { ...e, date: newDate } : e));
    try {
      await updateCalendarEvent(eventId, { date: newDate });
    } catch (err) {
      console.error('Failed to update event date:', err);
      // Revert on error
      getCalendarEvents(projectId!).then(setCalEvents).catch(console.error);
    }
  };

  // Calendar grid calculation helpers
  const getCalendarDays = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad to full 6-row grid
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const formatDateStr = (day: number, month: number, year: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // ── Global Brand Strategy ─────────────────────────────────────────────────
  const [brandPillars, setBrandPillars] = useState<ContentPillar[]>([]);
  const [brandPersonas, setBrandPersonas] = useState<BuyerPersona[]>([]);
  const [selectedBrandPillarId, setSelectedBrandPillarId] = useState<string>('');

  useEffect(() => {
    if (!projectId) return;
    getContentPillars(projectId).then(setBrandPillars).catch(console.error);
    getBuyerPersonas(projectId).then(setBrandPersonas).catch(console.error);
  }, [projectId]);

  // Derived: selected objects used by AI prompt builder
  const selectedBrandPersona = brandPersonas.find(p => p.id === selectedPersonaId) || null;
  const selectedBrandPillar = brandPillars.find(p => p.id === selectedBrandPillarId) || null;

  const handleGenerate = async () => {
    if (!project) {
      alert("Project context not found. Please ensure you are accessing this page from a valid project.");
      return;
    }
    setIsGenerating(true);
    setGeneratedContent(null);
    setAiInsight(null);
    setVariants([]);
    setSocialVariations(null);
    setSocialVariationsOpen(false);
    // Start cover image loading indicator if opted-in
    if (includeCoverImage) {
      setIsGeneratingCover(true);
      setGeneratedCoverUrl(null);
    }

    const totalTokensUsed = metrics.tokensUsed || 0;
    const tokensRemaining = (totalLimits.tokens || 500000) - totalTokensUsed;

    try {
      validateQuota(tokensRemaining, currentUser?.email);
      logContentGenerated(contentType.label, 'gemini-1.5-flash');

      let contextContent = "";
      if (contextFiles.length > 0) {
        contextContent = `
        UPLOADED CONTEXT FILES (Primary Source of Truth):
        ${contextFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}\n--- END FILE ---`).join('\n')}
        `;
      }

      const projectSystemContext = constructSystemContext(activeProject || undefined);
      const prompt = `
        Act as a world-class marketing strategist and copywriter for the brand "${project?.name || 'Vult Intel Client'}".
        
        ${projectSystemContext}

        CONTEXT:
        - Niche: ${project?.niche || 'General'}
        - Description: ${project?.description || 'No description provided'}
        - Target Audience: ${selectedBrandPersona?.name || selectedAudience} 
        - Persona Details: ${selectedBrandPersona ? `Job: ${selectedBrandPersona.jobTitle}. Goals: ${selectedBrandPersona.goals}. Pain Points: ${selectedBrandPersona.painPoints}` : 'N/A'}
        - Generation Purpose/Goal: ${generationPurpose}
        - Campaign Title: ${campaignTitle}
        
        BRAND PERSONA & STYLE SETTINGS:
        - Playful/Witty: ${voicePlayful}% (0% = Strict Context Adherence, 100% = Max Playful)
        - Casual/Friendly: ${voiceCasual}% (0% = Strict Context Adherence, 100% = Max Casual)
        - Innovative/Bold: ${voiceConservative}% (0% = Strict Context Adherence, 100% = Max Innovative)
        
        STRICT RULES:
        - Formatting Rules: ${formattingRules || "None specified"}
        - Prohibited Terms: ${prohibitedTerms || "None specified"}
        
        ${contextContent}

        USER INSTRUCTION: "${userInstruction}"
        
        If the user instruction is empty, default to creating a ${contentType.label} for ${platform.label} with objective ${objective.label}.
        
        TASK:
        1. Analyze the request and categorize it into one of these sections: 'create' (content assets), 'planning' (calendars/schedules), or 'research' (keywords/topics).
        2. ${generateSocialVariations && contentType.id === 'social_caption' ? 'Generate exactly 1 overarching variant divided internally into 4 completely distinct adaptations for LinkedIn, Twitter/X, Instagram, and Facebook respectively. Format them clearly with headers inside the SAME variant.' : 'Generate exactly 3 distinct variants/drafts based on the instruction and constraints.'}
        3. Use the BEST marketing strategies specifically for the "${selectedAudience}" audience in the "${project.niche}" industry.
        
        IMPORTANT RESTRICTIONS:
        ${useExternalSources
          ? "- You MAY use external knowledge from Google Search to enrich the content."
          : "- You MUST STRICTLY use ONLY the information provided in the 'UPLOADED CONTEXT FILES' and the Project Context above. Do NOT hallucinate or use outside knowledge if it contradicts or is not found in the provided context."}

        STYLE ADAPTATION INSTRUCTIONS:
        - If a style slider is at 0%, you MUST mimic the tone and style of the UPLOADED CONTEXT FILES exactly.
        - If a style slider is > 0%, blend that trait into the base style proportionally.
        - STRICTLY AVOID any terms listed in 'Prohibited Terms'.
        - STRICTLY FOLLOW any rules listed in 'Formatting Rules'.

        CONSTRAINTS (Apply if relevant to the category):
        - Content Pillar: ${contentPillars.find(p => p.id === selectedPillar)?.label || "None"} (Ensure content aligns with this pillar)
        - Max Length: ${platform.maxLength ? `${platform.maxLength} characters` : 'Appropriate for medium'}
        - Target Length: ${targetWordCount ? `Approx ${targetWordCount} words` : 'Best practice for platform'}
        - Detail Level: ${detailLevel}/100
        - Persuasion Level: ${persuasionLevel}/100
        - Emojis: ${includeEmojis ? 'Yes (use sparingly)' : 'No'}
        - Hashtags: ${includeHashtags ? 'Yes (relevant ones)' : 'No'}
        - CTA: ${includeCTA ? 'Yes (clear and compelling)' : 'No'}
        - Hook: ${includeHook ? 'Yes (strong attention grabber)' : 'No'}
        - Bullet Points: ${includeBulletPoints ? 'Yes (for readability)' : 'No'}
        - Questions: ${includeQuestions ? 'Yes (to drive engagement)' : 'No'}
        
        OUTPUT FORMAT (JSON):
        {
          "category": "create" | "planning" | "research",
          "variants": ["Draft 1 content...", "Draft 2 content...", "Draft 3 content..."],
          "insight": "Brief explanation of the strategy behind these drafts and why they fit the user's request."
        }
        
        ${getLanguageDirective()}
      `;

      const model = "gemini-1.5-flash";
      const tools = useExternalSources ? [{ googleSearch: {} }] : [];

      // Auto-derive cover image prompt from context
      const autoCoverPrompt = `Marketing cover image for "${project?.name || 'Brand'}" (${project?.niche || 'business'}). ${userInstruction}. Style: modern, professional, ${imageStyle || 'Photorealistic'}. No text overlays.`;

      // Fire text generation and (optional) image generation in parallel
      const [textResult, imageResult] = await Promise.allSettled([
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json", tools }
        }),
        includeCoverImage
          ? generateImage(autoCoverPrompt, currentUser?.uid)
          : Promise.resolve(null),
      ]);

      // --- Handle text result ---
      if (textResult.status === 'fulfilled') {
        const result = textResult.value;
        const responseText = result.text;
        const tokens = result.usageMetadata?.totalTokenCount ?? 0;
        await incrementTokens(currentUser?.uid, tokens);

        if (responseText) {
          let data;
          try {
            data = safeJsonParse(responseText);
          } catch (e) {
            console.warn("Could not parse JSON, using raw text as content", e);
            data = { category: 'create', variants: [responseText], insight: "Generated content (Raw format)" };
          }

          if (data.category && ['create', 'planning', 'research'].includes(data.category)) {
            setActiveTab(data.category);
          }
          setVariants(data.variants || []);
          setGeneratedContent(data.variants?.[0] || '');
          setAiInsight(data.insight);
          setActiveVariant(0);

          // Auto-save to Calendar if targetDate is set
          if (targetDate && data.variants?.length > 0) {
            try {
              await saveCalendarEvent(effectiveProjectId, {
                projectId: effectiveProjectId,
                title: `${contentType.label} for ${platform.label}`,
                date: targetDate,
                eventType: 'social_post',
                colorKey: 'bg-blue-500/15',
                description: data.variants[0],
              });
              toast.success('Contenido guardado automáticamente en el Calendario');
            } catch (e) {
              console.error('Failed to auto-save to calendar', e);
            }
          }
        }
      } else {
        console.error("Text generation failed:", textResult.reason);
        toast.error("Copy generation failed. Please try again.");
      }

      // --- Handle image result ---
      if (includeCoverImage) {
        if (imageResult.status === 'fulfilled' && imageResult.value) {
          setGeneratedCoverUrl(imageResult.value as string);
        } else {
          console.warn("Cover image generation failed:", imageResult.status === 'rejected' ? imageResult.reason : 'No URL returned');
          toast.error("Cover image generation failed. Copy was saved successfully.", { duration: 4000 });
        }
        setIsGeneratingCover(false);
      }

    } catch (error) {
      console.error("Generation failed", error);
      toast.error("Failed to generate content. Error: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Social Variations – on-demand ──────────────────────────────────────────
  const SOCIAL_PLATFORMS_CONFIG = [
    { id: 'linkedin', label: 'LinkedIn', icon: '💼', tone: 'Professional, insightful, 150-300 words, no hashtag spam' },
    { id: 'twitter', label: 'Twitter/X', icon: '𝕏', tone: 'Short & punchy, max 280 chars, 1-2 hashtags, hook in first line' },
    { id: 'facebook', label: 'Facebook', icon: '📘', tone: 'Conversational, storytelling-first, 80-150 words, 1 CTA' },
    { id: 'instagram', label: 'Instagram', icon: '📸', tone: 'Visual-first caption, emoji-friendly, 3-5 hashtags, 60-100 words' },
  ];

  const handleGenerateSocialVariations = async () => {
    if (!generatedContent) return;
    setIsGeneratingSocialVariations(true);
    setSocialVariations(null);
    setSocialVariationsOpen(true);

    try {
      const variationPrompt = `
        You are a social media copy expert. Your ONLY task is to rewrite and adapt the following original copy for 4 different platforms.
        
        ORIGINAL COPY:
        "${generatedContent}"
        
        RULES (STRICT — DO NOT deviate):
        - Keep the SAME central theme, message, and objective as the original.
        - Only adapt the length, tone, format and style per platform.
        - Do NOT add new information that is not in the original.
        - Do NOT change the core CTA or brand positioning.
        
        PLATFORM REQUIREMENTS:
        ${SOCIAL_PLATFORMS_CONFIG.map(p => `- ${p.label}: ${p.tone}`).join('\n')}
        
        OUTPUT FORMAT (JSON only, no markdown):
        {
          "variations": [
            { "platform": "LinkedIn",  "copy": "..." },
            { "platform": "Twitter/X", "copy": "..." },
            { "platform": "Facebook",  "copy": "..." },
            { "platform": "Instagram", "copy": "..." }
          ]
        }
        
        ${getLanguageDirective()}
      `;

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: 'user', parts: [{ text: variationPrompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const tokens = result.usageMetadata?.totalTokenCount ?? 0;
      await incrementTokens(currentUser?.uid, tokens);

      const data = safeJsonParse(result.text || '{}');
      if (data.variations?.length) {
        const mapped = data.variations.map((v: { platform: string; copy: string }) => ({
          platform: v.platform,
          icon: SOCIAL_PLATFORMS_CONFIG.find(p => p.label === v.platform)?.icon || '🌐',
          copy: v.copy,
        }));
        setSocialVariations(mapped);
        setExpandedPlatform(mapped[0]?.platform || null);
      }
    } catch (err) {
      console.error("Social variations generation failed:", err);
      toast.error("Failed to generate social variations.");
    } finally {
      setIsGeneratingSocialVariations(false);
    }
  };








  return (
    <div className="flex flex-col min-h-[100dvh] bg-background-dark text-white font-sans selection:bg-blue-500/30">
      <BrandPersonaModal
        isOpen={isBrandPersonaOpen}
        onClose={() => setIsBrandPersonaOpen(false)}
        project={project}
        voicePlayful={voicePlayful} setVoicePlayful={setVoicePlayful}
        voiceCasual={voiceCasual} setVoiceCasual={setVoiceCasual}
        voiceConservative={voiceConservative} setVoiceConservative={setVoiceConservative}
        detailLevel={detailLevel} setDetailLevel={setDetailLevel}
        persuasionLevel={persuasionLevel} setPersuasionLevel={setPersuasionLevel}
        formattingRules={formattingRules} setFormattingRules={setFormattingRules}
        prohibitedTerms={prohibitedTerms} setProhibitedTerms={setProhibitedTerms}
        presets={presets} setPresets={setPresets}
        currentPresetId={currentPresetId} setCurrentPresetId={setCurrentPresetId}
      />

      {/* Trash Modal */}
      <AnimatePresence>
        {showTrash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background-dark border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Trash2 className="size-5 text-red-500" /> Trash
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Recover deleted campaigns or remove them permanently.</p>
                </div>
                <button onClick={() => setShowTrash(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {campaigns.filter(c => c.isDeleted).length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic">Trash is empty</div>
                ) : (
                  campaigns.filter(c => c.isDeleted).map(campaign => (
                    <div key={campaign.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-surface-dark border border-white/5 rounded-xl group hover:border-white/10 transition-colors gap-3">
                      <div>
                        <h3 className="font-medium text-white">{campaign.title}</h3>
                        <p className="text-xs text-slate-500">Last modified: {new Date(campaign.lastModified).toLocaleDateString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleRestoreCampaign(campaign.id)}
                          className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
                        >
                          <RotateCcw className="size-3.5" /> Restore
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(campaign.id)}
                          className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
                        >
                          <Trash2 className="size-3.5" /> Delete Forever
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="py-4 lg:py-0 lg:h-20 border-b border-white/5 bg-background-dark/80 backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between px-4 lg:px-8 shrink-0 z-20 sticky top-0 gap-4 lg:gap-0">
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <h1 className="text-xl font-bold tracking-tight shrink-0">Content Generator</h1>
          <div className="hidden lg:block h-5 w-px bg-white/10" />

          {/* Campaign Selector */}
          <div className="relative" ref={campaignMenuRef}>
            <button
              onClick={() => setIsCampaignMenuOpen(!isCampaignMenuOpen)}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5"
            >
              <span className="text-slate-500">Campaign:</span>
              <span className="font-medium max-w-[200px] truncate">{campaignTitle}</span>
              <ChevronDown className="size-3.5 text-slate-500" />
            </button>

            <AnimatePresence>
              {isCampaignMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute top-full left-0 mt-2 w-72 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-2 border-b border-white/5">
                    <button
                      onClick={handleCreateCampaign}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    >
                      <FilePlus className="size-4" /> New Campaign
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    <div className="px-3 py-1 text-xs font-bold text-slate-500 uppercase tracking-wider">Active Campaigns</div>
                    {campaigns.filter(c => !c.isDeleted).length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-600 italic">No other campaigns</div>
                    )}
                    {campaigns.filter(c => !c.isDeleted).map(campaign => (
                      <div key={campaign.id} className="flex items-center group">
                        <button
                          onClick={() => loadCampaign(campaign)}
                          className={cn(
                            "flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors truncate",
                            currentCampaignId === campaign.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
                          )}
                        >
                          {campaign.title}
                        </button>
                        {currentCampaignId === campaign.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCampaign(campaign.id);
                            }}
                            className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete Campaign"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-2 border-t border-white/5 bg-background-dark">
                    <button
                      onClick={() => {
                        setShowTrash(true);
                        setIsCampaignMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2"><Trash2 className="size-4" /> Trash</span>
                      <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-slate-500">
                        {campaigns.filter(c => c.isDeleted).length}
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Inline Edit for Title (Only visible when not in menu mode, but we replaced the whole block. 
              We can keep the inline edit capability if the user clicks the title in the header, 
              but the dropdown approach is cleaner for switching. 
              Let's add a small edit button next to the dropdown trigger if needed, 
              or just allow editing the title in the inputs below? 
              Actually, the user asked for "dropdown menu where campaign name is mentioned". 
              So the dropdown IS the way to switch. 
              To EDIT the name of the CURRENT campaign, we can keep an input field somewhere or 
              allow double clicking the trigger? 
              Let's add a separate edit button or input field in the "Project Context" or "Campaign Details" section?
              Or, simpler: Keep the edit button next to the dropdown trigger.
          */}
          <button
            onClick={() => setIsEditingTitle(true)}
            className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-md hover:bg-white/5"
            title="Rename Campaign"
          >
            <PenTool className="size-3.5" />
          </button>

          {isEditingTitle && (
            <div className="absolute top-16 left-48 z-50 bg-surface-dark border border-white/10 p-2 rounded-lg shadow-xl flex gap-2">
              <input
                type="text"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    handleSaveDraft(); // Save name change immediately
                  }
                }}
                autoFocus
                className="bg-surface-light border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button onClick={() => { setIsEditingTitle(false); handleSaveDraft(); }} className="px-2 py-1 bg-blue-600 rounded text-xs text-white">Save</button>
            </div>
          )}

        </div>

        <div className="flex items-center gap-1.5 bg-surface-dark p-1.5 rounded-xl border border-white/10 overflow-x-auto hide-scrollbar w-full lg:w-auto shrink-0">
          {[
            { id: 'create', label: 'Create' },
            { id: 'planning', label: 'Planning' },
            { id: 'research', label: 'Research' },
            { id: 'brainstorm', label: 'Brainstorm' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-semibold transition-all",
                activeTab === tab.id ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto justify-end mt-4 lg:mt-0 shrink-0">
          <button className="p-2.5 text-slate-400 hover:text-white transition-colors" title="History">
            <History className="size-5" />
          </button>
          <button
            onClick={handleSaveDraft}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold transition-colors"
          >
            Save Draft
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Sparkles className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Generate
          </button>
        </div>
      </header>

      {/* Target Date Banner */}
      {targetDate && activeTab !== 'planning' && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-center gap-2 text-sm text-blue-400 font-medium">
          <Calendar className="size-4" />
          Generando contenido programado para: {targetDate}
          <button
            onClick={() => {
              setTargetDate(null);
              navigate(location.pathname, { replace: true });
            }}
            className="ml-2 hover:text-white transition-colors p-1"
            title="Clear target date"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative w-full">

        {/* Unified Creation Sidebar (Left) — hidden in Research, Planning, and Brainstorm modes */}
        <AnimatePresence>
          {activeTab !== 'research' && activeTab !== 'planning' && activeTab !== 'brainstorm' && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="!w-full lg:!w-[400px] border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-surface-dark/40 flex flex-col overflow-y-auto custom-scrollbar flex-shrink-0 z-10"
            >
              <div className="p-8 space-y-8">
                {/* ── Header ── */}
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="size-4 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Generation Studio</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Configure content parameters</p>
                  </div>
                </div>

                {/* ── Brand Strategy Context (Read-Only) ── */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-300 tracking-wide">Brand Context</p>
                    <a href="/global-brand-strategy" className="text-[13px] font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 group">
                      Edit <ChevronRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                  <div className="bg-surface-light border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 flex items-center gap-1.5"><User className="size-3.5 text-blue-400" /> Target Persona</span>
                      <span className="text-xs text-white font-medium truncate max-w-[150px] text-right" title={selectedBrandPersona?.name || 'Global Default'}>
                        {selectedBrandPersona?.name || 'Global Default'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 flex items-center gap-1.5"><Target className="size-3.5 text-purple-400" /> Target Pillar</span>
                      <span className="text-xs text-white font-medium truncate max-w-[150px] text-right" title={selectedBrandPillar?.name || 'All-rounder'}>
                        {selectedBrandPillar?.name || 'All-rounder'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-white/[0.06]" />

                {/* ── Output Mode Toggle (Copy / Media) ── */}
                <div className="flex items-center justify-between pt-2">
                  <h3 className="text-xs font-semibold text-slate-300 tracking-wide">Output Mode</h3>
                  <div className="flex p-1 bg-surface-light rounded-xl border border-white/10 relative shadow-inner">
                    <motion.div
                      className={cn("absolute inset-y-1 rounded-lg shadow-sm border border-white/5", generationMode === 'copy' ? 'bg-surface-mid' : 'bg-surface-mid')}
                      initial={false}
                      animate={{
                        left: generationMode === 'copy' ? '4px' : '50%',
                        width: 'calc(50% - 4px)'
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                    <button
                      onClick={() => setGenerationMode('copy')}
                      className={cn("relative z-10 w-20 py-1.5 text-[13px] font-bold rounded-lg transition-colors", generationMode === 'copy' ? "text-blue-400" : "text-slate-500 hover:text-slate-300")}
                    >Copy</button>
                    <button
                      onClick={() => setGenerationMode('design')}
                      className={cn("relative z-10 w-20 py-1.5 text-[13px] font-bold rounded-lg transition-colors", generationMode === 'design' ? "text-purple-400" : "text-slate-500 hover:text-slate-300")}
                    >Media</button>
                  </div>
                </div>

                {contentType.id === 'social_caption' && generationMode === 'copy' && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-4 h-4 rounded border border-white/20 bg-background-dark group-hover:border-blue-500 transition-colors">
                      <input
                        type="checkbox"
                        className="opacity-0 absolute inset-0 cursor-pointer"
                        checked={generateSocialVariations}
                        onChange={(e) => setGenerateSocialVariations(e.target.checked)}
                      />
                      {generateSocialVariations && <CheckCircle2 className="w-3 h-3 text-blue-500" />}
                    </div>
                    <span className="text-[13px] text-slate-400 group-hover:text-slate-300 transition-colors">Generar variaciones para cada red social</span>
                  </label>
                )}

                {/* ── Content Configuration ── */}
                <AnimatePresence mode="wait">
                  {generationMode === 'copy' ? (
                    <motion.div
                      key="copy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-5"
                    >
                      {/* Platform & Format Selector */}
                      <div className="space-y-3 relative" ref={contentTypeRef}>
                        <label className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-2">
                          <LayoutGrid className="size-4 text-slate-400" /> Platform & Format
                        </label>
                        <button
                          onClick={() => setIsContentTypeOpen(!isContentTypeOpen)}
                          className="w-full bg-surface-light border border-white/10 hover:border-white/20 rounded-2xl px-5 py-4 text-sm text-left flex items-center justify-between transition-all group shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{platform.icon}</span>
                            <span className="text-white font-medium">{contentType.label}</span>
                            <span className="text-slate-500 text-xs">— {platform.label}</span>
                          </div>
                          <ChevronDown className={cn("size-4 text-slate-500 transition-transform group-hover:text-white", isContentTypeOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                          {isContentTypeOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute top-16 left-0 right-0 max-h-64 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50 overflow-y-auto custom-scrollbar"
                            >
                              {CONTENT_TYPES.map(type => (
                                <div key={type.id} className="p-2 border-b border-white/5 last:border-0">
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{type.label}</div>
                                  {PLATFORMS.map(plat => (
                                    <button
                                      key={`${type.id} -${plat.id} `}
                                      onClick={() => {
                                        setContentType(type);
                                        setPlatform(plat);
                                        setIsContentTypeOpen(false);
                                      }}
                                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-500/10 hover:text-blue-400 rounded-lg text-left transition-colors text-slate-300"
                                    >
                                      <span className="text-base shrink-0 transition-opacity">{plat.icon}</span>
                                      <span className="text-xs font-medium">{plat.label}</span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Purpose Input */}
                      <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-2">
                          <Target className="size-4 text-slate-400" /> Specific Purpose / Objective
                        </label>
                        <input
                          type="text"
                          value={generationPurpose}
                          onChange={(e) => setGenerationPurpose(e.target.value)}
                          placeholder="e.g., Anniversary promo, Webinar lead gen..."
                          className={cn(
                            "w-full bg-surface-light border rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 transition-all shadow-inner placeholder:text-slate-600",
                            !generationPurpose ? "border-amber-500/50 focus:ring-amber-500/20" : "border-white/10 focus:ring-blue-500/20"
                          )}
                        />
                      </div>

                      {/* Target Length */}
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300 tracking-wide">Target Length</label>
                          <span className="text-xs text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full font-medium border border-blue-500/20">
                            {suggestedLength.min}–{suggestedLength.max} {suggestedLength.unit}
                          </span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[13px] text-slate-500 pointer-events-none">Words:</span>
                          <input
                            type="number"
                            value={targetWordCount || ''}
                            onChange={(e) => setTargetWordCount(parseInt(e.target.value))}
                            placeholder={`${suggestedLength.min}–${suggestedLength.max} `}
                            className="w-full bg-surface-light border border-white/10 rounded-2xl pl-20 pr-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:border-blue-500/40 text-right placeholder:text-slate-600 transition-all font-medium shadow-inner"
                          />
                        </div>
                      </div>

                      {/* Include Cover Image toggle */}
                      <label className="flex items-center gap-2 mt-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-4 h-4 rounded border border-white/20 bg-background-dark group-hover:border-blue-500 transition-colors shrink-0">
                          <input
                            type="checkbox"
                            className="opacity-0 absolute inset-0 cursor-pointer"
                            checked={includeCoverImage}
                            onChange={(e) => setIncludeCoverImage(e.target.checked)}
                          />
                          {includeCoverImage && <CheckCircle2 className="w-3 h-3 text-blue-500" />}
                        </div>
                        <span className="text-[13px] text-slate-400 group-hover:text-slate-300 transition-colors">
                          Generate cover image automatically
                        </span>
                      </label>
                    </motion.div>
                  ) : (

                    <motion.div
                      key="design"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-5"
                    >
                      {/* Media Format Toggle */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setMediaType('image')}
                          className={cn("px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex justify-center gap-2 items-center", mediaType === 'image' ? "bg-purple-600/10 border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]" : "bg-surface-light border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]")}
                        >
                          Image
                        </button>
                        <button
                          onClick={() => setMediaType('video')}
                          className={cn("px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex justify-center gap-2 items-center", mediaType === 'video' ? "bg-purple-600/10 border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]" : "bg-surface-light border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]")}
                        >
                          Video
                        </button>
                      </div>

                      {/* Prompt Input */}
                      <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-2">
                          <Sparkles className="size-4 text-slate-400" /> Visual Description
                        </label>
                        <textarea
                          value={mediaType === 'image' ? imagePrompt : videoPrompt}
                          onChange={(e) => mediaType === 'image' ? setImagePrompt(e.target.value) : setVideoPrompt(e.target.value)}
                          placeholder={`Describe what you want to see ${mediaType === 'image' ? 'in the image' : 'in the video'}...`}
                          className="w-full h-32 bg-surface-light border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all resize-none shadow-inner custom-scrollbar placeholder:text-slate-600 leading-relaxed"
                        />
                      </div>

                      {/* Media Caption Input */}
                      <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-2">
                          <Type className="size-4 text-slate-400" /> Caption / Copy
                        </label>
                        <textarea
                          value={mediaCaption}
                          onChange={(e) => setMediaCaption(e.target.value)}
                          placeholder="Add a caption or description for this media..."
                          className="w-full h-24 bg-surface-light border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all resize-none shadow-inner custom-scrollbar placeholder:text-slate-600 leading-relaxed"
                        />
                      </div>

                      {/* Platform Versions Suggestion */}
                      <div className="pt-2">
                        <button
                          onClick={() => {
                            toast.success("Generating platform-optimized versions...");
                            // This would trigger a multi-platform media generation logic
                          }}
                          className="w-full py-3 px-4 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-xs font-bold text-purple-400 transition-all flex items-center justify-center gap-2"
                        >
                          <Layers className="size-3.5" />
                          Generate similar versions for each platform
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-px bg-white/[0.06]" />

                {/* ── Generate Action ── */}
                <div className="pt-2">
                  <button
                    onClick={generationMode === 'copy' ? handleGenerate : (mediaType === 'image' ? handleGenerateImage : handleGenerateVideo)}
                    disabled={isGenerating || isGeneratingMedia || (generationMode === 'copy' ? !generationPurpose : (mediaType === 'image' ? !imagePrompt : !videoPrompt))}
                    className={cn(
                      "w-full group relative flex items-center justify-center gap-2 py-5 rounded-2xl text-[15px] font-bold transition-all overflow-hidden border",
                      (isGenerating || isGeneratingMedia || (generationMode === 'copy' ? !generationPurpose : (mediaType === 'image' ? !imagePrompt : !videoPrompt)))
                        ? "bg-surface-light text-slate-600 cursor-not-allowed border-white/5"
                        : generationMode === 'copy'
                          ? "bg-blue-600 text-white hover:bg-blue-500 border-blue-400/50 shadow-[0_0_25px_rgba(59,130,246,0.3)]"
                          : "bg-purple-600 text-white hover:bg-purple-500 border-purple-400/50 shadow-[0_0_25px_rgba(168,85,247,0.3)]"
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {(isGenerating || isGeneratingMedia) ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-3"
                        >
                          <Sparkles className="size-4 animate-spin text-white/50" />
                          <span className="text-white/90">{generationMode === 'copy' ? 'Crafting Copy...' : 'Generating Media...'}</span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center gap-2"
                        >
                          <span>Generate {generationMode === 'copy' ? 'Copy' : mediaType === 'image' ? 'Image' : 'Video'}</span>
                          <Rocket className="size-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform text-white/80" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] skew-x-[45deg] group-hover:translate-x-[150%] transition-transform duration-1000" />
                  </button>
                  {generationMode === 'copy' && !generationPurpose && (
                    <p className="mt-3 text-xs text-amber-400/80 text-center flex items-center justify-center gap-1 font-medium bg-amber-500/10 py-2 rounded-lg border border-amber-500/20">
                      <Info className="size-3.5" /> Purpose / Objective is required
                    </p>
                  )}
                  {generationMode === 'design' && ((mediaType === 'image' && !imagePrompt) || (mediaType === 'video' && !videoPrompt)) && (
                    <p className="mt-3 text-xs text-amber-400/80 text-center flex items-center justify-center gap-1 font-medium bg-amber-500/10 py-2 rounded-lg border border-amber-500/20">
                      <Info className="size-3.5" /> Visual Description is required
                    </p>
                  )}
                </div>

              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Zone C: Output Workspace (Right) */}
        <main className="flex-1 bg-background-dark flex flex-col relative overflow-hidden">

          <div className="bg-blue-500/10 border-b border-blue-500/20 px-8 py-4 flex items-start gap-4">
            <Info className="size-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-bold text-blue-300">
                {activeTab === 'create' && "Create: "}
                {activeTab === 'planning' && "Planning: "}
                {activeTab === 'research' && "Research: "}
                {activeTab === 'brainstorm' && "Brainstorm: "}
              </span>
              <span className="text-blue-100/80 ml-1">
                {activeTab === 'create' && "Generate specific content pieces based on your defined parameters."}
                {activeTab === 'planning' && "Plan and schedule your upcoming content calendar intuitively."}
                {activeTab === 'research' && "Analyze source links and extract key information before writing."}
                {activeTab === 'brainstorm' && "Use AI and your brand's context to generate high-performing content ideas."}
              </span>
            </div>
          </div>

          {/* Output Area Container */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 custom-scrollbar">

            {/* Create Tab */}
            {activeTab === 'create' && (
              <div className="w-full max-w-6xl mx-auto space-y-6">

                <div className={cn(
                  "grid gap-6 items-start transition-all duration-300",
                  (generatedCoverUrl || isGeneratingCover) && variants.length > 0
                    ? "grid-cols-1 xl:grid-cols-2"
                    : "grid-cols-1 max-w-3xl mx-auto"
                )}>


                  {/* COVER IMAGE CARD — from unified generate */}
                  {(generatedCoverUrl || isGeneratingCover) && (
                    <div className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-surface-dark">
                        <div className="flex items-center gap-3 text-base font-bold text-white">
                          <div className="p-1.5 bg-blue-500/10 rounded-lg">
                            <ImageIcon className="size-4 text-blue-400" />
                          </div>
                          Cover Image
                        </div>
                        <button
                          onClick={() => {
                            if (generatedCoverUrl) {
                              const a = document.createElement('a');
                              a.href = generatedCoverUrl;
                              a.download = 'cover_image.png';
                              a.click();
                            }
                          }}
                          disabled={!generatedCoverUrl}
                          className="p-1.5 text-slate-500 hover:text-white transition-colors bg-white/5 disabled:opacity-50 rounded-lg"
                        >
                          <Download className="size-3.5" />
                        </button>
                      </div>
                      <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[350px] bg-background-dark relative">
                        {isGeneratingCover ? (
                          <div className="flex flex-col items-center justify-center gap-6 text-slate-500">
                            <div className="relative">
                              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
                              <Sparkles className="size-8 animate-spin text-blue-500 relative z-10" />
                            </div>
                            <div className="text-center space-y-2">
                              <span className="text-white font-medium block">Generating cover image...</span>
                              <span className="text-xs text-slate-500">This might take a few seconds</span>
                            </div>
                          </div>
                        ) : generatedCoverUrl ? (
                          <img
                            src={generatedCoverUrl}
                            alt="Generated Cover"
                            className="w-full h-auto rounded-2xl object-cover shadow-lg"
                          />
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* DESIGN LAB MEDIA CARD — standalone design mode only */}
                  {(generatedMediaUrl || isGeneratingMedia) && generationMode === 'design' && (

                    <div className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-surface-dark">
                        <div className="flex items-center gap-3 text-base font-bold text-white">
                          <div className="p-1.5 bg-purple-500/10 rounded-lg">
                            <ImageIcon className="size-4 text-purple-400" />
                          </div>
                          Generated Media
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDownloadMedia}
                            disabled={!generatedMediaUrl}
                            className="p-1.5 text-slate-500 hover:text-white transition-colors bg-white/5 disabled:opacity-50 rounded-lg"
                          >
                            <Download className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-10 flex-1 flex flex-col items-center justify-center min-h-[400px] bg-background-dark relative">
                        {isGeneratingMedia ? (
                          <div className="flex flex-col items-center justify-center gap-6 text-slate-500">
                            <div className="relative">
                              <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse" />
                              <Sparkles className="size-8 animate-spin text-purple-500 relative z-10" />
                            </div>
                            <div className="text-center space-y-2">
                              <span className="text-white font-medium block">Generating your {mediaType}...</span>
                              <span className="text-xs text-slate-500">This might take a few seconds</span>
                            </div>
                          </div>
                        ) : mediaError ? (
                          <div className="max-w-md mx-auto p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-center space-y-3">
                            <div className="size-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                              <X className="size-6 text-red-500" />
                            </div>
                            <h3 className="text-white font-bold">Generation Failed</h3>
                            <p className="text-sm text-slate-400">{mediaError}</p>
                            <button
                              onClick={() => mediaType === 'image' ? handleGenerateImage() : handleGenerateVideo()}
                              className="text-xs font-bold text-red-400 hover:text-red-300 underline underline-offset-4"
                            >
                              Retry Now
                            </button>
                          </div>
                        ) : generatedMediaUrl ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full h-full flex items-center justify-center relative group"
                          >
                            {mediaType === 'image' ? (
                              <img src={generatedMediaUrl} alt="Generated" className="max-w-full max-h-[500px] object-contain rounded-lg border border-white/10 shadow-lg" />
                            ) : (
                              <div className="relative w-full max-w-md aspect-video bg-[#0a0a0a] rounded-lg border border-white/10 overflow-hidden shadow-lg group-hover:border-purple-500/50 transition-colors">
                                <video src={generatedMediaUrl} controls className="w-full h-full object-contain" />
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-4 text-slate-600">
                            <div className="p-4 rounded-full bg-white/5 border border-white/5">
                              {mediaType === 'image' ? <ImageIcon className="size-8 opacity-40" /> : <Video className="size-8 opacity-40" />}
                            </div>
                            <p className="text-sm">Enter visual description to generate media.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* COPY / TEXT PREVIEW CARD */}
                  {(variants.length > 0 || isGenerating || generationMode === 'copy') && (generationMode === 'copy' || variants.length > 0) && (
                    <div className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-full">
                      {/* Platform Header Mockup */}
                      <div className="p-5 border-b border-white/5 flex items-center gap-4 bg-surface-dark">
                        <div className="size-12 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg text-lg">
                          AM
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">Target Audience</span>
                            <span className="text-xs text-slate-500">• Preview</span>
                          </div>
                          <div className="text-xs text-slate-400">{contentType.label} via {platform.label}</div>
                        </div>
                        <MoreHorizontal className="ml-auto text-slate-500 size-5" />
                      </div>

                      {/* Content Body */}
                      <div className="p-10 min-h-[400px] text-slate-200 text-[15px] leading-relaxed whitespace-pre-wrap font-sans flex-1">
                        {isGenerating ? (
                          <div className="flex flex-col items-center justify-center h-full min-h-[250px] gap-6 text-slate-500">
                            <div className="relative">
                              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
                              <Sparkles className="size-8 animate-spin text-blue-500 relative z-10" />
                            </div>
                            <div className="text-center space-y-2">
                              <span className="text-white font-medium block">Crafting copy...</span>
                              <span className="text-xs text-slate-500">Applying brand voice</span>
                            </div>
                          </div>
                        ) : variants.length > 0 ? (
                          <motion.div
                            key={activeVariant}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            {variants[activeVariant]}
                          </motion.div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full min-h-[250px] gap-4 text-slate-600">
                            <div className="p-4 rounded-full bg-white/5 border border-white/5">
                              <LayoutTemplate className="size-8 opacity-40" />
                            </div>
                            <p className="text-sm">Configure parameters and click Generate to start.</p>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(variants[activeVariant] || '');
                              toast.success('Copied to clipboard');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 text-xs font-semibold transition-colors"
                          >
                            <Copy className="size-3.5" /> Copiar
                          </button>
                          <button
                            onClick={async () => {
                              const content = variants[activeVariant] || '';
                              if (!content) return;
                              const fileName = `VultIntel_Content_${contentType.id} `;
                              const success = await exportToDocx(content, fileName);
                              if (success) {
                                toast.success('Exported to DOCX');
                              } else {
                                toast.error('Failed to export DOCX');
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Download className="size-3.5" /> Exportar
                          </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={cn("text-xs font-medium",
                            (variants[activeVariant]?.length || 0) > (platform.maxLength || 9999) ? "text-red-400" : "text-slate-500"
                          )}>
                            {variants[activeVariant]?.length || 0} / {platform.maxLength || '∞'} chars
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* ── Social Variations Section ── */}
                <AnimatePresence>
                  {variants.length > 0 && generatedContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="max-w-3xl mx-auto xl:max-w-none"
                    >
                      {/* Trigger Button */}
                      {!socialVariationsOpen && (
                        <button
                          onClick={handleGenerateSocialVariations}
                          disabled={isGeneratingSocialVariations}
                          className="w-full flex items-center justify-center gap-2 py-3.5 border border-dashed border-white/15 rounded-2xl text-sm font-semibold text-slate-400 hover:text-white hover:border-white/30 hover:bg-white/[0.03] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          {isGeneratingSocialVariations ? (
                            <>
                              <Sparkles className="size-4 animate-spin text-blue-400" />
                              Generating Social Variations...
                            </>
                          ) : (
                            <>
                              <Layers2 className="size-4 group-hover:scale-110 transition-transform" />
                              Generate Social Media Variations
                            </>
                          )}
                        </button>
                      )}

                      {/* Accordion */}
                      {socialVariationsOpen && socialVariations.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden shadow-xl"
                        >
                          <div className="p-5 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-base font-bold text-white">
                              <div className="p-1.5 bg-green-500/10 rounded-lg">
                                <Layers2 className="size-4 text-green-400" />
                              </div>
                              Social Media Variations
                            </div>
                            <button
                              onClick={() => setSocialVariationsOpen(false)}
                              className="p-1.5 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-lg"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                          <div className="divide-y divide-white/5">
                            {socialVariations.map((variation) => (
                              <div key={variation.platform} className="p-5">
                                <button
                                  onClick={() => setExpandedPlatform(expandedPlatform === variation.platform ? null : variation.platform)}
                                  className="w-full flex items-center justify-between gap-3 text-left group"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-xl">{variation.icon}</span>
                                    <span className="text-sm font-bold text-white">{variation.platform}</span>
                                  </div>
                                  <ChevronDown className={cn(
                                    "size-4 text-slate-500 transition-transform group-hover:text-white",
                                    expandedPlatform === variation.platform && "rotate-180"
                                  )} />
                                </button>

                                <AnimatePresence>
                                  {expandedPlatform === variation.platform && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="mt-4 p-4 bg-background-dark rounded-xl text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans border border-white/5">
                                        {variation.copy}
                                      </div>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(variation.copy);
                                          toast.success(`${variation.platform} copy copied!`);
                                        }}
                                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 text-xs font-semibold transition-colors"
                                      >
                                        <Copy className="size-3.5" /> Copy
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* AI Insight Box */}
                <AnimatePresence>

                  {aiInsight && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-3xl p-8 flex gap-6 shadow-sm max-w-3xl mx-auto xl:max-w-none relative overflow-hidden group"
                    >
                      <div className="shrink-0 mt-1 p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 group-hover:scale-110 transition-transform">
                        <Sparkles className="size-5" />
                      </div>
                      <div className="space-y-3 w-full relative z-10">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-white">AI Insight</h4>
                          <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded">Model: Gemini 3.1 Pro</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {aiInsight}
                        </p>
                        <div className="pt-2">
                          <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 w-[85%]" />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-slate-500">Tone Match</span>
                            <span className="text-[10px] text-blue-400 font-medium">85% Match</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Other Tabs Scaffolding */}
            {activeTab === 'planning' && (() => {
              const calDays = getCalendarDays(calMonth, calYear);
              const todayStr = formatDateStr(today.getDate(), today.getMonth(), today.getFullYear());
              return (
                <div className="h-full flex flex-col gap-6 bg-surface-dark p-8 rounded-3xl border border-white/10 shadow-lg">

                  {/* Calendar Header Row */}
                  <div className="flex flex-col 2xl:flex-row items-start 2xl:items-center justify-between flex-shrink-0 gap-4">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2 bg-surface-light border border-white/10 rounded-xl p-1.5 shadow-inner">
                        <button
                          onClick={() => {
                            if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                            else setCalMonth(m => m - 1);
                          }}
                          className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                          <ChevronLeft className="size-4" />
                        </button>
                        <h3 className="text-xl font-bold text-white min-w-[160px] text-center tracking-tight">
                          {MONTH_NAMES[calMonth]} {calYear}
                        </h3>
                        <button
                          onClick={() => {
                            if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                            else setCalMonth(m => m + 1);
                          }}
                          className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                          <ChevronLeft className="size-4 rotate-180" />
                        </button>
                      </div>
                      <button
                        onClick={() => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }}
                        className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 rounded-xl px-4 py-2 hover:bg-white/5 transition-colors"
                      >
                        Today
                      </button>
                    </div>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full 2xl:w-auto">
                      {/* Event type legend */}
                      <div className="hidden lg:flex items-center gap-4 mr-2">
                        {(Object.entries(EVENT_TYPE_CONFIG) as [CalendarEventType, typeof EVENT_TYPE_CONFIG[CalendarEventType]][]).map(([key, cfg]) => (
                          <div key={key} className="flex items-center gap-2">
                            <div className="size-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                            <span className="text-xs text-slate-400 font-medium tracking-wide w-max">{cfg.label}</span>
                          </div>
                        ))}
                      </div>
                      {/* View toggle */}
                      <div className="flex bg-surface-light rounded-xl p-1.5 border border-white/10 shadow-inner">
                        <button
                          onClick={() => setCalView('month')}
                          className={cn("px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                            calView === 'month' ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white")}
                        >Month</button>
                        <button
                          onClick={() => setCalView('week')}
                          className={cn("px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                            calView === 'week' ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white")}
                        >Week</button>
                      </div>
                      <button
                        onClick={() => openCreateEventModal(todayStr)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] text-sm"
                      >
                        <Plus className="size-4" /> Add Event
                      </button>
                    </div>
                  </div>

                  {/* Calendar Grid */}
                  <div className="flex-1 bg-background-dark border border-white/8 rounded-2xl overflow-x-auto custom-scrollbar flex flex-col min-h-[500px]">
                    {/* Day Labels */}
                    <div className="grid grid-cols-7 min-w-[900px] border-b border-white/8 flex-shrink-0">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="py-3 text-center text-xs font-semibold text-slate-500 tracking-wider">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Day Cells */}
                    <div className="grid grid-cols-7 min-w-[900px] flex-1 overflow-y-auto" style={{ gridTemplateRows: `repeat(${calDays.length / 7}, minmax(100px, 1fr))` }}>
                      {calDays.map((day, idx) => {
                        const dateStr = day ? formatDateStr(day, calMonth, calYear) : '';
                        const dayEvents = day ? calEvents.filter(e => e.date === dateStr) : [];
                        const isToday = dateStr === todayStr;
                        const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "border-r border-b border-white/5 p-1.5 min-h-[100px] transition-colors group relative",
                              day ? "hover:bg-white/[0.015] cursor-pointer" : "opacity-30 bg-white/[0.01] cursor-default",
                              isWeekend && day ? "bg-white/[0.01]" : "",
                            )}
                            onClick={() => day && setPromptTargetDate(dateStr)}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragEventId && day) {
                                handleEventDrop(dragEventId, dateStr);
                                setDragEventId(null);
                              }
                            }}
                          >
                            {/* Day number */}
                            {day && (
                              <div className="flex items-center justify-between mb-1">
                                <span className={cn(
                                  "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                                  isToday
                                    ? "bg-blue-500 text-white"
                                    : "text-slate-400 group-hover:text-slate-200"
                                )}>
                                  {day}
                                </span>
                                {dayEvents.length === 0 && (
                                  <Plus className="size-3 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </div>
                            )}

                            {/* Events */}
                            <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
                              {dayEvents.slice(0, 3).map(event => {
                                const cfg = EVENT_TYPE_CONFIG[event.eventType];
                                return (
                                  <div
                                    key={event.id}
                                    draggable
                                    onDragStart={(e) => { e.stopPropagation(); setDragEventId(event.id); }}
                                    onClick={(e) => { e.stopPropagation(); openEditEventModal(event); }}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer hover:brightness-125 transition-all leading-tight truncate",
                                      cfg.bgClass, cfg.borderClass, cfg.textClass
                                    )}
                                    title={event.title}
                                  >
                                    {event.startTime && (
                                      <span className="opacity-60 mr-1">{event.startTime}</span>
                                    )}
                                    {event.title}
                                  </div>
                                );
                              })}
                              {dayEvents.length > 3 && (
                                <div className="text-[10px] text-slate-500 font-medium pl-1 mt-0.5">+{dayEvents.length - 3} more</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calendar Click Intercept Modal */}
                  <AnimatePresence>
                    {promptTargetDate && (
                      <div className="fixed inset-0 bg-[#0a0a0a]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6"
                        >
                          <div className="flex flex-col items-center justify-center text-center space-y-4 mb-6">
                            <div className="size-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                              <Calendar className="size-6 text-blue-400" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-white mb-1">Schedule Content</h3>
                              <p className="text-sm text-slate-400">What do you want to do for {promptTargetDate}?</p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3">
                            <button
                              onClick={() => {
                                setTargetDate(promptTargetDate);
                                setPromptTargetDate(null);
                                setActiveTab('create');
                                navigate(`? targetDate = ${promptTargetDate} `, { replace: true });
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors shadow-lg"
                            >
                              <Sparkles className="size-4" /> Generar con IA
                            </button>
                            <button
                              onClick={() => {
                                openCreateEventModal(promptTargetDate);
                                setPromptTargetDate(null);
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-semibold transition-colors"
                            >
                              <Plus className="size-4" /> Agregar Manualmente
                            </button>
                            <button
                              onClick={() => setPromptTargetDate(null)}
                              className="w-full text-slate-500 hover:text-white text-sm font-medium mt-2 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Event Create / Edit Modal */}
                  <AnimatePresence>
                    {isEventModalOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 bg-[#0a0a0a]/60 backdrop-blur-sm z-50"
                          onClick={() => setIsEventModalOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: 8 }}
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
                        >
                          <div
                            className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl w-[480px] pointer-events-auto overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-5 border-b border-white/8">
                              <h3 className="text-white font-bold flex items-center gap-2">
                                <Calendar className="size-4 text-blue-400" />
                                {editingEvent ? 'Edit Event' : 'New Event'}
                              </h3>
                              <div className="flex items-center gap-2">
                                {editingEvent && (
                                  <button
                                    onClick={() => {
                                      if (confirm('Delete this event?')) handleDeleteEvent(editingEvent.id);
                                    }}
                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setIsEventModalOpen(false)}
                                  className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-5 space-y-4">
                              {/* Title */}
                              <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">Title</label>
                                <input
                                  type="text"
                                  value={eventTitle}
                                  onChange={(e) => setEventTitle(e.target.value)}
                                  placeholder="Name this content item..."
                                  autoFocus
                                  className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                                />
                              </div>

                              {/* Event Type */}
                              <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">Content Type</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {(Object.entries(EVENT_TYPE_CONFIG) as [CalendarEventType, typeof EVENT_TYPE_CONFIG[CalendarEventType]][]).map(([key, cfg]) => (
                                    <button
                                      key={key}
                                      onClick={() => setEventType(key)}
                                      className={cn(
                                        "px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center",
                                        eventType === key
                                          ? `${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass} `
                                          : "bg-white/[0.02] border-white/5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                                      )}
                                    >
                                      {cfg.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Date + Times */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-slate-400 block mb-1.5">Date</label>
                                  <input
                                    type="date"
                                    value={eventModalDate}
                                    onChange={(e) => setEventModalDate(e.target.value)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1">
                                    <Clock className="size-3" /> Start
                                  </label>
                                  <input
                                    type="time"
                                    value={eventStartTime}
                                    onChange={(e) => setEventStartTime(e.target.value)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1">
                                    <Clock className="size-3" /> End
                                  </label>
                                  <input
                                    type="time"
                                    value={eventEndTime}
                                    onChange={(e) => setEventEndTime(e.target.value)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                                  />
                                </div>
                              </div>

                              {/* Description */}
                              <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">Notes</label>
                                <textarea
                                  value={eventDescription}
                                  onChange={(e) => setEventDescription(e.target.value)}
                                  placeholder="Brief notes or content outline..."
                                  rows={3}
                                  className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
                                />
                              </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/8">
                              <button
                                onClick={() => setIsEventModalOpen(false)}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveEvent}
                                disabled={!eventTitle.trim() || isSavingEvent}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
                              >
                                {isSavingEvent ? <Sparkles className="size-3.5 animate-spin" /> : <Calendar className="size-3.5" />}
                                {editingEvent ? 'Save Changes' : 'Add to Calendar'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              );
            })()}
            {activeTab === 'research' && (
              <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Research Hub</h3>
                    <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">Feed the AI source material. Extract insights. Generate ready-to-use prompts.</p>
                  </div>
                  <button
                    onClick={() => setIsWorkbenchOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-surface-dark border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white font-semibold rounded-xl transition-all hover:border-white/20 text-sm relative shadow-md"
                  >
                    <Bookmark className="size-4 text-amber-500" />
                    Workbench
                    {workbenchIdeas.length > 0 && (
                      <span className="absolute -top-2 -right-2 size-5 bg-amber-500 text-black rounded-full text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-[#161616]">
                        {workbenchIdeas.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Ingestion Zone */}
                <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 space-y-6 shadow-lg">
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                      <Upload className="size-5 text-blue-400" />
                    </div>
                    Ingestion Zone
                  </h4>

                  {/* URL Input */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Link className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                      <input
                        type="url"
                        value={researchUrlInput}
                        onChange={(e) => setResearchUrlInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddResearchUrl()}
                        placeholder="Paste a URL (article, competitor page, blog post...)"
                        className="w-full bg-surface-light border border-white/10 rounded-xl pl-12 pr-5 py-4 text-[15px] text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors shadow-inner"
                      />
                    </div>
                    <button
                      onClick={handleAddResearchUrl}
                      disabled={!researchUrlInput.trim()}
                      className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
                    >Add</button>
                  </div>

                  {/* File Drop Zone */}
                  <input
                    type="file"
                    ref={researchFileInputRef}
                    className="hidden"
                    multiple
                    accept=".txt,.md,.csv,.json,.pdf"
                    onChange={handleResearchFileUpload}
                  />
                  <button
                    onClick={() => researchFileInputRef.current?.click()}
                    className="w-full py-6 border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded-xl text-sm text-slate-400 hover:text-blue-400 transition-all flex flex-col items-center gap-2"
                  >
                    <FileText className="size-6 opacity-40" />
                    <span>Drop files or click to upload context documents</span>
                    <span className="text-xs text-slate-600">Supports .txt, .md, .csv, .json, .pdf</span>
                  </button>

                  {/* Source Tags */}
                  {researchSources.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {researchSources.map((source, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-slate-300 max-w-xs">
                          {source.type === 'url' ? <Globe className="size-3 text-blue-400 shrink-0" /> : <FileText className="size-3 text-purple-400 shrink-0" />}
                          <span className="truncate">{source.label}</span>
                          <button onClick={() => handleRemoveResearchSource(i)} className="text-slate-600 hover:text-red-400 transition-colors ml-1">
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleAnalyzeSources}
                    disabled={researchSources.length === 0 || isAnalyzing}
                    className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors shadow-[0_0_20px_rgba(59,130,246,0.2)] text-base"
                  >
                    {isAnalyzing ? (
                      <>
                        <Sparkles className="size-5 animate-spin" />
                        Analyzing sources with Gemini...
                      </>
                    ) : (
                      <>
                        <Zap className="size-5" />
                        Analyze Sources
                      </>
                    )}
                  </button>
                </div>

                {/* Analysis Results */}
                <AnimatePresence>
                  {researchAnalysis && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      {/* Summary */}
                      <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 shadow-sm">
                        <h4 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                            <Eye className="size-5 text-emerald-400" />
                          </div>
                          Deep Breakdown
                        </h4>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-6 break-words">{researchAnalysis.summary}</p>
                        <ul className="space-y-3">
                          {researchAnalysis.keyPoints.map((point, i) => (
                            <li key={i} className="flex gap-4 text-[15px] text-slate-300 leading-relaxed items-start">
                              <div className="size-2 rounded-full bg-emerald-500 mt-2 shrink-0 shadow-sm shadow-emerald-500/50" />
                              <p>{point}</p>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Hidden Angles */}
                      <div className="bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/20 rounded-3xl p-8 shadow-sm">
                        <h4 className="text-base font-bold text-amber-300 flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-amber-500/10 rounded-lg">
                            <Lightbulb className="size-5 text-amber-400" />
                          </div>
                          Hidden Potential Scanner
                        </h4>
                        <ul className="space-y-3">
                          {researchAnalysis.hiddenAngles.map((angle, i) => (
                            <li key={i} className="flex gap-4 text-[15px] text-slate-300 leading-relaxed items-start">
                              <div className="size-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-sm shadow-amber-500/50" />
                              <p>{angle}</p>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Ideas */}
                      <div className="pt-4">
                        <h4 className="text-lg font-bold text-white flex items-center gap-3 mb-6">
                          <div className="p-1.5 bg-purple-500/10 rounded-lg">
                            <Sparkles className="size-5 text-purple-400" />
                          </div>
                          Brainstorming Engine
                          <span className="text-sm text-slate-500 font-medium ml-1 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                            {researchAnalysis.ideas.length} ideas generated
                          </span>
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {researchAnalysis.ideas.map((idea, i) => {
                            const isAlreadySaved = workbenchIdeas.some(w => w.title === idea.title);
                            const isSaving = savingIdeaId === `temp - ${i} `;
                            return (
                              <div
                                key={i}
                                className="bg-surface-dark border border-white/10 rounded-xl p-5 flex flex-col gap-3 hover:border-white/20 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <h5 className="text-sm font-bold text-white">{idea.title}</h5>
                                    <span className="text-[11px] font-medium text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded mt-1.5 inline-block">
                                      {idea.suggestedFormat}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[13px] text-slate-400 leading-relaxed mt-1">{idea.angle}</p>
                                <div className="flex gap-2 pt-2 border-t border-white/5">
                                  <button
                                    onClick={() => handleUseInCreate(idea)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                                  >
                                    <ArrowRight className="size-3" /> Use in Create
                                  </button>
                                  <button
                                    onClick={() => handleSaveToWorkbench(idea, i)}
                                    disabled={isAlreadySaved || isSaving || workbenchIdeas.length >= 20}
                                    className={cn(
                                      "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                                      isAlreadySaved
                                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-default"
                                        : workbenchIdeas.length >= 20
                                          ? "bg-white/5 text-slate-600 cursor-not-allowed"
                                          : "bg-white/5 hover:bg-amber-500/10 hover:text-amber-400 text-slate-400 border border-white/5 hover:border-amber-500/20"
                                    )}
                                    title={workbenchIdeas.length >= 20 ? "Workbench is full (20/20). Remove an idea to save more." : ""}
                                  >
                                    {isAlreadySaved ? <BookmarkCheck className="size-3" /> : <Bookmark className="size-3" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Empty state */}
                {!isAnalyzing && !researchAnalysis && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-4">
                    <div className="p-4 rounded-full bg-white/5 border border-white/5">
                      <Search className="size-8 opacity-40" />
                    </div>
                    <p className="text-sm text-center max-w-sm">Add source URLs or upload documents above, then click Analyze Sources to extract insights and brainstorm content ideas.</p>
                  </div>
                )}
              </div>
            )}

            {/* Zone C: Brainstorm Tab */}
            {activeTab === 'brainstorm' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 space-y-8 shadow-lg">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Brainstorming Engine</h3>
                      <p className="text-[15px] text-slate-400 leading-relaxed max-w-3xl">
                        Enter a focus topic, promotion, or general idea. The AI will cross-reference your global brand strategy (niche, persona, tone) and generate high-converting, uniquely angled content ideas.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <textarea
                          value={brainstormPrompt}
                          onChange={(e) => setBrainstormPrompt(e.target.value)}
                          placeholder="What do you want to brainstorm about? (e.g., 'We are launching a new SEO service for local dentists', 'Ideas for a Black Friday sale on coaching')"
                          className="w-full h-36 bg-surface-light border border-white/10 rounded-2xl px-6 py-5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 resize-none custom-scrollbar shadow-inner"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleGenerateBrainstorm}
                          disabled={!brainstormPrompt.trim() || isBrainstorming}
                          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all shadow-lg hover:shadow-blue-500/25"
                        >
                          {isBrainstorming ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Brainstorming...
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-4" />
                              Generate Ideas
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {brainstormIdeas.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Lightbulb className="size-4 text-amber-400" /> Generated Ideas
                          <span className="text-xs text-slate-500 font-normal ml-1">{brainstormIdeas.length} ideas</span>
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {brainstormIdeas.map((idea, i) => {
                            const isAlreadySaved = workbenchIdeas.some(w => w.title === idea.title);
                            const isSaving = savingIdeaId === `temp - ${i} `;
                            return (
                              <div
                                key={i}
                                className="bg-surface-dark border border-white/5 shadow-lg rounded-2xl p-6 flex flex-col gap-4 group transition-all duration-300 relative overflow-hidden ring-1 ring-white/10 hover:ring-white/20 hover:shadow-2xl"
                                style={{
                                  background: 'linear-gradient(to bottom right, rgba(30,30,30,0.5), rgba(20,20,20,0.8))'
                                }}
                              >
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                  <Sparkles className="size-32 text-blue-500" />
                                </div>
                                <div className="flex items-start justify-between gap-3 relative z-10">
                                  <div>
                                    <h5 className="text-lg font-bold text-white mb-2 leading-snug tracking-tight">{idea.title}</h5>
                                    <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-full inline-block border border-blue-500/20 shadow-sm mt-1">
                                      {idea.suggestedFormat}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed relative z-10 flex-1 mt-2">{idea.angle}</p>
                                <div className="flex gap-2 pt-4 mt-auto relative z-10">
                                  <button
                                    onClick={() => handleUseInCreate(idea)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white text-black hover:bg-slate-200 text-xs font-bold rounded-lg transition-transform hover:scale-[1.02] active:scale-95 shadow-md"
                                  >
                                    <ArrowRight className="size-3.5" /> Use in Create
                                  </button>
                                  <button
                                    onClick={() => handleSaveToWorkbench(idea, i)}
                                    disabled={isAlreadySaved || isSaving || workbenchIdeas.length >= 20}
                                    className={cn(
                                      "flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all backdrop-blur-sm shadow-inner box-border border",
                                      isAlreadySaved
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/30 cursor-default"
                                        : workbenchIdeas.length >= 20
                                          ? "bg-white/5 text-slate-600 border-transparent cursor-not-allowed"
                                          : "bg-white/5 hover:bg-amber-500/10 text-slate-300 hover:text-amber-400 border-white/10 hover:border-amber-500/30 shadow-md"
                                    )}
                                    title={workbenchIdeas.length >= 20 ? "Workbench is full (20/20). Remove an idea to save more." : ""}
                                  >
                                    {isAlreadySaved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isBrainstorming && brainstormIdeas.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-4">
                      <div className="p-5 rounded-full bg-white/5 ring-1 ring-white/10 shadow-inner">
                        <Sparkles className="size-10 opacity-40 text-blue-400" />
                      </div>
                      <p className="text-[15px] font-medium text-center max-w-sm text-slate-400">
                        Awaiting your spark.
                        <span className="block text-sm font-normal text-slate-500 mt-1">Enter a prompt above to generate tailor-made ideas.</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Workbench Slide-out Drawer */}
            <AnimatePresence>
              {isWorkbenchOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-[#0a0a0a]/50 z-40"
                    onClick={() => setIsWorkbenchOpen(false)}
                  />
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 h-full w-[85vw] sm:w-[400px] bg-surface-dark border-l border-white/10 z-50 flex flex-col shadow-2xl"
                  >
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-background-dark/50">
                      <div>
                        <h3 className="text-xl text-white font-bold flex items-center gap-2">
                          <Bookmark className="size-5 text-amber-500" /> Workbench
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">{workbenchIdeas.length} / 20 ideas saved</p>
                      </div>
                      <button onClick={() => setIsWorkbenchOpen(false)} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors bg-white/5 border border-white/5">
                        <X className="size-5" />
                      </button>
                    </div>

                    {/* Capacity bar */}
                    <div className="px-5 py-3 border-b border-white/5">
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", workbenchIdeas.length >= 20 ? "bg-red-500" : "bg-amber-400")}
                          style={{ width: `${(workbenchIdeas.length / 20) * 100}% ` }}
                        />
                      </div>
                      {workbenchIdeas.length >= 20 && (
                        <p className="text-[11px] font-medium text-red-400 mt-2">Workbench full. Remove ideas to save more.</p>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {workbenchIdeas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3">
                          <Bookmark className="size-8 opacity-30" />
                          <p className="text-sm text-center">No saved ideas yet. Pin ideas from the Brainstorming Engine.</p>
                        </div>
                      ) : (
                        workbenchIdeas.map((idea) => (
                          <div key={idea.id} className="bg-background-dark border border-white/10 rounded-2xl p-5 flex flex-col gap-3 group hover:border-white/20 hover:shadow-lg transition-all">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h5 className="text-base font-bold text-white truncate">{idea.title}</h5>
                                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded inline-block mt-2 border border-purple-500/20">
                                  {idea.suggestedFormat}
                                </span>
                              </div>
                              <button
                                onClick={() => setIdeaToDelete(idea.id)}
                                className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-red-500/10 shrink-0 border border-transparent hover:border-red-500/20"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{idea.angle}</p>
                            <div className="pt-2 border-t border-white/5 mt-1">
                              <button
                                onClick={() => { handleUseInCreate({ title: idea.title, suggestedFormat: idea.suggestedFormat, angle: idea.angle, readyPrompt: idea.readyPrompt }); setIsWorkbenchOpen(false); }}
                                className="flex items-center text-sm font-semibold gap-2 text-blue-400 hover:text-blue-300 transition-colors w-max group/btn"
                              >
                                <ArrowRight className="size-4 group-hover/btn:translate-x-1 transition-transform" /> Use in Create
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>

                  {/* Delete Confirmation Modal for Workbench Ideas */}
                  <AnimatePresence>
                    {ideaToDelete && (
                      <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdeaToDelete(null)}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-surface-dark border border-white/10 rounded-2xl w-[90%] max-w-sm shadow-2xl p-6 relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-600" />
                          <div className="flex flex-col items-center justify-center text-center space-y-4 mb-6">
                            <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center">
                              <Trash2 className="size-6 text-red-500" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white mb-1">Remove Idea?</h3>
                              <p className="text-xs text-slate-400">This will remove the idea from your Workbench. Are you sure?</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setIdeaToDelete(null)}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-white/5 transition-colors text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={confirmDeleteWorkbenchIdea}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 transition-colors text-xs border border-red-500/20"
                            >
                              Remove
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </AnimatePresence>





          </div>
        </main >
      </div >
    </div >
  );
}
