import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface TealButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
const TealButton: React.FC<TealButtonProps> = ({ children, className, ...props }) => (
  <button 
    {...props}
    className={`inline-flex items-center justify-center font-medium rounded-lg px-4 py-2 ${className || ''}`}
  >
    {children}
  </button>
);

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught global frontend error:`, error, errorInfo);
    
    // Post to the backend bridge to trigger discord/slack alerts
    fetch('/api/alerts/frontend-crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage: error.message || error.toString(),
        stackTrace: error.stack || (errorInfo as any).componentStack,
        requestPath: window.location.pathname + window.location.search,
      })
    }).catch(e => console.error('Failed to bridge frontend crash alert:', e));
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-8 max-w-lg shadow-2xl">
            <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 mx-auto">
              <AlertCircle className="text-red-400 size-8" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">System Crash</h1>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">
              Vult Intel encountered an unexpected error. Our forensic team has been automatically notified with the crash details.
            </p>
            {this.state.error && (
              <div className="w-full bg-black/50 rounded-lg p-4 mb-8 text-left overflow-auto max-h-48 border border-white/5">
                <code className="text-xs text-red-300 font-mono break-all leading-relaxed whitespace-pre-wrap">
                  {this.state.error.message || this.state.error.toString()}
                </code>
              </div>
            )}
            <TealButton 
              onClick={this.handleReset}
              className="w-full border-red-500/30 text-red-100 bg-red-600 hover:bg-red-500 hover:border-red-400 transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]"
            >
              <RefreshCw className="size-4 mr-2" /> Reload Application
            </TealButton>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
