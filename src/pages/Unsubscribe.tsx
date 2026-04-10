import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, MailX, Loader2 } from 'lucide-react';

export default function Unsubscribe() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnsubscribe = async () => {
    if (!token) {
      setError("Invalid or missing token.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_OUTREACH_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiUrl}/api/outreach/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to unsubscribe. Please try again or contact support.");
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
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
      <div className="absolute top-0 inset-x-0 h-[500px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#13141A]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 transition-all duration-500">
        
        {/* Header Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/5 flex items-center justify-center shadow-inner relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent"></div>
            {isSuccess ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" strokeWidth={1.5} />
            ) : (
              <MailX className="w-8 h-8 text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]" strokeWidth={1.5} />
            )}
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white/90">
            {isSuccess ? "Unsubscribed Successfully" : "Unsubscribe Request"}
          </h1>
          
          {isSuccess ? (
            <>
              <p className="text-slate-300 leading-relaxed font-light mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                You have been permanently removed from our database. We confirm that you will not receive further communications from Vult Intel.
              </p>
              <div className="pt-6">
                <button 
                  onClick={() => navigate('/')}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl transition-all duration-300 font-medium tracking-wide text-sm"
                >
                  Return to Homepage
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-400 leading-relaxed">
                Click the button below to confirm you no longer wish to receive communications from Vult Intel. This action is permanent.
              </p>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="pt-6 space-y-4">
                <button
                  onClick={handleUnsubscribe}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-red-500/80 to-rose-600/80 hover:from-red-500 hover:to-rose-600 text-white rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Unsubscribe"
                  )}
                </button>
                <div className="text-xs text-slate-500 text-center">
                  Protected strictly under CAN-SPAM and GDPR regulations.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
