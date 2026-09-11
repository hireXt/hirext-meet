'use client';

import { formatChatMessageLinks, RoomContext } from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  VideoPresets,
  type VideoCodec,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { DebugMode } from '@/lib/Debug';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { MeetingEndedScreen } from '@/lib/ailink/MeetingEndedScreen';
import { AILinkRoom } from '@/lib/ailink/AILinkRoom';
import { CustomMediaGate, type MediaGateResult } from '@/lib/ailink/CustomMediaGate';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';

export function VideoConferenceClientImpl(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
  singlePeerConnection: boolean | undefined;
  museTalkEnabled?: boolean;
}) {
  const keyProvider = new ExternalE2EEKeyProvider();
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = useState(false);

  // Gate: nothing connects until the user passes the mandatory device check.
  // `gate` holds the user's name + device ids + tracks acquired in the click.
  const [gate, setGate] = useState<MediaGateResult | null>(null);
  const [gateError, setGateError] = useState<Error | null>(null);
  const [connectError, setConnectError] = useState<Error | null>(null);

  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec: props.codec,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
      singlePeerConnection: props.singlePeerConnection,
    };
  }, [e2eeEnabled, props.codec, keyProvider, worker]);

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  useEffect(() => {
    if (e2eeEnabled) {
      keyProvider.setKey(e2eePassphrase).then(() => {
        room.setE2EEEnabled(true).then(() => {
          setE2eeSetupComplete(true);
        });
      });
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, e2eePassphrase, keyProvider, room, setE2eeSetupComplete]);

  useEffect(() => {
    // Wait for the mandatory device gate AND e2ee setup before connecting.
    if (!gate || !e2eeSetupComplete) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await room.connect(props.liveKitUrl, props.token, connectOptions);
        if (cancelled) return;
        // Publish the gate-acquired tracks immediately — these were created
        // inside the user's "Check devices & join" click, so they carry real
        // permission grants (unlike a mount-time enableCameraAndMicrophone).
        for (const track of gate.previewTracks) {
          if (cancelled) break;
          await room.localParticipant.publishTrack(track);
        }
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(err);
        setConnectError(err);
        // Release the gate tracks: nothing was published, don't leak devices.
        gate.previewTracks.forEach((t) => t.stop());
        toast.error(
          'Could not join the meeting. Check your connection and try again.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, e2eeSetupComplete, room, props.liveKitUrl, props.token]);

  useLowCPUOptimizer(room);

  // After Leave (or a dropped call) show the meeting-ended screen instead of
  // navigating straight home. The room is fully disconnected at this point, so
  // every LiveKit component inside AILinkRoom settles; unmounting the whole
  // conference avoids the "Connecting… forever" trap when a dead room was kept
  // mounted.
  const router = useRouter();
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const onDisconnected = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
      setEnded(true);
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);

  if (ended) {
    return <MeetingEndedScreen />;
  }

  // Mandatory gate screen: user must pass camera+mic check before connecting.
  if (!gate) {
    return (
      <main style={{ height: '100%', position: 'relative' }}>
        <CustomMediaGate
          onReady={(result) => {
            setGateError(null);
            setConnectError(null);
            setGate(result);
          }}
          onError={(error) => setGateError(error)}
        />
        {(gateError || connectError) && (
          <p className="ail-gate-toast-hint" role="alert">
            {(connectError ?? gateError)?.message}
          </p>
        )}
      </main>
    );
  }

  return (
    <div className="lk-room-container" style={{ height: '100%' }}>
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        <AILinkRoom
          chatMessageFormatter={formatChatMessageLinks}
          SettingsComponent={
            process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU === 'true' ? SettingsMenu : undefined
          }
          museTalkEnabled={props.museTalkEnabled}
        />
        <DebugMode logLevel={LogLevel.debug} />
      </RoomContext.Provider>
    </div>
  );
}
