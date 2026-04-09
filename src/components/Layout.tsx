import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import AIChatAssistant from './AIChatAssistant';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { useSubscription } from '../hooks/useSubscription';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../lib/utils';

export default function Layout() {
  const { currentUser, isAdmin, isTester, isFounder } = useAuth();
  const { activeProjectId } = useProject();
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
      <main className="flex-1 min-w-0 h-screen overflow-y-auto flex flex-col overflow-x-hidden lg:ml-64 xl:ml-72">
        {/* Mobile Header Spacer - Provides room for fixed hamburger menu */}
        <div className="lg:hidden h-14 md:h-16 w-full shrink-0" />

        {/* Page Content */}
        <div className="flex-1 w-full overflow-y-auto relative z-0" key={activeProjectId || 'no-project'}>
          <Outlet />
        </div>
      </main>

      {/* Global AI Chat Assistant */}
      <AIChatAssistant />
    </div>
  );
}
