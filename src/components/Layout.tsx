import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import AIChatAssistant from './AIChatAssistant';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../lib/utils';

import Logo from './Logo';

export default function Layout() {
  const { currentUser, isAdmin, isTester, isFounder } = useAuth();
  const { hasActiveSubscription, loading } = useSubscription();
  const { theme } = useSettings();

  console.log("[Layout] Rendering...", { 
    userId: currentUser?.uid, 
    isAdmin, 
    isTester, 
    isFounder, 
    isSubscriptionLoading: loading, 
    hasActiveSubscription 
  });

  if (!currentUser) {
    console.log("[Layout] No user, redirecting to /");
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="size-10 border-4 border-t-blue-500 border-surface-border rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasActiveSubscription && !isAdmin && !isTester && !isFounder) {
    return <Navigate to="/pending-checkout" replace />;
  }

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-background-dark text-slate-100 font-sans relative">
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto flex flex-col overflow-x-hidden lg:ml-[260px] xl:ml-[280px]">
        {/* Global Header */}
        <header className={cn(
          "relative z-20 w-full flex items-center shrink-0 h-16 px-4 lg:px-8 border-b border-white/5 transition-all",
          theme === 'dark' ? "bg-[#171b23]" : "bg-[#ffffff]"
        )}>
          <div className="flex items-center gap-4 w-full">
            <div className="lg:hidden mr-auto -ml-2">
              <Logo iconOnly className="h-14" dark={theme === 'dark'} />
            </div>

            {/* Space for future header elements (search, help, notifications) */}
            <div className="flex-1" />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto relative z-0">
          <Outlet />
        </div>
      </main>

      {/* Global AI Chat Assistant */}
      <AIChatAssistant />
    </div>
  );
}
