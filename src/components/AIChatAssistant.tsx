import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Trash2, Bot, User, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { generateChatResponse, ChatMessage } from '@/services/ai';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export default function AIChatAssistant() {
    const { activeProject, activeProjectId } = useProject();
    const { currentUser } = useAuth();
    const { language } = useSettings();
    const { t } = useTranslation();

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; content: string }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Project Isolation: Clear chat when project changes
    useEffect(() => {
        setMessages([]);
    }, [activeProjectId]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            // 1. Sliding Window Logic: Only keep the last 8 messages (4 interactions)
            // Gemini models expect history as { role: 'user'|'model', parts: [{ text: '...' }] }
            const history: ChatMessage[] = messages
                .slice(-7) // Last 7 messages + the new one = 8
                .map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                }));

            // Add current message
            history.push({
                role: 'user',
                parts: [{ text: userMessage }]
            });

            // 2. Call AI Service
            const response = await generateChatResponse(history, currentUser?.uid, activeProject, language);

            setMessages(prev => [...prev, { role: 'model', content: response }]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'model', content: t('chatError') }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        if (window.confirm(t('chatClearConfirm'))) {
            setMessages([]);
        }
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "fixed bottom-6 right-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-500 transition-all hover:scale-110",
                    isOpen && "opacity-0 pointer-events-none"
                )}
            >
                <MessageSquare className="size-6" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            height: isMinimized ? '64px' : '600px',
                            width: '400px'
                        }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-6 right-6 z-50 bg-surface-dark border border-surface-border rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[calc(100vw-3rem)] sm:w-[400px]"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-light">
                            <div className="flex items-center gap-2">
                                <div className="size-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                    <Bot className="size-5 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">{t('chatAssistant')}</h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {activeProject ? `${t('chatContext')} ${activeProject.project.name}` : t('chatNoContext')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={clearChat}
                                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                                    title={t('chatClearHistory')}
                                >
                                    <Trash2 className="size-4" />
                                </button>
                                <button
                                    onClick={() => setIsMinimized(!isMinimized)}
                                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                >
                                    {isMinimized ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>

                        {!isMinimized && (
                            <>
                                {/* Messages Area */}
                                <div
                                    ref={scrollRef}
                                    className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-surface-mid"
                                >
                                    {messages.length === 0 && (
                                        <div className="mt-8 text-center space-y-3 px-6">
                                            <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                                                <Bot className="size-6 text-blue-400" />
                                            </div>
                                            <h4 className="text-white font-medium">{t('chatWelcomeTitle')}</h4>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                {t('chatWelcomeDesc')}
                                            </p>
                                        </div>
                                    )}

                                    {messages.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                "flex gap-3",
                                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            <div className={cn(
                                                "size-8 rounded-lg flex items-center justify-center shrink-0 border border-white/10",
                                                msg.role === 'user' ? "bg-white/5" : "bg-blue-600/10"
                                            )}>
                                                {msg.role === 'user' ? <User className="size-4 text-slate-400" /> : <Bot className="size-4 text-blue-400" />}
                                            </div>
                                            <div className={cn(
                                                "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed prose prose-invert prose-p:leading-relaxed prose-pre:bg-surface-mid prose-pre:border prose-pre:border-white/10",
                                                msg.role === 'user'
                                                    ? "bg-blue-600 text-white rounded-tr-none"
                                                    : "bg-surface-light text-slate-200 rounded-tl-none border border-surface-border shadow-sm"
                                            )}>
                                                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                                            </div>
                                        </div>
                                    ))}

                                    {isLoading && (
                                        <div className="flex gap-3">
                                            <div className="size-8 rounded-lg bg-blue-600/10 flex items-center justify-center shrink-0 border border-white/10">
                                                <Bot className="size-4 text-blue-400" />
                                            </div>
                                            <div className="bg-white/5 text-slate-400 rounded-2xl rounded-tl-none border border-white/5 p-3">
                                                <Loader2 className="size-4 animate-spin" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Input Area */}
                                <div className="p-4 border-t border-surface-border bg-surface-light">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder={t('chatPlaceholder')}
                                            className="w-full bg-surface-light border border-surface-border rounded-xl py-3 pl-4 pr-12 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!input.trim() || isLoading}
                                            className="absolute right-2 top-1.5 p-2 text-blue-500 hover:text-blue-400 disabled:text-slate-700 transition-colors"
                                        >
                                            {isLoading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-center text-slate-600 mt-3">
                                        {t('chatFooterNote')}
                                    </p>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
