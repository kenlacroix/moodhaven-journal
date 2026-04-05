import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/services/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Uncaught render error', {
      error: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Something went wrong rendering this view.
          </p>
          <button
            className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
