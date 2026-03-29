'use client';

import React, { Component, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface RpcErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface RpcErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Class component for the boundary itself
class RpcErrorBoundaryInner extends Component<
  RpcErrorBoundaryProps & { t: any },
  RpcErrorBoundaryState
> {
  constructor(props: RpcErrorBoundaryProps & { t: any }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RpcErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-8 bg-zinc-50 border border-zinc-200 rounded-2xl mx-auto max-w-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-zinc-900 mb-2">
            {t('title')}
          </h3>
          <p className="text-zinc-500 mb-8 max-w-md">
            {t('description')}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-6 py-2.5 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-colors"
          >
            {t('retry')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper to inject next-intl hooks
export function RpcErrorBoundary(props: RpcErrorBoundaryProps): JSX.Element {
  const t = useTranslations('RpcError');
  return <RpcErrorBoundaryInner {...props} t={t} />;
}
