'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CheckIcon, GoogleMeetLogo, PhoneOffIcon, StarIcon } from './icons';

/**
 * Full-screen "Meeting ended" state shown after Leave (or a dropped call).
 * Replaces the whole conference UI so nothing lingers: no nav, dock, stage
 * placeholders, or "Connecting…" spinners.
 * B.10 fix: optional one-click rejoin (`onRejoin` callback or `rejoinHref`)
 * for dropped/errored sessions.
 */
export function MeetingEndedScreen({
  title = 'You left the meeting',
  message = 'Thanks for your time. Have a great day!',
  onRejoin,
  rejoinHref,
}: {
  title?: string;
  message?: string;
  onRejoin?: () => void;
  rejoinHref?: string;
}) {
  const canRejoin = Boolean(onRejoin || rejoinHref);
  const [rated, setRated] = React.useState(false);

  return (
    <div className="ail-ended" role="status">
      <div className="ail-ended-card">
        <div className="ail-ended-mark" aria-hidden="true">
          <GoogleMeetLogo size={48} />
        </div>
        <h1 className="ail-ended-title">{title}</h1>
        <p className="ail-ended-msg">{message}</p>

        <div className="ail-ended-actions">
          {canRejoin && (
            <button
              type="button"
              className="ail-ended-btn-primary"
              onClick={() => (onRejoin ? onRejoin() : undefined)}
            >
              Rejoin
            </button>
          )}
          <Link href="/" className={canRejoin ? 'ail-ended-btn-secondary' : 'ail-ended-btn-primary'}>
            Return to home screen
          </Link>
        </div>

        {!rated ? (
          <div className="ail-ended-feedback">
            <span style={{ fontSize: '13px', color: '#5f6368' }}>How was the audio and video?</span>
            <div className="ail-ended-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="ail-star-btn"
                  onClick={() => {
                    setRated(true);
                    toast.success('Thank you for your feedback!');
                  }}
                  title={`Rate ${star} out of 5`}
                  aria-label={`Rate ${star} out of 5`}
                >
                  <StarIcon size={18} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: '#34a853', marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckIcon size={16} />
            <span>Thank you for your feedback!</span>
          </p>
        )}

        <p className="ail-ended-hint">Your meeting was protected with meeXt real-time encryption.</p>
      </div>
    </div>
  );
}
