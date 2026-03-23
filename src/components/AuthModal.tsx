import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Lock, LogIn, UserPlus, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSettings } from '../contexts/SettingsContext';
import Logo from './Logo';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register, loginWithGoogle } = useAuth();
    const { theme } = useSettings();
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password);
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error occurred during authentication');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setError('');
            await loginWithGoogle();
            onClose();
        } catch (err: any) {
            setError('Failed to log in with Google');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={cn("relative w-full max-w-md border rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90dvh] overflow-y-auto", theme === 'dark' ? "bg-[#171b23] border-surface-border" : "bg-[#ffffff] border-slate-200")}>
                {/* Decorative gradient blur */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/20 rounded-full blur-[60px] opacity-50 pointer-events-none" />

                <button
                    onClick={onClose}
                    className={cn("absolute top-4 right-4 transition-colors", theme === 'dark' ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900")}
                >
                    <X className="size-5" />
                </button>

                <div className="flex flex-col items-center mb-6 mt-4">
                    <div className="flex items-center gap-3">
                        <Logo className="h-[5.6rem]" dark={theme === 'dark'} />
                    </div>
                </div>

                <div className="mb-8 text-center">
                    <h2 className={cn("text-2xl font-bold tracking-tight mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {isLogin
                            ? 'Enter your credentials to access your workspace'
                            : 'Sign up to start using Vult Intel tools'}
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-surface-darker border border-surface-border rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                placeholder="you@email.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-surface-darker border border-surface-border rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                    >
                        {isLogin ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
                        {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
                    </button>
                </form>

                <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-surface-border" />
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">or continue with</span>
                    <div className="h-px flex-1 bg-surface-border" />
                </div>

                <button
                    onClick={handleGoogleLogin}
                    type="button"
                    className="w-full bg-surface-darker hover:bg-white/5 border border-surface-border text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                    <svg className="size-4" viewBox="0 0 24 24">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                        <path d="M1 1h22v22H1z" fill="none" />
                    </svg>
                    Google
                </button>

                <div className="mt-6 text-center">
                    <button
                        type="button"
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-slate-400 hover:text-primary transition-colors cursor-pointer"
                    >
                        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                    </button>
                    <div className="mt-6 pt-4 border-t border-slate-200/50 dark:border-slate-800/50 text-center text-[10px] uppercase font-bold tracking-widest text-slate-500">
                        By continuing, you agree to our{' '}
                        <button onClick={() => { onClose(); navigate('/privacy'); }} className="text-blue-500 hover:underline">Privacy Policy</button>
                        {' '}and{' '}
                        <button onClick={() => { onClose(); navigate('/terms'); }} className="text-blue-500 hover:underline">Terms of Service</button>.
                    </div>
                </div>
            </div>
        </div>
    );
}
