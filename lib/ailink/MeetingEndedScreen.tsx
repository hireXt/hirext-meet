'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogoMark, PhoneOffIcon } from './icons';

/**
 * Full-screen "Meeting ended" state shown after Leave (or a dropped call).
 * Replaces the whole conference UI so nothing lingers: no nav, dock, stage
 * placeholders, or "Connecting…" spinners.
 * B.10 fix: optional one-click rejoin (`onRejoin` callback or `rejoinHref`)
 * for dropped/errored sessions.
 */
export function MeetingEndedScreen({
  title = 'Meeting ended',
  message = 'You ended the interview. Thanks for your time!',
  onRejoin,
  rejoinHref,
}: {
  title?: string;
  message?: string;
  /** Called by the "Rejoin" button; parent remounts the shell for a fresh connect. */
  onRejoin?: () => void;
  /** Alternative to `onRejoin`: navigate to this href to rejoin. */
  rejoinHref?: string;
}) {
  const canRejoin = Boolean(onRejoin || rejoinHref);
  return (
    <div className="ail-ended" role="status">
      <div className="ail-ended-card">
        <div className="ail-ended-mark" aria-hidden="true">
          <LogoMark size={38} />
        </div>
        <div className="ail-ended-icon" aria-hidden="true">
          <PhoneOffIcon size={24} />
        </div>
        <h1 className="ail-ended-title">{title}</h1>
        <p className="ail-ended-msg">{message}</p>
        {canRejoin && (
          <button
            type="button"
            className="ail-ended-cta"
            onClick={() => (onRejoin ? onRejoin() : undefined)}
          >
            Rejoin meeting
          </button>
        )}
        <Link href="/" className={canRejoin ? 'ail-ended-secondary' : 'ail-ended-cta'}>
          Go to Home
        </Link>
        <p className="ail-ended-hint">You can close this tab now.</p>
      </div>
    </div>
  );
}
