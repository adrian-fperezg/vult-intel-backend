import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, MailX, Loader2, AlertTriangle } from 'lucide-react';

export default function Unsubscribe() {
  const { token } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // --- Resolve identity from URL ---
  // New format: /unsubscribe?email=...&c={contact_id}&p={project_id}
  // Legacy format: /unsubscribe/{encrypted-token}
  const emailParam   = searchParams.get('email')  || '';
  const contactId    = searchParams.get('c')       || '';
  const projectId    = searchParams.get('p')       || '';
  const isLegacy     = !!token && !emailParam;

  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isSuccess, setIsSuccess]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Validate the URL on mount — if neither email nor token is present, show error
  const isValidUrl = !!(emailParam || token);

  const handleUnsubscribe = async () => {
    if (!isValidUrl) {
      setError('Invalid unsubscribe link. Please contact support.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';

      const body = isLegacy
        ? JSON.stringify({ token })
        : JSON.stringify({
            email: emailParam,
            contact_id: contactId || undefined,
            project_id: projectId || undefined,
          });

      const response = await fetch(`${apiUrl}/api/outreach/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unsubscribe. Please try again or contact support.');
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0A0A0B] to-[#0A0A0B]">

      {/* Background Decorators */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="absolute top-0 inset-x-0 h-[500px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-[#13141A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 transition-all duration-500">

        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-2 h-2 rounded-full bg-teal-400" />
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-slate-500">Vult Intel</span>
        </div>

        {/* Header Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/5 flex items-center justify-center shadow-inner relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
            {isSuccess ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" strokeWidth={1.5} />
            ) : !isValidUrl ? (
              <AlertTriangle className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
            ) : (
              <MailX className="w-8 h-8 text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]" strokeWidth={1.5} />
            )}
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white/90">
            {isSuccess ? 'Unsubscribed Successfully' : !isValidUrl ? 'Invalid Link' : 'Unsubscribe Request'}
          </h1>

          {/* Invalid URL state */}
          {!isValidUrl && (
            <p className="text-slate-400 leading-relaxed">
              This unsubscribe link is invalid or has expired. If you want to opt out, please reply to the original email and we will remove you immediately.
            </p>
          )}

          {/* Success state */}
          {isSuccess && (
            <>
              {emailParam && (
                <p className="text-slate-500 text-sm font-mono bg-white/5 px-3 py-1.5 rounded-lg mt-1">
                  {emailParam}
                </p>
              )}
              <p className="text-slate-300 leading-relaxed font-light mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                You have been permanently opted out. You will not receive further outreach from this sender.
              </p>
              <div className="pt-4">
                <button
                  onClick={() => navigate('/')}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl transition-all duration-300 font-medium tracking-wide text-sm"
                >
                  Return to Homepage
                </button>
              </div>
            </>
          )}

          {/* Confirmation state */}
          {isValidUrl && !isSuccess && (
            <>
              {emailParam && (
                <p className="text-slate-500 text-sm font-mono bg-white/5 px-3 py-1.5 rounded-lg mt-1 break-all">
                  {emailParam}
                </p>
              )}
              <p className="text-slate-400 leading-relaxed text-sm">
                Click the button below to confirm you no longer wish to receive outreach. This action is permanent and takes effect immediately.
              </p>

              {error && (
                <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="pt-4 space-y-4">
                <button
                  id="confirm-unsubscribe-btn"
                  onClick={handleUnsubscribe}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-red-500/80 to-rose-600/80 hover:from-red-500 hover:to-rose-600 text-white rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    'Confirm Unsubscribe'
                  )}
                </button>
                <p className="text-xs text-slate-600 text-center">
                  Protected under CAN-SPAM and GDPR regulations.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
