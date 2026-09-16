'use client';

import React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { LocalUserChoices } from '@livekit/components-react';
import { ConferenceShell, fetchConnectionDetailsWithRetry } from '@/lib/ailink/ConferenceShell';
import { createLocalTracks } from 'livekit-client';
import { ConnectionDetails } from '@/lib/types';
import { GoogleMeetGreenRoom } from '@/lib/ailink/GoogleMeetGreenRoom';
import { BrandLogo } from '@/lib/ailink/BrandLogo';
import { decodeTokenMetadata } from '@/lib/client-utils';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: import('livekit-client').VideoCodec;
  singlePeerConnection: boolean;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  const [preAcquiredTracks, setPreAcquiredTracks] = React.useState<Awaited<ReturnType<typeof createLocalTracks>> | undefined>(
    undefined,
  );
  const [continueWithoutMedia, setContinueWithoutMedia] = React.useState(false);
  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: !continueWithoutMedia,
      audioEnabled: !continueWithoutMedia,
    };
  }, [continueWithoutMedia]);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );
  const [mintState, setMintState] = React.useState<'idle' | 'minting' | 'failed'>('idle');
  const [mintError, setMintError] = React.useState<Error | null>(null);
  const [currentTime, setCurrentTime] = React.useState('');

React.useEffect(() => {
    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      setCurrentTime(`${timeStr} • ${dateStr}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Clean up pre-acquired tracks on unmount or when they change
  React.useEffect(() => {
    return () => {
      preAcquiredTracks?.forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    };
  }, [preAcquiredTracks]);

  const handlePreJoinSubmit = React.useCallback(
    async (values: LocalUserChoices) => {
      setMintState('minting');
      setMintError(null);

      // The lobby already acquired + verified the join tracks INSIDE the Join
      // click (after fully releasing its preview stream). Use them directly —
      // creating a second stream here would reintroduce the exact race that
      // left "camera ON, tile black" on multi-device Macs.
      type JoinTracks = Awaited<ReturnType<typeof createLocalTracks>>;
      const tracks = (values as unknown as { joinTracks?: JoinTracks }).joinTracks;
      const needsTracks = values.audioEnabled || values.videoEnabled;
      if (needsTracks && !tracks?.length) {
        const err = new Error('Camera/mic setup did not complete. Please click Join again.');
        console.error(err);
        setMintError(err);
        setMintState('failed');
        toast.error(err.message);
        return;
      }

      try {
        const data = await fetchConnectionDetailsWithRetry(CONN_DETAILS_ENDPOINT, {
          roomName: props.roomName,
          participantName: values.username,
          region: props.region,
        });
        setPreJoinChoices(values);
        setPreAcquiredTracks(tracks);
        setConnectionDetails(data);
        setMintState('idle');
      } catch (error) {
        // Clean up tracks if connection fails
        tracks?.forEach((t) => t.stop());
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(err);
        setMintError(err);
        setMintState('failed');
        toast.error("Couldn't start the meeting. Check your connection and try again.");
      }
    },
    [props.roomName, props.region, props.hq],
  );
  const handlePreJoinError = React.useCallback((e: Error) => {
    console.error(e);
    toast.error(e.message);
  }, []);

  const handleContinueWithoutMedia = React.useCallback(() => {
    setContinueWithoutMedia(true);
  }, []);

  const joinWithoutMedia = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const username = String(formData.get('username') || '').trim();
      handlePreJoinSubmit({
        username,
        videoEnabled: false,
        audioEnabled: false,
        videoDeviceId: '',
        audioDeviceId: '',
      });
    },
    [handlePreJoinSubmit],
  );

  const retryMint = React.useCallback(() => {
    setMintState('idle');
    setMintError(null);
    // Clean up any previously acquired tracks on retry
    // Note: tracks are stored in state but we can't access them here directly
    // They will be cleaned up when new tracks are acquired or on unmount
  }, []);

  // Joined: hand off to the shared shell (same component custom uses).
  if (connectionDetails && preJoinChoices) {
    const meta = decodeTokenMetadata(connectionDetails.participantToken);
    return (
      <main style={{ height: '100%', position: 'relative' }}>
        <ConferenceShell
          serverUrl={connectionDetails.serverUrl}
          token={connectionDetails.participantToken}
          userChoices={preJoinChoices}
          preAcquiredTracks={preAcquiredTracks}
          hq={props.hq}
          codec={props.codec}
          singlePeerConnection={props.singlePeerConnection}
          museTalkEnabled={meta?.museTalkEnabled === true}
          recordingEnabled={meta?.recording === true}
          label="meeXt"
        />
      </main>
    );
  }

  const copyLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Meeting link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };


  return (
    <div className="ail-prejoin-page">
      <header className="ail-prejoin-nav">
        <Link href="/" title="meeXt Home" style={{ textDecoration: 'none' }}>
          <BrandLogo theme="light" size={36} />
        </Link>
        <div className="ail-prejoin-nav-right">
          {currentTime && <span className="ail-prejoin-clock">{currentTime}</span>}
          <div className="ail-prejoin-code-pill" onClick={copyLink} title="Click to copy meeting link">
            <span>{props.roomName.toUpperCase()}</span>
            <span style={{ fontSize: '11.5px', color: '#1a73e8', fontWeight: 600 }}>Copy link</span>
          </div>
          <div className="ail-avatar" style={{ width: 34, height: 34, fontSize: '12px' }}>
            HX
          </div>
        </div>
      </header>

      <main className="ail-prejoin-main">
        {mintState === 'minting' ? (
          <div className="ail-gate" role="status" aria-live="polite">
            <div className="ail-gate-card">
              <span className="ail-spinner" aria-hidden="true" />
              <h1 className="ail-gate-title">Starting your meeting…</h1>
              <p className="ail-gate-sub">Reserving your seat in the room.</p>
            </div>
          </div>
        ) : mintState === 'failed' ? (
          <div className="ail-gate" role="alert">
            <div className="ail-gate-card ail-gate-card--error">
              <h1 className="ail-gate-title">Couldn&apos;t start the meeting</h1>
              <p className="ail-gate-sub">{mintError?.message ?? 'Mint failed.'}</p>
              <button type="button" className="ail-gate-primary" onClick={retryMint}>
                Try again
              </button>
            </div>
          </div>
        ) : continueWithoutMedia ? (
          <form onSubmit={joinWithoutMedia} className="ail-gate-card ail-join-without-media">
            <h1 className="ail-gate-title">Join without camera/mic</h1>
            <p className="ail-gate-sub">
              You can watch, share your screen, and chat. Add a camera and mic anytime.
            </p>
            <input
              name="username"
              required
              placeholder="Your name"
              aria-label="Your name"
              className="ail-gate-input"
            />
            <button type="submit" className="ail-gate-primary">
              Join meeting
            </button>
          </form>
        ) : (
          <GoogleMeetGreenRoom
            roomName={props.roomName}
            defaultUsername=""
            defaultVideoEnabled={!continueWithoutMedia}
            defaultAudioEnabled={!continueWithoutMedia}
            onSubmit={handlePreJoinSubmit}
            onContinueWithoutMedia={handleContinueWithoutMedia}
          />
        )}
      </main>
    </div>
  );
}
