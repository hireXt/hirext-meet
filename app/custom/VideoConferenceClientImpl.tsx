'use client';

import { useState } from 'react';
import type { VideoCodec } from 'livekit-client';
import { ConferenceShell } from '@/lib/ailink/ConferenceShell';
import { CustomMediaGate, type MediaGateResult } from '@/lib/ailink/CustomMediaGate';

export function VideoConferenceClientImpl(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
  singlePeerConnection: boolean | undefined;
  museTalkEnabled?: boolean;
  recordingEnabled?: boolean;
  resultBase?: string;
}) {
  // Gate: nothing connects until the user passes the mandatory device check.
  // `gate` holds the user's name + device ids + tracks acquired in the click.
  const [gate, setGate] = useState<MediaGateResult | null>(null);
  const [gateError, setGateError] = useState<Error | null>(null);

  // Mandatory gate screen: user must pass camera+mic check before connecting.
  if (!gate) {
    return (
      <main style={{ height: '100%', position: 'relative' }}>
        <CustomMediaGate
          onReady={(result) => {
            setGateError(null);
            setGate(result);
          }}
          onError={(error) => setGateError(error)}
        />
        {gateError && (
          <p className="ail-gate-toast-hint" role="alert">
            {gateError.message}
          </p>
        )}
      </main>
    );
  }

  return (
    <ConferenceShell
      serverUrl={props.liveKitUrl}
      token={props.token}
      userChoices={{
        username: gate.username,
        videoEnabled: true,
        audioEnabled: true,
        videoDeviceId: gate.videoDeviceId,
        audioDeviceId: gate.audioDeviceId,
      }}
      preAcquiredTracks={gate.previewTracks}
      hq={false}
      codec={props.codec}
      singlePeerConnection={props.singlePeerConnection}
      museTalkEnabled={props.museTalkEnabled}
      recordingEnabled={props.recordingEnabled}
      resultBase={props.resultBase}
      label="meetXt"
    />
  );
}
