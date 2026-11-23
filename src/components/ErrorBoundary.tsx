import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HaulDesk render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F7F5] dark:bg-[#121211] text-[#111110] dark:text-[#F4F4F0] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-6 space-y-4 shadow-sm">
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] leading-relaxed">
              The interface encountered an error while loading. You can reload the page to restore your session.
            </p>
            {this.state.message && (
              <p className="text-[11px] font-mono bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl p-3 break-words text-[#DC2626] dark:text-[#F87171]">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 rounded-xl bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            >
              Reload HaulDesk
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
