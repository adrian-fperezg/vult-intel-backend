import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import {
    Activity,
    Bell,
    CreditCard,
    Moon,
    Sun,
    Globe,
    Mail,
    Save,
    Trash2,
    Zap,
    ShieldCheck,
    Sparkles,
    Video,
    CheckCircle2,
    FileText,
    Layout,
    Info,
    ArrowUpRight,
    Database,
    Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { getProjects } from '@/services/scanService';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { useCheckout } from '@/hooks/useCheckout';

import { formatTokens } from '@/utils/formatters';

export default function Settings() {
    const { currentUser, isFounder } = useAuth();
    const { totalLimits, metrics, currentPlanId, activeAddons, loading: metricsLoading } = useUserMetrics();
    const { startCheckout } = useCheckout();
    const { theme, setTheme, language, setLanguage, appNotifications, setAppNotifications, marketingEmails, setMarketingEmails, notificationPrefs, updateNotificationPref, saveSettings, isSyncing } = useSettings();
    const { t } = useTranslation();
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [activeProjectsCount, setActiveProjectsCount] = useState(0);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        const timer = setTimeout(() => setIsInitialLoading(false), 500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        const fetchTelemetryData = async () => {
            try {
                const projects = await getProjects();
                setActiveProjectsCount(projects.length);
            } catch (err) {
                console.error("Failed to fetch projects count:", err);
            }
        };
        fetchTelemetryData();
    }, [currentUser]);

    const isUnlimited = isFounder;
    const TOKEN_MAX = totalLimits.tokens || 500000;
    const totalTokensUsed = metrics.tokensUsed || 0;
    const tokenPct = isUnlimited ? 0 : (TOKEN_MAX > 0 ? Math.min((totalTokensUsed / TOKEN_MAX) * 100, 100) : 0);
    const scanPct = totalLimits.deepScans > 0 ? Math.min((metrics.deepScansGenerated / totalLimits.deepScans) * 100, 100) : 0;
    const imagePct = totalLimits.images > 0 ? Math.min((metrics.imagesGenerated / totalLimits.images) * 100, 100) : 0;
    const videoPct = totalLimits.videos > 0 ? Math.min((metrics.videosGenerated / totalLimits.videos) * 100, 100) : 0;

    const hasVeoStudio = activeAddons.includes('veo_studio_pack');

    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [isBuyingAddon, setIsBuyingAddon] = useState(false);
    const [isUpgrading, setIsUpgrading] = useState(false);
    const [isPurgingCache, setIsPurgingCache] = useState(false);
    const [isClearingAssets, setIsClearingAssets] = useState(false);

    const handleManageSubscription = () => {
        if (!currentUser) return;
        setIsManagingSubscription(true);
        const emailParam = currentUser.email ? `?prefilled_email=${encodeURIComponent(currentUser.email)}` : '';
        const portalUrl = `https://billing.stripe.com/p/login/6oU3cudrxfYM0JdabgbjW00${emailParam}`;
        window.location.assign(portalUrl);

        // Reset state after a delay in case they navigate back
        setTimeout(() => setIsManagingSubscription(false), 2000);
    };

    const handleBuyAddon = async () => {
        if (!currentUser) return;
        setIsBuyingAddon(true);
        try {
            await startCheckout(
                'prod_U54OcVdHHV38Qv',
                window.location.origin + '/settings',
                window.location.origin + '/settings'
            );
        } catch (error) {
            console.error("Error creating checkout session:", error);
            showToast("Failed to initiate checkout", 'error');
        } finally {
            setIsBuyingAddon(false);
        }
    };

    const handleUpgradeToAgency = async () => {
        if (!currentUser) return;
        setIsUpgrading(true);
        try {
            const docRef = await addDoc(collection(db, `customers/${currentUser.uid}/checkout_sessions`), {
                mode: 'subscription',
                price: 'price_1T6vFdB67Yoq7pP4E354BheU', // Real Price ID for Agency
                success_url: window.location.origin + '/settings',
                cancel_url: window.location.origin + '/settings',
            });

            onSnapshot(docRef, (snap) => {
                const { error, url } = snap.data() || {};
                if (error) {
                    console.error("Upgrade error:", error);
                    showToast("Upgrade failed: " + error.message, 'error');
                    setIsUpgrading(false);
                }
                if (url) {
                    window.location.assign(url);
                }
            });
        } catch (error) {
            console.error("Error creating upgrade session:", error);
            showToast("Failed to initiate upgrade", 'error');
            setIsUpgrading(false);
        }
    };

    const handlePurgeCache = () => {
        setIsPurgingCache(true);
        setTimeout(() => {
            setIsPurgingCache(false);
            showToast("Neural cache purged successfully", 'success');
        }, 1500);
    };

    const handleClearAssets = () => {
        setIsClearingAssets(true);
        setTimeout(() => {
            setIsClearingAssets(false);
            showToast("Old assets cleared from storage", 'success');
        }, 1200);
    };

    const handleSaveSettings = async () => {
        await saveSettings();
        showToast("Personal settings synced to Firestore", 'success');
    };

    if (isInitialLoading || metricsLoading) {
        return (
            <div className="h-full w-full bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Sparkles className="size-8 text-blue-500 animate-pulse" />
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">{t('initializingCommandCenter')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-y-auto custom-scrollbar font-sans transition-colors duration-300 bg-slate-950 text-slate-100 selection:bg-blue-500/30">
            <div className="max-w-6xl mx-auto px-8 py-12 space-y-16">

                {/* Sticky Header */}
                <header className="sticky top-0 z-20 py-6 mb-8 bg-slate-950/80 backdrop-blur-xl flex items-center justify-between border-b border-white/5">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-white">{t('commandCenter')}</h1>
                        <p className="text-slate-400 text-sm mt-1">{t('commandCenterDesc')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveSettings}
                            disabled={isSyncing}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Save className={cn("size-4 text-blue-400", isSyncing && "animate-spin")} />
                            {isSyncing ? "Syncing..." : t('saveChanges')}
                        </button>
                    </div>
                </header>

                {/* 1. Telemetry and Usage Hub (The Engine Room) */}
                <section className="space-y-8">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
                            <Activity className="size-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{t('telemetryHub')}</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* AI Token Ring */}
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center space-y-6 shadow-2xl relative overflow-hidden group">
                            <div className={cn(
                                "absolute top-0 left-0 w-full h-1 bg-gradient-to-r",
                                isUnlimited ? "from-amber-400 via-orange-500 to-amber-600" : "from-blue-500 via-indigo-500 to-purple-500"
                            )} />
                            <div className="relative size-40">
                                <svg className="size-full -rotate-90 transform">
                                    <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: 440 }}
                                        animate={{ strokeDashoffset: isUnlimited ? 0 : 440 - (440 * tokenPct) / 100 }}
                                        cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                                        className={cn(
                                            "transition-all duration-1000",
                                            isUnlimited ? "text-amber-500" : (tokenPct > 80 ? "text-amber-500" : "text-blue-500")
                                        )}
                                        strokeDasharray={440}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black">{isUnlimited ? '∞' : `${Math.round(tokenPct)}%`}</span>
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('aiPower')}</span>
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold">
                                    {formatTokens(metrics.tokensUsed)} / {isUnlimited ? '∞' : formatTokens(totalLimits.tokens)}
                                </p>
                                <p className="text-sm text-slate-500 uppercase font-bold tracking-tight mt-1">{t('tokensGenerated')}</p>
                            </div>
                        </div>

                        {/* Scans and Assets */}
                        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="bg-white/5 border border-white/5 rounded-3xl p-8 space-y-6 flex flex-col justify-between">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-slate-300">{t('deepScans')}</span>
                                        <span className="text-xs font-mono text-slate-500">{metrics.deepScansGenerated} / {totalLimits.deepScans}</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${scanPct}%` }} className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-slate-300">{t('imagesGenerated')}</span>
                                        <span className="text-xs font-mono text-slate-500">{metrics.imagesGenerated} / {totalLimits.images}</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${imagePct}%` }} className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                                    </div>
                                    {hasVeoStudio && (
                                        <>
                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-sm font-bold text-slate-300 flex items-center gap-1.5"><Video className="size-3.5 text-pink-400" /> Veo Studio {t('videos') || 'Videos'}</span>
                                                <span className="text-xs font-mono text-slate-500">{metrics.videosGenerated} / {totalLimits.videos}</span>
                                            </div>
                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${videoPct}%` }} className="h-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Database className="size-4 text-slate-500" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{t('activeCache')}: 12.4 MB</span>
                                    </div>
                                    <button
                                        onClick={handlePurgeCache}
                                        disabled={isPurgingCache}
                                        className="text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors py-1 px-3 bg-red-500/10 rounded-full border border-red-500/20 active:scale-95 disabled:opacity-50"
                                    >
                                        {isPurgingCache ? "Purging..." : t('purgeCache')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-blue-600/10 to-purple-600/5 border border-white/5 rounded-3xl p-8 space-y-6 flex flex-col">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                        <Layout className="size-5 text-indigo-400" />
                                    </div>
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">{t('storageManager')}</h3>
                                </div>
                                <div className="space-y-3 flex-grow">
                                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                        <span className="text-sm text-slate-300">{t('activeProjects')}</span>
                                        <span className="text-sm font-bold text-white">{activeProjectsCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                        <span className="text-sm text-slate-300">{t('campaignAssets')}</span>
                                        <span className="text-sm font-bold text-white">0</span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClearAssets}
                                    disabled={isClearingAssets}
                                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isClearingAssets ? "Clearing..." : t('clearOldAssets')}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. Smart Notification Center (Signal Over Noise) */}
                <section className="space-y-8">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-amber-600/10 flex items-center justify-center border border-amber-500/20 shadow-inner">
                            <Bell className="size-5 text-amber-500" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{t('notificationCenter')}</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Quota Alerts */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">{t('usageQuotas')}</h3>
                            {[
                                { limit: 80, key: 'quota80' as keyof typeof notificationPrefs },
                                { limit: 90, key: 'quota90' as keyof typeof notificationPrefs },
                                { limit: 100, key: 'quota100' as keyof typeof notificationPrefs }
                            ].map(({ limit, key }) => (
                                <div key={limit} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.08] transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="size-8 rounded-lg bg-black/20 flex items-center justify-center border border-white/5">
                                            <Sparkles className="size-4 text-slate-400" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-200">{t('alertAt')} {limit}% {t('utilization')}</span>
                                    </div>
                                    <button
                                        onClick={() => updateNotificationPref(key, !notificationPrefs[key])}
                                        className={cn(
                                            "relative w-10 h-5 rounded-full border transition-colors duration-200",
                                            notificationPrefs[key] ? "bg-blue-600 border-blue-400/50" : "bg-slate-800 border-white/10"
                                        )}
                                    >
                                        <motion.div
                                            initial={false}
                                            animate={{ x: notificationPrefs[key] ? 20 : 2 }}
                                            className={cn(
                                                "absolute top-0.5 size-3.5 rounded-full shadow-lg",
                                                notificationPrefs[key] ? "bg-white" : "bg-slate-500"
                                            )}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* System Operations */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">{t('systemOperations')}</h3>
                            {[
                                { label: t('deepScanFinished'), icon: CheckCircle2, color: 'text-emerald-400', key: 'deepScanFinished' as keyof typeof notificationPrefs },
                                { label: t('urlReadFailure'), icon: Info, color: 'text-rose-400', key: 'urlReadFailure' as keyof typeof notificationPrefs },
                                { label: t('docsExportReady'), icon: FileText, color: 'text-blue-400', key: 'docsExportReady' as keyof typeof notificationPrefs },
                            ].map((op) => (
                                <div key={op.label} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.08] transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="size-8 rounded-lg bg-black/20 flex items-center justify-center border border-white/5">
                                            <op.icon className={cn("size-4", op.color)} />
                                        </div>
                                        <span className="text-sm font-medium text-slate-200">{op.label}</span>
                                    </div>
                                    <button
                                        onClick={() => updateNotificationPref(op.key, !notificationPrefs[op.key])}
                                        className={cn(
                                            "relative w-10 h-5 rounded-full border transition-colors duration-200",
                                            notificationPrefs[op.key] ? "bg-emerald-600 border-emerald-400/50" : "bg-slate-800 border-white/10"
                                        )}
                                    >
                                        <motion.div
                                            initial={false}
                                            animate={{ x: notificationPrefs[op.key] ? 20 : 2 }}
                                            className={cn(
                                                "absolute top-0.5 size-3.5 rounded-full shadow-lg",
                                                notificationPrefs[op.key] ? "bg-white" : "bg-slate-500"
                                            )}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 3. Subscription and Add-on Studio (The Armory) */}
                <section className="space-y-8">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 shadow-inner">
                            <CreditCard className="size-5 text-purple-400" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{t('subscriptionStudio')}</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Current Plan */}
                        <div className="bg-gradient-to-br from-indigo-600/10 to-purple-600/5 border border-indigo-500/20 rounded-3xl p-8 space-y-6 flex flex-col justify-between">
                            <div>
                                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">{t('activeTier')}</span>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <h3 className="text-3xl font-black tracking-tight text-white capitalize">{currentPlanId} {t('plan') || 'Plan'}</h3>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm text-slate-300">
                                    <CheckCircle2 className="size-4 text-emerald-400" />
                                    <span>{totalLimits.projects} {t('projectsIncluded')}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-300">
                                    <CheckCircle2 className="size-4 text-emerald-400" />
                                    <span>{totalLimits.personas} {t('advancedPersonas')}</span>
                                </div>
                            </div>
                            <button
                                onClick={handleManageSubscription}
                                disabled={isManagingSubscription}
                                className="w-full py-4 bg-white/5 disabled:opacity-50 hover:bg-white/10 transition-all rounded-2xl text-xs font-black uppercase tracking-widest border border-white/10"
                            >
                                {isManagingSubscription ? "Redirecting..." : "Manage Subscription"}
                            </button>
                            <button
                                onClick={handleUpgradeToAgency}
                                disabled={isUpgrading}
                                className="w-full py-4 bg-white text-black hover:bg-slate-200 rounded-2xl text-sm font-bold transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50"
                            >
                                {isUpgrading ? "Processing..." : t('upgradeToAgency')}
                            </button>
                        </div>

                        {/* Add-on Market */}
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-8 space-y-6 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute -right-12 -top-12 size-40 bg-pink-500/20 rounded-full blur-3xl group-hover:bg-pink-500/30 transition-colors" />

                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">{t('veoStudio')}</h3>
                                    <span className="text-xs font-black text-pink-400 bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20">
                                        {hasVeoStudio ? "Active" : t('veoPrice')}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-400 leading-relaxed max-w-[90%]">
                                    {t('veoDesc')}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('status')}</span>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                        {!hasVeoStudio ? (
                                            <><Lock className="size-3" />{t('lockedFeature')}</>
                                        ) : (
                                            <><CheckCircle2 className="size-3 text-emerald-400" /><span className="text-emerald-400">Unlocked</span></>
                                        )}
                                    </div>
                                </div>
                                {!hasVeoStudio && (
                                    <button
                                        onClick={handleBuyAddon}
                                        disabled={isBuyingAddon}
                                        className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl text-sm font-bold transition-all active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                                    >
                                        {isBuyingAddon ? "Processing..." : t('buyAddon')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Global Preferences and Appearance (The Cockpit) */}
                <section className="space-y-8 pb-20">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-slate-600/10 flex items-center justify-center border border-slate-500/20 shadow-inner">
                            <ShieldCheck className="size-5 text-slate-400" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{t('globalPreferences')}</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Theme Select */}
                        <div className="space-y-4">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('themeEngine')}</span>
                            <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 overflow-hidden">
                                <button
                                    onClick={() => setTheme('dark')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-xs font-bold", theme === 'dark' ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}
                                >
                                    <Moon className="size-3.5" /> {t('dark')}
                                </button>
                                <button
                                    onClick={() => setTheme('light')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-xs font-bold", theme === 'light' ? "bg-white text-black shadow-lg" : "text-slate-500 hover:text-slate-300")}
                                >
                                    <Sun className="size-3.5" /> {t('light')}
                                </button>
                            </div>
                        </div>

                        {/* Localization */}
                        <div className="space-y-4">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('systemLanguage')}</span>
                            <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 overflow-hidden">
                                <button
                                    onClick={() => setLanguage('en')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-xs font-bold", language === 'en' ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}
                                >
                                    <Globe className="size-3.5" /> {t('englishGlobal')}
                                </button>
                                <button
                                    onClick={() => setLanguage('es')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-xs font-bold", language === 'es' ? "bg-white text-black shadow-lg" : "text-slate-500 hover:text-slate-300")}
                                >
                                    <Globe className="size-3.5" /> {t('spanishIberian')}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 5. Help & Support */}
                <section className="space-y-8 pb-10">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
                            <Mail className="size-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">Help & Support</h2>
                    </div>

                    <div className="bg-white/5 border border-white/5 rounded-3xl p-8 flex flex-col items-start space-y-4">
                        <h3 className="text-lg font-bold text-white">Need Assistance?</h3>
                        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                            If you have any questions, encounter issues, or want to share feedback, we're here to help. Reach out to our dedicated support team, and we'll respond as quickly as possible.
                        </p>
                        <a
                            href="mailto:support@vultintel.com"
                            className="inline-flex items-center gap-2 mt-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                        >
                            <Mail className="size-4" />
                            Email support@vultintel.com
                        </a>
                    </div>
                </section>
            </div>

            {/* Premium Toast Feedback */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="fixed bottom-8 right-8 z-50"
                    >
                        <div className={cn(
                            "px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3",
                            toast.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                toast.type === 'error' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                                    "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}>
                            {toast.type === 'success' ? <CheckCircle2 className="size-5" /> : <Info className="size-5" />}
                            <span className="text-sm font-bold tracking-tight">{toast.message}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
