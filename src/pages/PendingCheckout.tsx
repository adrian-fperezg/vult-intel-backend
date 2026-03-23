import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import PricingSection from '@/components/PricingSection';
import { useCheckout } from '@/hooks/useCheckout';
import Logo from '@/components/Logo';

export default function PendingCheckout() {
    const { currentUser, logout, isTester } = useAuth();
    const navigate = useNavigate();
    const { startCheckout, isLoading: isCheckoutLoading } = useCheckout();
    const [isProcessingPending, setIsProcessingPending] = useState(false);

    useEffect(() => {
        if (isTester) {
            navigate('/projects-hub', { replace: true });
            return;
        }

        const pendingProductId = localStorage.getItem('landingPendingCheckout');
        if (pendingProductId && currentUser) {
            setIsProcessingPending(true);
            localStorage.removeItem('landingPendingCheckout');
            startCheckout(pendingProductId, window.location.origin + '/projects-hub', window.location.origin + '/pending-checkout')
                .finally(() => setIsProcessingPending(false));
        }
    }, [isTester, navigate, currentUser, startCheckout]);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark text-slate-100 font-sans flex flex-col">
            {/* Simple Topbar */}
            <header className="flex items-center justify-between p-6 border-b border-surface-border bg-surface-darker">
                <div className="flex items-center gap-2">
                    <Logo dark />
                </div>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-surface-lighter transition-colors"
                >
                    <LogOut className="size-4" />
                    <span className="text-sm font-medium">Cerrar Sesión</span>
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 text-center">
                    <div className="inline-flex items-center justify-center p-4 bg-yellow-500/10 rounded-full mb-6 border border-yellow-500/20">
                        <AlertTriangle className="size-8 text-yellow-500" />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[var(--text-main)]">
                        ¡Bienvenido, {currentUser?.displayName?.split(' ')[0] || 'futuro líder'}!
                    </h1>

                    <div className="p-6 bg-surface-dark border border-surface-border rounded-2xl max-w-2xl mx-auto mt-8 shadow-lg">
                        <p className="text-lg md:text-xl text-[var(--text-muted)] leading-relaxed">
                            Tu cuenta está registrada y lista para usarse, pero necesitas una licencia activa para desbloquear el acceso al motor de inteligencia.
                        </p>
                        <p className="text-[var(--text-muted)] mt-4">
                            Selecciona un plan a continuación y completa tu pago seguro a través de Stripe para activar tu espacio de trabajo al instante.
                        </p>
                    </div>
                </div>

                <PricingSection />

                <div className="pb-16 text-center text-sm text-[var(--text-muted)]">
                    Si crees que esto es un error o ya pagaste, por favor contacta a soporte.
                </div>
            </main>
        </div>
    );
}
