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
      <div className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black text-eco-fg p-6">
        <BackgroundBeams />
        <motion.div
          className="relative z-10 flex flex-col items-center gap-6 rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-2 shadow-2xl backdrop-blur-xl max-w-md w-full"
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          {/* Double-bezel inner core */}
          <div className="flex w-full flex-col items-center gap-5 rounded-[calc(2rem-0.5rem)] bg-black/60 px-8 py-10 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-eco-accent shadow-[0_0_12px_#2ee6a6]" />
              Eco
            </div>
            <h2 className="m-0 text-2xl font-bold tracking-tight text-white">Interview complete</h2>
            <p className="m-0 text-sm text-eco-muted leading-relaxed max-w-xs">
              Thank you, {candidateName}. Your session has concluded and you may now close this tab.
            </p>
            {resultBase && (
              <a
                className="mt-1 inline-flex h-11 items-center gap-2.5 rounded-full bg-eco-accent px-7 text-[13px] font-semibold text-neutral-950 shadow-[0_0_20px_rgba(46,230,166,0.3)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_0_32px_rgba(46,230,166,0.5)] active:scale-[0.97]"
                href={resultBase}
                target="_blank"
                rel="noreferrer"
              >
                View your report
              </a>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-black font-sans text-eco-fg antialiased">
      {/* Ambient beams sit behind the whole screen */}
      <BackgroundBeams />

      {/* ── Header ── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 md:px-10 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eco-accent opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-eco-accent shadow-[0_0_10px_#2ee6a6]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Eco</span>
          <span className="text-[10px] font-medium text-white/40 tracking-[0.14em] uppercase px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            AI Interview
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/70">
            <span className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${speaking ? 'bg-eco-accent shadow-[0_0_6px_#2ee6a6]' : 'bg-white/30'}`} />
            {statusWord}
          </div>
          <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium tabular-nums text-white/50">
            {fmt(seconds)}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 md:px-8 pb-2 max-w-7xl mx-auto w-full">
        {/* Video / Avatar Stage */}
        <div className="grid shrink-0 grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* Eco Tile — double-bezel wrapper for both states */}
          <div className="rounded-[1.75rem] border border-white/[0.06] bg-white/[0.03] p-1.5">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              {showVideo ? (
                <>
                  <VideoTrack trackRef={ecoVideo!} />
                </>
              ) : (
                <>
                  {/* Wavy canvas inside the bezel — clipped, not bleeding */}
                  <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)] pointer-events-none">
                    <WavyBackground
                      blur={10}
                      waveWidth={45}
                      waveOpacity={0.5}
                      speed="fast"
                      backgroundFill="transparent"
                      audioEnergy={energy}
                      isSpeaking={speaking}
                    />
                  </div>
                  <div className="relative z-10 flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-black/40 px-4 py-2 text-[11px] font-medium text-white/80 backdrop-blur-md shadow-[0_2px_16px_rgba(0,0,0,0.5)]">
                    <span className={`h-2 w-2 rounded-full transition-all duration-500 ${speaking ? 'bg-eco-accent shadow-[0_0_8px_#2ee6a6]' : 'bg-white/25'}`} />
                    <span>Eco</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/35">{speaking ? 'Speaking' : 'Listening'}</span>
                  </div>
                </>
              )}
              <span className="absolute bottom-3 left-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                Eco
              </span>
            </div>
          </div>

          {/* Candidate Tile — double-bezel */}
          <div className="rounded-[1.75rem] border border-white/[0.06] bg-white/[0.03] p-1.5">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              <AnimatePresence mode="wait" initial={false}>
                {localCam ? (
                  <motion.div
                    key="you"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    <VideoTrack trackRef={localCam} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="off"
                    className="flex flex-col items-center gap-3 text-white/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.06]">
                      <Icon d={I.camOff} />
                    </div>
                    <span className="text-[11px] font-medium tracking-wide">Camera off</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="absolute bottom-3 left-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                You
              </span>
            </div>
          </div>
        </div>

        {/* ── Transcription Area — borderless, transparent, beams show through ── */}
        <div className="relative flex min-h-[140px] flex-1 flex-col overflow-hidden rounded-[1.5rem]">
          {/* Sparkles glow at top edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden z-0">
            <div className="absolute inset-x-16 top-0 mx-auto h-[2px] w-2/3 bg-gradient-to-r from-transparent via-eco-accent/80 to-transparent blur-sm" />
            <div className="absolute inset-x-16 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-eco-accent/60 to-transparent" />
            <div className="absolute inset-x-32 top-0 mx-auto h-[3px] w-1/4 bg-gradient-to-r from-transparent via-eco-teal/70 to-transparent blur-sm" />

            <SparklesCore
              background="transparent"
              minSize={0.3}
              maxSize={1}
              particleDensity={250}
              className="h-full w-full"
              particleColor="#5cf5bd"
            />
          </div>

          {/* Scroll area */}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 md:px-6 py-4">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center gap-1">
                <span className="text-[10px] uppercase tracking-[0.2em] text-eco-muted/50 font-semibold">Live Transcription</span>
                <p className="text-[11px] text-eco-faint/60">The conversation will appear here as you speak</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {lines.map((l, i) => (
                  <motion.div
                    key={`${l.identity}-${i}`}
                    layout
                    className={`flex max-w-[620px] items-start gap-2.5 ${isEco(l.identity) ? '' : 'ml-auto justify-end'}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    {isEco(l.identity) && (
                      <span className="relative mt-1 h-4 w-4 shrink-0 overflow-visible">
                        <SparklesCore
                          background="transparent"
                          minSize={0.5}
                          maxSize={1.6}
                          particleCount={10}
                          particleColor="#5cf5bd"
                          speed={4}
                          className="h-full w-full"
                        />
                      </span>
                    )}
                    <TextGenerateEffect
                      words={l.text}
                      staggerDelay={0.035}
                      className={
                        isEco(l.identity)
                          ? 'text-[14px] leading-relaxed text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
                          : 'rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-[14px] leading-relaxed text-white/80 backdrop-blur-sm'
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      {/* ── Screen Share Hint ── */}
      <AnimatePresence>
        {!sharing && (
          <motion.div
            className="relative z-10 mx-auto max-w-lg w-full flex items-center gap-3 rounded-2xl border border-eco-accent/20 bg-eco-accent/[0.06] px-4 py-2.5 text-[11px] text-white/80 backdrop-blur-sm mb-3"
            style={{ marginLeft: 'auto', marginRight: 'auto' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <span className="text-eco-accent/80 shrink-0">
              <Icon d={I.share} />
            </span>
            <div className="flex-1">
              <span className="font-semibold text-eco-accent/90">Share your screen when you&rsquo;re ready.</span>{' '}
              <span className="text-white/45">Whole screen or a single window.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Island Control Bar ── */}
      <div className="relative z-10 flex shrink-0 justify-center px-4 pb-5 pt-2">
        <motion.footer
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
        >
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isMicrophoneEnabled
                ? 'bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                : 'bg-eco-danger/15 text-red-300 hover:bg-eco-danger/25'
            }`}
          >
            <Icon d={isMicrophoneEnabled ? I.mic : I.micOff} />
            <span>{isMicrophoneEnabled ? 'Mic' : 'Muted'}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCameraEnabled
                ? 'bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                : 'bg-eco-danger/15 text-red-300 hover:bg-eco-danger/25'
            }`}
          >
            <Icon d={isCameraEnabled ? I.cam : I.camOff} />
            <span>{isCameraEnabled ? 'Camera' : 'Cam off'}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleShare}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              sharing
                ? 'bg-eco-accent text-neutral-950 font-semibold shadow-[0_0_14px_rgba(46,230,166,0.3)]'
                : 'bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
            }`}
          >
            <Icon d={I.share} />
            <span>{sharing ? 'Sharing' : 'Share'}</span>
          </motion.button>

          {/* Divider */}
          <div className="h-5 w-px bg-white/[0.08] mx-0.5" />

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => room.disconnect()}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-red-500/15 px-5 text-[12px] font-medium text-red-300 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/25"
          >
            <Icon d={I.leave} />
            <span>Leave</span>
          </motion.button>
        </motion.footer>
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
