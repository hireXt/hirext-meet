'use client';

import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { encodePassphrase, generateRoomId, randomString } from '@/lib/client-utils';
import { LogoMark } from '@/lib/ailink/icons';
import styles from '../styles/Home.module.css';

function QuickMeetingCard() {
  const router = useRouter();
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));
  const startMeeting = () => {
    if (e2ee) {
      router.push(`/rooms/${generateRoomId()}#${encodePassphrase(sharedPassphrase)}`);
    } else {
      router.push(`/rooms/${generateRoomId()}`);
    }
  };
  return (
    <div className={styles.tabContent}>
      <h2 className={styles.cardTitle}>Start a meeting</h2>
      <p className={styles.description}>
        Try HireXt Meet for free. Share the link and start collaborating
        instantly.
      </p>
      <button className={styles.startButton} onClick={startMeeting}>
        Start Meeting
      </button>
      <hr className={styles.divider} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className={styles.checkboxRow}>
          <input
            id="use-e2ee"
            type="checkbox"
            className={styles.checkbox}
            checked={e2ee}
            onChange={(ev) => setE2ee(ev.target.checked)}
          />
          <label htmlFor="use-e2ee">Enable end-to-end encryption</label>
        </div>
        {e2ee && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="passphrase" className={styles.description}>
              Passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              className={styles.input}
              value={sharedPassphrase}
              onChange={(ev) => setSharedPassphrase(ev.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <main className={styles.main}>
        <div className="header">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              justifyContent: 'center',
              margin: '0 auto',
            }}
          >
            <LogoMark size={36} />
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#12142b',
              }}
            >
              HireXt Meet
            </span>
          </div>
          <h2>
            HireXt Meet — AI-powered, secure real-time meetings. Share the link and start
            collaborating instantly.
          </h2>
        </div>
        <Suspense fallback="Loading">
          <QuickMeetingCard />
        </Suspense>
      </main>
      <footer>
        <div>HireXt Meet — secure, AI-powered video meetings.</div>
        <div style={{ marginTop: '4px', fontSize: '12.5px' }}>Powered by LiveKit</div>
      </footer>
    </>
  );
}