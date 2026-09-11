'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { LocalUserChoices, PreJoin } from '@livekit/components-react';
import { ConferenceShell, fetchConnectionDetailsWithRetry } from '@/lib/ailink/ConferenceShell';
import { ConnectionDetails } from '@/lib/types';
import { MediaDeviceGuard } from '@/lib/MediaDeviceGuard';

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

  const handlePreJoinSubmit = React.useCallback(
    async (values: LocalUserChoices) => {
      setMintState('minting');
      setMintError(null);
      try {
        const data = await fetchConnectionDetailsWithRetry(CONN_DETAILS_ENDPOINT, {
          roomName: props.roomName,
          participantName: values.username,
          region: props.region,
        });
        setPreJoinChoices(values);
        setConnectionDetails(data);
        setMintState('idle');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(err);
        setMintError(err);
        setMintState('failed');
        toast.error("Couldn't start the meeting. Check your connection and try again.");
      }
    },
    [props.roomName, props.region],
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
  }, []);

  // Joined: hand off to the shared shell (same component custom uses).
  if (connectionDetails && preJoinChoices) {
    return (
      <main style={{ height: '100%', position: 'relative' }}>
        <ConferenceShell
          serverUrl={connectionDetails.serverUrl}
          token={connectionDetails.participantToken}
          userChoices={preJoinChoices}
          hq={props.hq}
          codec={props.codec}
          singlePeerConnection={props.singlePeerConnection}
          label="HireXt Meet"
        />
      </main>
    );
  }

  return (
    <main style={{ height: '100%', position: 'relative' }}>
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
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
          <MediaDeviceGuard onContinueWithoutMedia={handleContinueWithoutMedia}>
            <PreJoin
              defaults={preJoinDefaults}
              onSubmit={handlePreJoinSubmit}
              onError={handlePreJoinError}
            />
          </MediaDeviceGuard>
        )}
      </div>
    </main>
  );
}
