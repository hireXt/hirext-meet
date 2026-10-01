'use client';

import * as React from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useRoomContext,
  useTracks,
  useTranscriptions,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { AnimatePresence, motion } from 'framer-motion';
import { CustomMediaGate, type MediaGateResult } from '@/lib/ailink/CustomMediaGate';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { WavyBackground } from '@/components/ui/wavy-background';
import { SparklesCore } from '@/components/ui/sparkles';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import './tailwind.css';

type Props = {
  liveKitUrl: string;
  token: string;
  candidateName?: string;
  isNameFixed?: boolean;
  resultBase?: string;
};

// The avatar joins as its OWN participant (not the agents worker), so its audio
// and the intro-clip video are found by identity, not via useVoiceAssistant().
const ECO_IDENTITY = 'eco-avatar';

const EASE = [0.22, 1, 0.36, 1] as const;

const I = {
  mic: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-4 4.9V20h3v1H8v-1h3v-3.1A5 5 0 0 1 7 12h2a3 3 0 0 0 6 0h2Z" />,
  micOff: <path d="M3.3 2.3 2 3.6 8 9.6V12a4 4 0 0 0 5.8 3.6l1.2 1.2A6 6 0 0 1 6 12H4a8 8 0 0 0 7 7.9V22H8v1h8v-1h-3v-2.1c.9-.1 1.8-.4 2.5-.9l3.4 3.4 1.3-1.3L3.3 2.3ZM16 12a4 4 0 0 0-.2-1.2l-1.6-1.6c0 .3.1.6.1.9v.1a2.4 2.4 0 0 1-2.7 2.4l1.3 1.3c.1 0 .2 0 .3 0A4 4 0 0 0 16 12Zm4 0h-2a5.9 5.9 0 0 1-1.2 3.6l1.5 1.5A7.9 7.9 0 0 0 20 12Z" />,
  cam: <path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
  camOff: <path d="M3.3 2.3 2 3.6l2.4 2.4H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10c.5 0 1-.2 1.4-.5l3.3 3.3 1.3-1.3L3.3 2.3ZM14 10.5l4-2.5v7l-2.5-1.6L14 12v-1.5Zm-2 5.1L6 9.6V15c0 .6.4 1 1 1h5Z" />,
  share: <path d="M12 3 7 8h3v4h4V8h3l-5-5ZM5 14h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Z" />,
  leave: <path d="M2 4h9v16H2V4Zm12.6 3.4L13.2 8.8 15.4 11H8v2h7.4l-2.2 2.2 1.4 1.4L20 12l-5.4-4.6Z" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px] shrink-0">
      {d}
    </svg>
  );
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function EcoInterviewRoom({
  candidateName,
  resultBase,
  previewTracks,
}: {
  candidateName: string;
  resultBase?: string;
  previewTracks: MediaGateResult['previewTracks'];
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const connection = useConnectionState();
  const transcriptions = useTranscriptions();
  const publishedRef = React.useRef(false);

  // All local + remote mic/camera tracks; pick the avatar's by identity.
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Camera],
    { onlySubscribed: false },
  );
  const env = (t: TrackReferenceOrPlaceholder) => t.participant?.identity === ECO_IDENTITY;
  const ecoAudio = tracks.find((t) => env(t) && t.source === Track.Source.Microphone);
  const ecoVideo = tracks.find((t) => env(t) && t.source === Track.Source.Camera);
  const localCam = tracks.find((t) => t.participant?.isLocal && t.source === Track.Source.Camera);

  const bands = useMultibandTrackVolume(ecoAudio, { bands: 4, updateInterval: 60 });
  const energy = bands.reduce((a, b) => a + b, 0) / 4;

  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;
    previewTracks.forEach((t) => { room.localParticipant.publishTrack(t).catch(() => {}); });
  }, [connection, previewTracks, room]);

  const [seconds, setSeconds] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const hasConnected = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (connection === ConnectionState.Connected) hasConnected.current = true;
    else if (connection === ConnectionState.Disconnected && hasConnected.current) setEnded(true);
  }, [connection]);

  const showVideo = !!ecoVideo;
  const speaking = energy > 0.04;
  const statusWord = speaking ? 'Speaking' : connection === ConnectionState.Connected ? 'Listening' : 'Connecting';

  const lines = (transcriptions as any[])
    .map((t) => ({
      text: String(t?.text ?? '').trim(),
      identity: String(t?.participantInfo?.identity ?? t?.participantIdentity ?? ''),
    }))
    .filter((l) => l.text);
  const isEco = (id: string) => id === ECO_IDENTITY || id.startsWith('agent');

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch { /* cancelled */ }
  };

  if (ended) {
    return (
      <div className="relative isolate flex h-[100dvh] flex-col overflow-hidden bg-black text-eco-fg">
        <BackgroundBeams />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <motion.div
            className="flex flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex items-center gap-2.5 text-xl font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-eco-accent shadow-[0_0_0_4px_rgba(46,230,166,0.14),0_0_18px_rgba(46,230,166,0.6)]" />
              Eco
            </div>
            <h2 className="m-0 text-[22px]">Interview complete</h2>
            <p className="m-0 text-eco-muted">Thanks, {candidateName}. You can close this tab.</p>
            {resultBase && (
              <a
                className="inline-flex items-center gap-2 rounded-xl border border-eco-border bg-eco-surface px-4 py-2.5 text-sm font-medium text-eco-fg transition-colors hover:bg-eco-surface-2"
                href={resultBase}
                target="_blank"
                rel="noreferrer"
              >
                View your report
              </a>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex h-[100dvh] flex-col overflow-hidden bg-black font-sans text-eco-fg antialiased">
      {/* Ambient beams sit behind the whole screen */}
      <BackgroundBeams />

      <header className="relative z-10 flex shrink-0 items-center gap-3.5 px-6 py-3.5">
        <div className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-eco-accent shadow-[0_0_0_4px_rgba(46,230,166,0.14),0_0_18px_rgba(46,230,166,0.6)]" />
          Eco <span className="font-medium text-eco-muted">· AI Interview</span>
        </div>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-2 rounded-full border border-eco-border bg-eco-surface px-3 py-1.5 text-[12.5px] text-eco-muted">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-eco-accent" />
          <b className="font-semibold text-eco-fg">{statusWord}</b>
        </div>
        <div className="rounded-full border border-eco-border bg-eco-surface px-3 py-1.5 text-[13px] tabular-nums text-eco-muted">
          {fmt(seconds)}
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 px-6 pt-2">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid shrink-0 grid-cols-2 gap-4">
            <div className="relative flex aspect-video w-full max-h-[42vh] items-center justify-center overflow-hidden rounded-[28px] border border-eco-border bg-[#05070a]">
              <AnimatePresence mode="wait" initial={false}>
                {showVideo ? (
                  <motion.div
                    key="video"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 1.03 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    <VideoTrack trackRef={ecoVideo!} />
                  </motion.div>
                ) : (
                  /* Wavy background stands in for the blob while video is off */
                  <motion.div
                    key="wave"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.6, ease: EASE }}
                  >
                    <WavyBackground
                      blur={14}
                      waveWidth={40}
                      waveOpacity={0.34}
                      speed="fast"
                      backgroundFill="#05070a"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="absolute bottom-3 left-3 z-20 rounded-full border border-eco-border bg-black/55 px-3 py-1.5 text-xs text-[#dfe5ec] backdrop-blur-md">
                Eco
              </span>
            </div>

            <div className="relative flex aspect-video w-full max-h-[42vh] items-center justify-center overflow-hidden rounded-[28px] border border-eco-border bg-[#0b0e11]">
              <AnimatePresence mode="wait" initial={false}>
                {localCam ? (
                  <motion.div
                    key="you"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <VideoTrack trackRef={localCam} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="off"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span className="text-[13px] text-eco-faint">Camera off</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="absolute bottom-3 left-3 z-20 rounded-full border border-eco-border bg-black/55 px-3 py-1.5 text-xs text-[#dfe5ec] backdrop-blur-md">
                You
              </span>
            </div>
          </div>

          {/* Transcript — sparkles on each Eco turn, word-by-word reveal */}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto py-1.5">
            {lines.length === 0 ? (
              <div className="text-sm text-eco-faint">The conversation will appear here as you speak.</div>
            ) : (
              <AnimatePresence initial={false}>
                {lines.map((l, i) => (
                  <motion.div
                    key={`${l.identity}-${i}`}
                    layout
                    className={`flex max-w-[620px] gap-2.5 ${isEco(l.identity) ? '' : 'ml-14 max-w-[540px]'}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    {isEco(l.identity) && (
                      <span className="relative mt-0.5 h-6 w-6 shrink-0 overflow-visible">
                        <SparklesCore
                          background="transparent"
                          minSize={0.6}
                          maxSize={1.8}
                          particleCount={14}
                          particleColor="#5cf5bd"
                          speed={4}
                          className="h-full w-full"
                        />
                      </span>
                    )}
                    <TextGenerateEffect
                      words={l.text}
                      staggerDelay={0.04}
                      className={
                        isEco(l.identity)
                          ? 'text-[15px] leading-relaxed text-[#e7ecf2]'
                          : 'rounded-2xl border border-eco-border bg-eco-surface-2 px-3.5 py-2.5 text-[15px] leading-relaxed text-[#cfd6e0]'
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {!sharing && (
          <motion.div
            className="relative z-10 mx-6 flex shrink-0 items-center gap-2.5 rounded-xl border border-eco-accent/30 bg-gradient-to-b from-eco-accent/10 to-eco-accent/[0.03] px-3.5 py-2.5 text-[13px] text-[#dfe6ee]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Icon d={I.share} />
            <span>
              <b className="font-semibold text-eco-accent">Share your screen when you&rsquo;re ready.</b>{' '}
              <span className="text-eco-muted">Whole screen or a single window — you can start any time.</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex shrink-0 items-center justify-center gap-2.5 px-6 pb-5 pt-4">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium transition-colors ${
            isMicrophoneEnabled
              ? 'border-eco-border bg-eco-surface text-eco-fg hover:bg-eco-surface-2'
              : 'border-eco-danger/35 bg-eco-danger/10 text-eco-danger'
          }`}
        >
          <Icon d={isMicrophoneEnabled ? I.mic : I.micOff} />
          {isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium transition-colors ${
            isCameraEnabled
              ? 'border-eco-border bg-eco-surface text-eco-fg hover:bg-eco-surface-2'
              : 'border-eco-danger/35 bg-eco-danger/10 text-eco-danger'
          }`}
        >
          <Icon d={isCameraEnabled ? I.cam : I.camOff} />
          {isCameraEnabled ? 'Camera on' : 'Camera off'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={toggleShare}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
            sharing
              ? 'border-transparent bg-gradient-to-b from-eco-accent to-[#17c98d] text-[#04120c]'
              : 'border-eco-border bg-eco-surface text-eco-fg hover:bg-eco-surface-2'
          }`}
        >
          <Icon d={I.share} />
          {sharing ? 'Sharing screen' : 'Share screen'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => room.disconnect()}
          className="inline-flex items-center gap-2 rounded-xl border border-eco-danger/40 bg-eco-danger/10 px-4 py-2.5 text-[13.5px] font-medium text-[#ffb4b4] transition-colors hover:bg-eco-danger/20"
        >
          <Icon d={I.leave} />
          Leave
        </motion.button>
      </div>
    </div>
  );
}

export function EcoInterview(props: Props) {
  const [gate, setGate] = React.useState<MediaGateResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  if (!gate) {
    return (
      <div className="relative isolate flex h-[100dvh] flex-col overflow-hidden bg-black text-eco-fg">
        <BackgroundBeams />
        <div className="relative z-10 flex flex-1 flex-col">
          <CustomMediaGate
            defaultUsername={props.candidateName}
            isNameFixed={props.isNameFixed}
            onReady={(r) => { setError(null); setGate(r); }}
            onError={setError}
          />
          {error && <div className="px-5 text-eco-muted">Camera & microphone are required to start.</div>}
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom token={props.token} serverUrl={props.liveKitUrl} connect audio={false} video={false}>
      <RoomAudioRenderer />
      <EcoInterviewRoom
        candidateName={gate.username || props.candidateName || 'there'}
        resultBase={props.resultBase}
        previewTracks={gate.previewTracks}
      />
    </LiveKitRoom>
  );
}
