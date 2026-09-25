'use client';

import React, { Component, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

interface RpcErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface RpcErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface RpcErrorCopy {
  title: string;
  description: string;
  retry: string;
}

class RpcErrorBoundaryInner extends Component<
  RpcErrorBoundaryProps & { copy: RpcErrorCopy },
  RpcErrorBoundaryState
> {
  constructor(props: RpcErrorBoundaryProps & { copy: RpcErrorCopy }) {
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
      const { copy } = this.props;
      return (
        <Notice
          as="h2"
          title={copy.title}
          body={copy.description}
          action={
            <Button variant="secondary" onClick={this.handleRetry}>
              <RotateCw aria-hidden="true" strokeWidth={1.75} />
              {copy.retry}
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

// Wrapper to inject next-intl hooks
export function RpcErrorBoundary(props: RpcErrorBoundaryProps): JSX.Element {
  const t = useTranslations('RpcError');
  const copy = { title: t('title'), description: t('description'), retry: t('retry') };
  return <RpcErrorBoundaryInner {...props} copy={copy} />;
}
