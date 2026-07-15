import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '48px 24px', textAlign: 'center', background: 'var(--c-bg)',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--c-error-subtle)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: '20px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-error)"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: '8px' }}>
            页面出错了
          </h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-secondary)', marginBottom: '24px', maxWidth: '420px' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button className="btn btn-primary" onClick={this.handleReset}>重试</button>
        </div>
      );
    }

    return this.props.children;
  }
}
