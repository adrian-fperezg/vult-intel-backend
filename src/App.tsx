import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import DesignLab from './pages/DesignLab';
import DeepScan from './pages/DeepScan';
import Pulse from './pages/Pulse';
import WebGrowthPlan from './pages/WebGrowthPlan';
import Workflows from './pages/Workflows';
import ContentGenerator from './pages/ContentGenerator';
import Landing from './pages/Landing';
import PendingCheckout from './pages/PendingCheckout';
import Settings from './pages/Settings';
import GlobalBrandStrategy from './pages/GlobalBrandStrategy';
import GrowthMastermind from './pages/GrowthMastermind';
import CampaignArchitectLayout from './components/CampaignArchitectLayout';
import PersonaStudioLayout from './components/PersonaStudioLayout';
import OutreachLayout from './pages/OutreachLayout';
import VeoStudioLayout from './pages/VeoStudioLayout';
import AuthPage from './pages/AuthPage';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Unsubscribe from './pages/Unsubscribe';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { logPageView } from './services/analytics';

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    logPageView(location.pathname + location.search);
  }, [location]);

  return null;
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <BrowserRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
            },
          }}
        />
        <RouteTracker />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/unsubscribe/:token" element={<Unsubscribe />} />
          <Route path="/pending-checkout" element={<PendingCheckout />} />

          <Route element={<Layout />}>
            <Route path="projects-hub" element={<Pulse />} />
            <Route path="content-generator" element={<ContentGenerator />} />
            <Route path="deep-scan/:projectId" element={<DeepScan />} />
            <Route path="deep-scan" element={<DeepScan />} />
            <Route path="web-growth-plan" element={<WebGrowthPlan />} />
            <Route path="visual-workflows" element={<Workflows />} />
            <Route path="global-brand-strategy" element={<GlobalBrandStrategy />} />
            <Route path="persona-studio" element={<PersonaStudioLayout />} />
            <Route path="campaign-architect" element={<CampaignArchitectLayout />} />
            <Route path="growth-mastermind" element={<GrowthMastermind />} />
            <Route path="settings" element={<Settings />} />
            <Route path="outreach" element={<OutreachLayout />} />
            <Route path="veo-studio" element={<VeoStudioLayout />} />
          </Route>
          {/* Catch-all route to redirect back to Landing or 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}
