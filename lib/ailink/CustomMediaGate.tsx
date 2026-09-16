'use client';

import * as React from 'react';
import {
  LocalUserChoices,
  MediaDeviceMenu,
} from '@livekit/components-react';
import { createLocalTracks } from 'livekit-client';
import toast from 'react-hot-toast';
import { CameraIcon, GoogleMeetLogo, MicIcon, ShieldCheckIcon } from './icons';
import { BrandLogo } from './BrandLogo';
import { GoogleMeetGreenRoom } from './GoogleMeetGreenRoom';

export interface MediaGateResult extends LocalUserChoices {
  /** Tracks acquired in the click gesture (caller stops them on join/fail). */
  previewTracks: Awaited<ReturnType<typeof createLocalTracks>>;
}

/**
 * Mandatory pre-join gate for custom-server rooms (`/custom`).
 *
 * `room.localParticipant.enableCameraAndMicrophone()` on page load fails
 * silently — getUserMedia needs a user gesture (Chrome/Safari) and autoplay
 * policy blocks it on mount. So connection AND media move behind one click:
 * "Check devices & join". No continue-without-media path: cam+mic mandatory.
 */
export function CustomMediaGate(props: {
  onReady: (result: MediaGateResult) => void;
  onError?: (error: Error) => void;
}) {
  const [phase, setPhase] = React.useState<'checking' | 'ready' | 'joining' | 'failed'>('checking');
  const [fatal, setFatal] = React.useState<Error | null>(null);

  const fail = React.useCallback(
    (error: Error) => {
      setFatal(error);
      setPhase('failed');
      props.onError?.(error);
    },
    [props],
  );

  // STEP 1 — inventory: enumerate kinds first so a missing device fails fast
  // with a clear message instead of a cryptic getUserMedia error later.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          throw new Error('This browser does not support media devices.');
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some((d) => d.kind === 'videoinput');
        const hasMic = devices.some((d) => d.kind === 'audioinput');
        if (cancelled) return;
        if (!hasCamera || !hasMic) {
          const missing =
            !hasCamera && !hasMic
              ? 'camera and microphone'
              : !hasCamera
                ? 'camera'
                : 'microphone';
          throw new Error(`No ${missing} detected. Connect one and reload the page.`);
        }
        setPhase('ready');
      } catch (error) {
        if (!cancelled) fail(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fail]);

  // STEP 2 — live preview via PreJoin (camera tile + mic + device pickers),
  // then on Join acquire real publishable tracks with createLocalTracks —
  // inside the click gesture, so getUserMedia is allowed.
  const handleSubmit = React.useCallback(
    async (values: LocalUserChoices) => {
      // Release the lobby preview BEFORE acquiring our own tracks. The preview
      // holds the very same camera through usePreviewTracks, and requesting a
      // second stream while it is still open makes some browsers/drivers hand
      // back a stream that stops producing frames as soon as the first one
      // closes — the classic "camera light on, self-view black" in the meeting.
      // Switching phase unmounts the preview, which frees the device.
      setPhase('joining');
      await new Promise((resolve) => setTimeout(resolve, 60));

      let tracks: MediaGateResult['previewTracks'] | undefined;
      try {
        tracks = await createLocalTracks({
          audio: { deviceId: values.audioDeviceId || undefined },
          video: { deviceId: values.videoDeviceId || undefined },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        toast.error(
          err.name === 'NotAllowedError'
            ? 'Camera and microphone access was blocked. Allow access in the browser prompt, then try again.'
            : `Could not start camera and microphone: ${err.message}`,
        );
        props.onError?.(err);
        return;
      }
      props.onReady({ ...values, videoEnabled: true, audioEnabled: true, previewTracks: tracks });
    },
    [props],
  );

  if (phase === 'checking') {
    return (
      <div className="ail-gate" role="status" aria-live="polite">
        <div className="ail-gate-card">
          <span className="ail-spinner" aria-hidden="true" />
          <h1 className="ail-gate-title">Checking your devices…</h1>
          <p className="ail-gate-sub">Looking for your camera and microphone.</p>
        </div>
      </div>
    );
  }

  if (phase === 'joining') {
    return (
      <div className="ail-gate" role="status" aria-live="polite">
        <div className="ail-gate-card">
          <span className="ail-spinner" aria-hidden="true" />
          <h1 className="ail-gate-title">Joining the interview…</h1>
          <p className="ail-gate-sub">Starting your camera and microphone.</p>
        </div>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="ail-gate" role="alert">
        <div className="ail-gate-card ail-gate-card--error">
          <h1 className="ail-gate-title">Camera or microphone unavailable</h1>
          <p className="ail-gate-sub">{fatal?.message ?? 'Media devices could not be accessed.'}</p>
          <ul className="ail-gate-list">
            <li>Check that a camera and microphone are connected and switched on.</li>
            <li>Allow this site to use them in the browser prompt.</li>
            <li>Close other apps (Zoom, Meet, Teams) holding the devices.</li>
          </ul>
          <button type="button" className="ail-gate-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ail-prejoin-page">
      <header className="ail-prejoin-nav">
        <div title="meeXt">
          <BrandLogo theme="light" size={36} />
        </div>
        <div className="ail-prejoin-nav-right">
          <div className="ail-gate-badges" style={{ margin: 0 }}>
            <span className="ail-gate-badge">
              <CameraIcon size={13} /> Camera required
            </span>
            <span className="ail-gate-badge">
              <MicIcon size={13} /> Microphone required
            </span>
          </div>
        </div>
      </header>

      <main className="ail-prejoin-main">
        <GoogleMeetGreenRoom
          roomName="meeXt AI Interview"
          defaultUsername=""
          defaultVideoEnabled={true}
          defaultAudioEnabled={true}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}

/** In-room device pickers for the settings panel after the gate passes. */
export function CustomDevicePickers() {
  return (
    <div className="ail-gate-pickers">
      <label className="ail-gate-picker-label">
        Camera
        <MediaDeviceMenu kind="videoinput" />
      </label>
      <label className="ail-gate-picker-label">
        Microphone
        <MediaDeviceMenu kind="audioinput" />
      </label>
    </div>
  );
}
