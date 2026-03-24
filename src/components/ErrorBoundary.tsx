import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { TealButton } from '@/pages/outreach/OutreachCommon';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'component'}:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center border border-red-500/20 bg-red-500/5 rounded-2xl mx-auto max-w-lg my-8">
          <div className="size-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
            <AlertCircle className="text-red-400 size-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            There was an error rendering this section. This usually happens when data is missing or in an unexpected format.
          </p>
          {this.state.error && (
            <div className="w-full bg-black/40 rounded-lg p-3 mb-6 text-left overflow-auto max-h-32 shadow-inner">
              <code className="text-[10px] text-red-300 font-mono break-all line-clamp-4 leading-relaxed">
                {this.state.error.toString()}
              </code>
            </div>
          )}
          <TealButton 
            variant="outline" 
            size="sm" 
            onClick={this.handleReset}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all active:scale-95"
          >
            <RefreshCw className="size-3.5 mr-2" /> Try Again
          </TealButton>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
