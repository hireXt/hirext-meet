'use client';

import Link from 'next/link';
import { LogoMark, PhoneOffIcon } from './icons';

/**
 * Full-screen "Meeting ended" state shown after Leave (or a dropped call).
 * Replaces the whole conference UI so nothing lingers: no nav, dock, stage
 * placeholders, or "Connecting…" spinners.
 */
export function MeetingEndedScreen({
  title = 'Meeting ended',
  message = 'You ended the interview. Thanks for your time!',
}: {
  title?: string;
  message?: string;
}) {
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
        <Link href="/" className="ail-ended-cta">
          Go to Home
        </Link>
        <p className="ail-ended-hint">You can close this tab now.</p>
      </div>
    </div>
  );
}
