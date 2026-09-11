'use client';

import * as React from 'react';
import {
  formatChatMessageLinks,
  LocalUserChoices,
  RoomContext,
} from '@livekit/components-react';
import {
  ConnectionError,
  ConnectionErrorReason,
  createLocalTracks,
  DeviceUnsupportedError,
  ExternalE2EEKeyProvider,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoCodec,
  VideoPresets,
} from 'livekit-client';
import toast from 'react-hot-toast';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { AILinkRoom } from '@/lib/ailink/AILinkRoom';
import { MeetingEndedScreen } from '@/lib/ailink/MeetingEndedScreen';
import { MeetingErrorBoundary } from '@/lib/MeetingErrorBoundary';
import { decodePassphrase } from '@/lib/client-utils';
import { ConnectionDetails } from '@/lib/types';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerformanceOptimizer';

const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export type ConferenceEndReason = 'left' | 'dropped' | 'error';

export interface ConferenceShellProps {
  serverUrl: string;
  token: string;
  userChoices: LocalUserChoices;
  /** Pre-acquired publishable tracks (custom gate) — published right after connect. */
  preAcquiredTracks?: Awaited<ReturnType<typeof createLocalTracks>>;
  hq: boolean;
  codec: VideoCodec | undefined;
  singlePeerConnection: boolean | undefined;
  museTalkEnabled?: boolean;
  label?: string;
  onLeave?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Single conference shell for BOTH room paths (standard + custom).
 * Owns: E2EE setup, Room lifecycle (memo keyed on options), connect +
 * publish, toast-based errors (never alert), ended-screen with
 * leave-vs-drop distinction, and track cleanup on unmount.
 */
export function ConferenceShell(props: ConferenceShellProps) {  const keyProvider = React.useMemo(() => new ExternalE2EEKeyProvider(), []);
  const e2eeHash = typeof window !== 'undefined' ? window.location.hash.substring(1) : '';
  const { worker, e2eePassphrase, e2eeError } = useSetupE2EE(e2eeHash || undefined);
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);
  const [connectState, setConnectState] = React.useState<'connecting' | 'live' | 'failed'>(
    'connecting',
  );
  const [endReason, setEndReason] = React.useState<ConferenceEndReason | null>(null);
  const [fatalError, setFatalError] = React.useState<Error | null>(null);

  // Room memo keyed on options (A.6 fix): hq/codec changes recreate the room
  // instead of being silently ignored. Callers treat them as pre-join-only;
  // this is the safety net.
  const optionsKey = `${props.hq}:${props.codec ?? 'default'}:${props.singlePeerConnection}`;
  const roomOptions = React.useMemo((): RoomOptions => {
    const videoCodec: VideoCodec | undefined =
      e2eeEnabled && (props.codec === 'av1' || props.codec === 'vp9') ? undefined : props.codec;
    const videoCaptureDefaults: VideoCaptureOptions = {
      deviceId: props.userChoices.videoDeviceId || undefined,
      resolution: props.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };
    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      videoSimulcastLayers: props.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
      red: !e2eeEnabled,
      videoCodec,
    };
    return {
      videoCaptureDefaults,
      publishDefaults,
      audioCaptureDefaults: { deviceId: props.userChoices.audioDeviceId || undefined },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled ? { keyProvider, worker } : undefined,
      singlePeerConnection: props.singlePeerConnection,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, e2eeEnabled, props.userChoices.videoDeviceId, props.userChoices.audioDeviceId]);

  const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);
  const connectOptions = React.useMemo((): RoomConnectOptions => ({ autoSubscribe: true }), []);
  const reportError = React.useCallback(
    (error: Error) => {
      props.onError?.(error);
    },
    [props],
  );

  // E2EE setup (toast, never alert).
  React.useEffect(() => {
    if (!e2eeEnabled) {
      setE2eeSetupComplete(true);
      return;
    }
    let cancelled = false;
    keyProvider
      .setKey(decodePassphrase(e2eePassphrase!))
      .then(() =>
        room.setE2EEEnabled(true).catch((e) => {
          if (e instanceof DeviceUnsupportedError) {
            throw new Error(
              'Encrypted meeting, but your browser does not support it. Update and try again.',
            );
          }
          throw e;
        }),
      )
      .then(() => {
        if (!cancelled) setE2eeSetupComplete(true);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        console.error(error);
        setFatalError(error);
        setEndReason('error');
        toast.error(error.message);
        reportError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [e2eeEnabled, e2eePassphrase, keyProvider, room, reportError]);

  // Surface worker-creation failure as a toast (never silent, never alert).
  React.useEffect(() => {
    if (e2eeError) {
      toast.error('Encrypted meeting setup failed. You joined without encryption.');
      reportError(e2eeError);
    }
  }, [e2eeError, reportError]);
  // Connect + publish. Gate tracks (custom) publish immediately; standard
  // path enables camera/mic per userChoices.
  React.useEffect(() => {
    if (!e2eeSetupComplete || endReason) return;
    let cancelled = false;
    (async () => {
      try {
        await room.connect(props.serverUrl, props.token, connectOptions);
        if (cancelled) return;
        if (props.preAcquiredTracks?.length) {
          for (const track of props.preAcquiredTracks) {
            if (cancelled) break;
            try {
              await room.localParticipant.publishTrack(track);
            } catch (publishErr) {
              console.warn('Could not publish pre-acquired track:', publishErr);
            }
          }
        } else {
          if (props.userChoices.videoEnabled) {
            try {
              await room.localParticipant.setCameraEnabled(true);
            } catch (camErr) {
              console.warn('Camera could not be enabled on join (device may be disconnected or in use):', camErr);
              toast('Camera not detected. Joined with audio only.');
            }
          }
          if (cancelled) return;
          if (props.userChoices.audioEnabled) {
            try {
              await room.localParticipant.setMicrophoneEnabled(true);
            } catch (micErr) {
              console.warn('Microphone could not be enabled on join (device may be disconnected or in use):', micErr);
              toast('Microphone not detected. Joined in listen-only mode.');
            }
          }
          if (cancelled) return;
          const speakerToUse =
            (props.userChoices as unknown as { speakerDeviceId?: string }).speakerDeviceId ||
            (typeof window !== 'undefined' ? localStorage.getItem('hx_meet_speaker_id') : undefined);
          if (speakerToUse && speakerToUse !== 'default') {
            try {
              await room.switchActiveDevice('audiooutput', speakerToUse);
            } catch (spkErr) {
              console.warn('Could not set initial speaker output device:', spkErr);
            }
          }
        }
        if (!cancelled) setConnectState('live');
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        if (err instanceof ConnectionError && err.reason === ConnectionErrorReason.Cancelled) {
          console.warn('Connection cancelled (expected during leave/reload).');
          return;
        }
        console.error(err);
        props.preAcquiredTracks?.forEach((t) => t.stop());
        setFatalError(err);
        setConnectState('failed');
        toast.error('Could not join the meeting. Check your connection and try again.');
        reportError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e2eeSetupComplete, room, props.serverUrl, props.token]);
  const lowPowerMode = useLowCPUOptimizer(room);
  React.useEffect(() => {
    if (lowPowerMode) console.warn('Low power mode enabled');
  }, [lowPowerMode]);

  // Disconnect: leave-vs-drop distinction (A.7 fix).
  const userLeftRef = React.useRef(false);
  React.useEffect(() => {
    const onDisconnected = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
      if (userLeftRef.current) {
        setEndReason('left');
      } else if (!fatalError) {
        setEndReason('dropped');
        toast.error('Connection lost. Check your network — you can rejoin.');
      }
    };
    const onEncryptionError = (error: Error) => {
      console.error(error);
      toast.error(`Encryption error: ${error.message}`);
      reportError(error);
    };
    const onMediaError = (error: Error) => {
      console.error(error);
      toast.error(`Media device error: ${error.message}`);
      reportError(error);
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.EncryptionError, onEncryptionError);
    room.on(RoomEvent.MediaDevicesError, onMediaError);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.EncryptionError, onEncryptionError);
      room.off(RoomEvent.MediaDevicesError, onMediaError);
    };
  }, [room, fatalError, reportError]);

  // Full cleanup on unmount: disconnect room, stop gate tracks.
  React.useEffect(() => {
    return () => {
      try {
        room.disconnect();
      } catch {
        /* already disconnected */
      }
      props.preAcquiredTracks?.forEach((t) => {
        try {
          t.stop();
        } catch {
          /* already stopped */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  const handleLeaveClick = React.useCallback(() => {
    userLeftRef.current = true;
    props.onLeave?.();
    room.disconnect();
  }, [room, props]);

  // B.10 fix: one-click rejoin after a drop/error — reset all end state;
  // the room memo re-creates the Room because fatal error paths (D.5 layer)
  // stop its tracks, so a fresh instance is the reliable reconnect.
  const handleRejoin = React.useCallback(() => {
    userLeftRef.current = false;
    setFatalError(null);
    setEndReason(null);
    setConnectState('connecting');
  }, []);

  if (endReason) {
    if (endReason === 'left') return <MeetingEndedScreen />;
    return (
      <MeetingEndedScreen
        title={endReason === 'dropped' ? 'Connection lost' : 'Could not join'}
        message={
          endReason === 'dropped'
            ? 'The connection dropped. Check your network and rejoin the meeting.'
            : (fatalError?.message ?? 'Something went wrong while joining.')
        }
        onRejoin={handleRejoin}
      />
    );
  }

  return (
    <div className="lk-room-container" style={{ height: '100%' }}>
      <RoomContext.Provider value={room}>
        <MeetingErrorBoundary onError={reportError}>
          <KeyboardShortcuts />
          {connectState === 'connecting' && (
            <div className="ail-connecting" role="status" aria-live="polite">
              <span className="ail-spinner" aria-hidden="true" />
              <p>Connecting to the meeting…</p>
            </div>
          )}
          <AILinkRoom
            chatMessageFormatter={formatChatMessageLinks}
            SettingsComponent={SettingsMenu}
            label={props.label ?? 'HireXt Meet'}
            museTalkEnabled={props.museTalkEnabled}
            onLeaveRequest={handleLeaveClick}
          />
          <DebugMode logLevel={LogLevel.debug} />
        </MeetingErrorBoundary>
      </RoomContext.Provider>
    </div>
  );
}

/**
 * Mint connection details with exponential-backoff retry (B.2/E.3 fix).
 * Throws after maxAttempts so callers render explicit error + retry UI.
 */
export async function fetchConnectionDetailsWithRetry(
  endpoint: string,
  params: { roomName: string; participantName: string; region?: string; metadata?: string },
  maxAttempts = 3,
): Promise<ConnectionDetails> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.append('roomName', params.roomName);
  url.searchParams.append('participantName', params.participantName);
  if (params.region) url.searchParams.append('region', params.region);
  if (params.metadata) url.searchParams.append('metadata', params.metadata);
  let lastError: Error = new Error('Mint failed');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`Mint failed: ${resp.status} ${resp.statusText}`);
      return (await resp.json()) as ConnectionDetails;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
