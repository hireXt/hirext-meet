'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { LogoMark, WarningIcon } from '@/lib/ailink/icons';

/**
 * Top-level error boundary around the conference UI (E.2 fix).
 * A render crash no longer blanks the tab: it shows the ended-style error
 * screen, logs structured details, and reports to the shell's onError.
 */
export class MeetingErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Structured console reporting; wire to a real reporter (e.g. Sentry) later.
    console.error('[MeetingErrorBoundary]', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    toast.error('Something went wrong in the meeting.');
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ail-ended" role="alert">
          <div className="ail-ended-card ail-gate-card--error">
            <div className="ail-ended-mark" aria-hidden="true">
              <LogoMark size={38} />
            </div>
            <div className="ail-ended-icon" aria-hidden="true">
              <WarningIcon size={24} />
            </div>
            <h1 className="ail-ended-title">Something went wrong</h1>
            <p className="ail-ended-msg">
              {this.state.error.message || 'An unexpected error occurred in the meeting.'}
            </p>
            <Link href="/" className="ail-ended-cta">
              Go to Home
            </Link>
            <p className="ail-ended-hint">You can close this tab and rejoin the meeting.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
