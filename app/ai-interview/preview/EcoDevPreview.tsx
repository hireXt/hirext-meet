'use client';

/**
 * Dev visual harness for /ai-interview.
 *
 * Renders the real Eco screen shell against mock data so both states can be
 * reviewed and tweaked without a LiveKit room, the eco agent, or a camera:
 *   ?state=video  → Eco tile shows the intro clip (avatar video ON)
 *   ?state=audio  → Eco tile shows Neural Voice Orb & WavyBackground (video OFF)
 *   ?state=both   → both stacked, for side-by-side comparison (default)
 *
 * Guarded by NEXT_PUBLIC_ECO_DEV_PREVIEW=1.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { WavyBackground } from '@/components/ui/wavy-background';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { BrandLogo } from '@/lib/ailink/BrandLogo';
import { playSpeakerTestSound } from '@/lib/audioTest';
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShrinkIcon,
  UsersIcon,
  VolumeIcon,
} from '@/lib/ailink/icons';

const EASE = [0.22, 1, 0.36, 1] as const;

export const MOCK_DIALOGUE_POOL = [
  {
    id: 't-1',
    eco: true,
    text: 'Hi Veer, good morning. Thanks for joining the interview today. Are you ready to begin our technical assessment?',
  },
  { id: 't-2', eco: false, text: 'Good morning! Yes, absolutely ready.' },
  {
    id: 't-3',
    eco: true,
    text: 'Great. Let us start with system design. Tell me about a time you had to diagnose and resolve a severe production outage.',
  },
  {
    id: 't-4',
    eco: false,
    text: 'We had an incident where an asynchronous queue backed up due to a database deadlock. I isolated the worker pool and deployed a migration within ten minutes.',
  },
  {
    id: 't-5',
    eco: true,
    text: 'Walk me through the deadlock diagnosis. What telemetry or metrics led you to pinpoint the contention?',
  },
  {
    id: 't-6',
    eco: false,
    text: 'We analyzed PostgreSQL lock tables and pg_stat_activity, correlating latency spikes with slow RPC timeouts in Datadog.',
  },
  {
    id: 't-7',
    eco: true,
    text: 'Good catch. How did you restructure the transaction boundaries to prevent future deadlocks under peak traffic?',
  },
  {
    id: 't-8',
    eco: false,
    text: 'We enforced strict resource acquisition ordering across transactions and moved non-critical side effects outside the atomic commit.',
  },
  {
    id: 't-9',
    eco: true,
    text: 'Excellent architectural decision. Now let us touch on distributed consistency and cache invalidation strategies.',
  },
  {
    id: 't-10',
    eco: false,
    text: 'We utilize cache-aside with write-through invalidation via Kafka change data capture streams, avoiding stale reads.',
  },
  {
    id: 't-11',
    eco: true,
    text: 'How do you handle partition rebalancing during heavy consumer skew without dropping SLA promises?',
  },
  {
    id: 't-12',
    eco: false,
    text: 'We tuned cooperative sticky partition assignment and backpressured batch consumption with bounded thread pools.',
  },
];

const YOU_CLIP = '/mock/eco-candidate-video.mp4';
const ECO_CLIP = '/mock/eco-avatar-video.mp4';

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function getInitials(name?: string) {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  React.useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, active, onClose]);
}

function ClosedCaptionsIcon({
  size = 18,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10 9.5a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2" />
      <path d="M16 9.5a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2" />
    </svg>
  );
}

function DownloadIcon({ size = 18, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function useMockEnergy(active: boolean) {
  const [energy, setEnergy] = React.useState(0.4);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const cycle = Math.sin(Date.now() / 2000);
      const isSpeakingNow = cycle > 0;
      if (isSpeakingNow) {
        setEnergy(0.25 + Math.abs(Math.sin(Date.now() / 220)) * 0.5 + Math.random() * 0.2);
      } else {
        setEnergy(0);
      }
    }, 80);
    return () => clearInterval(id);
  }, [active]);
  return energy;
}

function Screen({
  showVideo,
  mode,
  onModeChange,
}: {
  showVideo: boolean;
  mode?: 'video' | 'audio' | 'both' | 'greenroom' | 'concluded';
  onModeChange?: (m: 'video' | 'audio' | 'both' | 'greenroom' | 'concluded') => void;
}) {
  const energy = useMockEnergy(true);
  const speaking = energy > 0.05;
  const candidateName = 'Veer';
  const [seconds, setSeconds] = React.useState(74);
  const [ended, setEnded] = React.useState(mode === 'concluded');
  const [finalDuration, setFinalDuration] = React.useState<number | null>(
    mode === 'concluded' ? 74 : null,
  );
  const [concludedStage, setConcludedStage] = React.useState<'center' | 'settled'>('center');

  React.useEffect(() => {
    if (mode === 'concluded') {
      setEnded(true);
      setFinalDuration(74);
    } else {
      setEnded(false);
      setFinalDuration(null);
    }
  }, [mode]);

  React.useEffect(() => {
    if (ended) {
      setConcludedStage('center');
      const timer = setTimeout(() => {
        setConcludedStage('settled');
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [ended]);

  const [micEnabled, setMicEnabled] = React.useState(true);
  const [cameraEnabled, setCameraEnabled] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [noiseFilterEnabled, setNoiseFilterEnabled] = React.useState(true);
  const [captionsOpen, setCaptionsOpen] = React.useState(true);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = React.useState(false);

  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [participantsOpen, setParticipantsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeMic, setActiveMic] = React.useState('Studio Microphone (HD)');
  const [activeCam, setActiveCam] = React.useState('FaceTime HD Camera');
  const [activeSpeaker, setActiveSpeaker] = React.useState('Studio Monitor Speakers');

  const participantsRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(participantsRef, participantsOpen, () => setParticipantsOpen(false));

  React.useEffect(() => {
    if (ended) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [ended]);

  const transcriptContainerRef = React.useRef<HTMLDivElement>(null);
  const transcriptEndRef = React.useRef<HTMLDivElement>(null);

  const [transcriptLines, setTranscriptLines] = React.useState(() =>
    MOCK_DIALOGUE_POOL.slice(0, 3),
  );
  const [streamActive, setStreamActive] = React.useState(true);

  React.useEffect(() => {
    if (!streamActive || ended) return;
    const interval = setInterval(() => {
      setTranscriptLines((prev) => {
        const nextIdx = prev.length;
        if (nextIdx < MOCK_DIALOGUE_POOL.length) {
          return [...prev, MOCK_DIALOGUE_POOL[nextIdx]];
        }
        const loopItem = {
          ...MOCK_DIALOGUE_POOL[nextIdx % MOCK_DIALOGUE_POOL.length],
          id: `t-${Date.now()}-${nextIdx}`,
        };
        return [...prev, loopItem];
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [streamActive, ended]);

  React.useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptLines.length]);

  const handleNextExchange = () => {
    setTranscriptLines((prev) => {
      const nextIdx = prev.length;
      const item =
        nextIdx < MOCK_DIALOGUE_POOL.length
          ? MOCK_DIALOGUE_POOL[nextIdx]
          : {
              ...MOCK_DIALOGUE_POOL[nextIdx % MOCK_DIALOGUE_POOL.length],
              id: `t-${Date.now()}-${nextIdx}`,
            };
      return [...prev, item];
    });
  };

  if (ended) {
    return (
      <div className="relative isolate flex min-h-[100dvh] w-full flex-col justify-between overflow-hidden bg-[#06080C] px-6 sm:px-12 lg:px-16 py-8 sm:py-12 font-sans text-white antialiased select-none">
        {/* Cinematic ambient background glow - themed to the logo */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/4 h-[650px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,62,62,0.15),rgba(255,0,160,0.08),rgba(0,0,0,0)_70%)] blur-[140px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-40 right-1/4 h-[600px] w-[800px] rounded-full bg-[radial-gradient(circle_at_center,rgba(0,163,255,0.15),rgba(162,0,255,0.08),rgba(0,0,0,0)_70%)] blur-[140px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.3 }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.85)_100%)]" />

        {concludedStage === 'center' && (
          <div className="fixed inset-0 z-30 flex flex-col items-center justify-center pointer-events-none px-6">
            <motion.div
              className="absolute h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,0,160,0.15),rgba(0,163,255,0.12),rgba(0,0,0,0)_70%)] blur-[90px]"
              animate={{ opacity: [0.5, 0.8, 0.5], scale: [0.96, 1.06, 0.96] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              layoutId="interview-concluded-title-container"
              transition={{ duration: 1.1, ease: EASE }}
              className="flex flex-col items-center text-center relative z-10"
            >
              <motion.h1
                layoutId="interview-concluded-heading"
                initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.7, ease: EASE }}
                className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight bg-gradient-to-br from-[#FFB03A] via-[#FF00A0] to-[#00A3FF] bg-clip-text text-transparent"
              >
                Interview Concluded
              </motion.h1>
            </motion.div>
          </div>
        )}

        {concludedStage === 'settled' && (
          <>
            <div className="relative z-10 mx-auto my-auto grid w-full max-w-7xl grid-cols-1 items-end gap-12 lg:grid-cols-12 lg:gap-16 py-8">
              <div className="flex flex-col items-start text-left lg:col-span-7 space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
                  className="flex items-center gap-3 mb-1"
                >
                  <img
                    src="/logo.png"
                    alt="MeeXt Logo"
                    className="h-8 w-auto object-contain select-none"
                  />
                  <span className="h-4 w-px bg-white/20" />
                  <span className="text-xs font-semibold tracking-wide text-white/80">
                    MeeXt by HireXt
                  </span>
                </motion.div>

                <motion.div
                  layoutId="interview-concluded-title-container"
                  transition={{ duration: 1.1, ease: EASE }}
                  className="flex flex-col items-start text-left"
                >
                  <motion.h1
                    layoutId="interview-concluded-heading"
                    className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] bg-gradient-to-br from-[#FFB03A] via-[#FF00A0] to-[#00A3FF] bg-clip-text text-transparent pb-2"
                  >
                    Interview Concluded
                  </motion.h1>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.25 }}
                  className="text-sm sm:text-base text-neutral-300/90 leading-relaxed max-w-xl pt-1"
                >
                  Thank you, <span className="text-white font-medium">{candidateName}</span>. Your
                  interview responses have been submitted.
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
                className="flex w-full flex-col items-center lg:col-span-5 lg:items-end"
              >
                <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl space-y-4 text-left relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFB03A] via-[#FF00A0] to-[#00A3FF] opacity-50" />

                  <div className="flex justify-between items-center text-xs text-white/70">
                    <span className="text-white/50">Session</span>
                    <span className="font-semibold text-white">
                      Senior Software Engineer Assessment
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs text-white/70">
                    <span className="text-white/50">Candidate</span>
                    <span className="text-white font-medium">{candidateName}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs text-white/70">
                    <span className="text-white/50">Total Duration</span>
                    <span className="font-mono text-sm font-bold text-[#FF00A0] drop-shadow-[0_0_8px_rgba(255,0,160,0.4)]">
                      {fmt(finalDuration ?? seconds)}
                    </span>
                  </div>

                  <div className="h-px w-full bg-white/[0.06] my-1" />

                  <div className="flex justify-between items-center text-xs text-white/70">
                    <span className="text-white/50">Status</span>
                    <span className="text-[#00A3FF] font-medium">Submitted</span>
                  </div>

                  <div className="pt-2">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEnded(false);
                          setFinalDuration(null);
                        }}
                        className="flex-1 inline-flex h-11 items-center justify-center rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 px-6 text-xs font-semibold transition-all active:scale-[0.98] shadow-lg cursor-pointer"
                      >
                        Replay Interview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') window.location.reload();
                        }}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white px-5 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Reset Session
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="relative z-10 flex w-full items-center justify-between text-[11px] text-white/35 pt-4"
            >
              <span>MeeXt by HireXt</span>
              <span>Session Concluded</span>
            </motion.footer>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-black font-sans text-[#eef1f5] antialiased select-none">
      <BackgroundBeams />

      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/40 px-6 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="HireXt Logo"
            className="h-7 w-auto object-contain select-none"
          />
          <span className="h-4 w-px bg-white/15" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white">
            Interview
          </span>

          <span className="h-3.5 w-px bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">
              Senior Software Engineer Assessment
            </span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          {onModeChange && (
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[11px]">
              {(['video', 'audio', 'both', 'greenroom', 'concluded'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onModeChange(s)}
                  className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                    mode === s
                      ? 'bg-gradient-to-r from-[#FF3E3E] via-[#A200FF] to-[#00A3FF] text-white font-bold shadow-[0_0_12px_rgba(162,0,255,0.35)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {s === 'video'
                    ? 'Avatar Video'
                    : s === 'audio'
                      ? 'Audio DP'
                      : s === 'both'
                        ? 'Compare'
                        : s === 'greenroom'
                          ? 'Green Room'
                          : 'Concluded'}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setStreamActive(!streamActive)}
              className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                streamActive
                  ? 'bg-[#00A3FF]/15 text-[#00A3FF] border border-[#00A3FF]/30 shadow-[0_0_8px_rgba(0,163,255,0.2)]'
                  : 'text-white/50 hover:text-white'
              }`}
              title={streamActive ? 'Pause live mock stream' : 'Resume live mock stream'}
            >
              {streamActive ? 'Live Mocking' : 'Paused'}
            </button>
            <button
              type="button"
              onClick={handleNextExchange}
              className="rounded-full px-2 py-1 font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
              title="Push next exchange immediately"
            >
              + Next Line
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                speaking
                  ? 'bg-[#FF00A0] shadow-[0_0_8px_#FF00A0]'
                  : 'bg-[#00A3FF] shadow-[0_0_6px_#00A3FF]'
              }`}
            />
            <span>Monica is {speaking ? 'speaking' : 'listening'}</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#F52D45]/30 bg-[#F52D45]/15 px-3 py-1.5 text-[11px] font-semibold text-[#F52D45]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F52D45] animate-pulse" />
            <span className="font-mono tabular-nums">{fmt(seconds)}</span>
          </div>

          <div className="relative" ref={participantsRef}>
            <button
              type="button"
              onClick={() => setParticipantsOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-3 py-1.5 text-[11px] font-medium transition-all ${
                participantsOpen
                  ? 'border-[#00A3FF]/60 bg-[#00A3FF]/20 text-[#00A3FF] shadow-[0_0_12px_rgba(0,163,255,0.25)]'
                  : 'border-white/[0.08] bg-white/[0.03] text-white/80 hover:bg-white/[0.08] hover:text-white hover:border-white/20'
              }`}
              title="Participants"
              aria-expanded={participantsOpen}
            >
              <UsersIcon
                size={14}
                className={participantsOpen ? 'text-[#00A3FF]' : 'text-white/70'}
              />
              <span className="font-semibold text-white">2</span>
              <span className="hidden sm:inline text-white/60">Participants</span>
              <ChevronDownIcon
                size={12}
                className={`transition-transform duration-200 text-white/50 ${participantsOpen ? 'rotate-180 text-white' : ''}`}
              />
            </button>

            {participantsOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-3.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <UsersIcon size={14} className="text-[#00A3FF]" />
                    <span className="text-xs font-semibold text-white">Participants</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#00A3FF] bg-[#00A3FF]/10 px-2 py-0.5 rounded-full border border-[#00A3FF]/20">
                    2 Active
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#FF3E3E] via-[#A200FF] to-[#00A3FF] text-white font-semibold text-xs shadow-[0_0_10px_rgba(162,0,255,0.3)]">
                        M
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 ${speaking ? 'bg-[#FF00A0]' : 'bg-[#00A3FF]'}`}
                        />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">Monica</span>
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-[#A200FF] bg-[#A200FF]/15 px-1.5 py-0.2 rounded border border-[#A200FF]/30">
                            AI
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50 truncate">
                          {speaking ? 'Speaking...' : 'Listening...'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-white/60">
                      <span
                        className={`h-2 w-2 rounded-full ${speaking ? 'bg-[#FF00A0] animate-pulse' : 'bg-[#00A3FF]'}`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white font-semibold text-xs border border-white/10">
                        {getInitials(candidateName)}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 ${micEnabled ? 'bg-[#FFB03A]' : 'bg-[#F52D45]'}`}
                        />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">
                            {candidateName || 'Candidate'}
                          </span>
                          <span className="text-[9px] font-medium text-white/40 bg-white/5 px-1.5 py-0.2 rounded">
                            You
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50">
                          {micEnabled ? 'Mic Active' : 'Muted'} •{' '}
                          {cameraEnabled ? 'Cam On' : 'Cam Off'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-white/60">
                      {micEnabled ? (
                        <MicIcon size={13} className="text-[#FFB03A]" />
                      ) : (
                        <MicOffIcon size={13} className="text-[#F52D45]" />
                      )}
                      {cameraEnabled ? (
                        <CameraIcon size={13} className="text-[#FFB03A]" />
                      ) : (
                        <CameraOffIcon size={13} className="text-[#F52D45]" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-2.5 px-3 sm:px-6 py-2 container mx-auto w-full">
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 w-full h-full items-stretch">
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between min-h-0 h-full relative py-2 px-1 sm:px-3 order-2 lg:order-1">
            <div
              ref={transcriptContainerRef}
              className="relative flex flex-col justify-center gap-5 overflow-hidden flex-1 py-4"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black to-transparent z-10" />

              <div className="flex flex-col gap-4 justify-end">
                {transcriptLines.slice(-4).map((line) => (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className={`flex flex-col w-full ${line.eco ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`flex flex-col w-[80%] max-w-[80%] ${
                        line.eco ? 'items-start text-left' : 'items-end text-right'
                      }`}
                    >
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${
                          line.eco ? 'text-white/40 text-left' : 'text-[#00A3FF]/70 text-right'
                        }`}
                      >
                        {line.eco ? 'Monica' : 'Veer (You)'}
                      </span>

                      <div
                        className={`text-base sm:text-lg lg:text-xl font-extrabold leading-relaxed tracking-tight ${
                          line.eco ? 'text-white text-left' : 'text-[#00A3FF] text-right'
                        }`}
                      >
                        <TextGenerateEffect
                          words={line.text}
                          typingSpeed={10}
                          className={`font-bold ${line.eco ? 'text-white text-left' : 'text-[#00A3FF] text-right'}`}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3 min-h-0 h-full justify-center order-1 lg:order-2">
            <div className="rounded-[1.75rem] p-1.5 flex flex-col flex-1 min-h-0">
              <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)]">
                {showVideo ? (
                  <video
                    src={ECO_CLIP}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center">
                    <div className="absolute inset-x-0 bottom-0 h-28 sm:h-32 overflow-hidden pointer-events-none [mask-image:linear-gradient(to_top,black_70%,transparent_100%)]">
                      <WavyBackground
                        blur={0}
                        waveWidth={1.8}
                        waveOpacity={0.9}
                        speed="fast"
                        backgroundFill="transparent"
                        colors={['#FFB03A', '#FF3E3E', '#FF00A0', '#A200FF', '#00A3FF']}
                        audioEnergy={energy}
                        isSpeaking={speaking}
                        containerClassName="h-full w-full"
                      />
                    </div>

                    <div className="relative z-10 flex flex-col items-center gap-3">
                      <div
                        className={`relative rounded-full p-1 transition-all duration-300 ${
                          speaking
                            ? 'ring-2 ring-[#FF00A0] ring-offset-2 ring-offset-neutral-950 shadow-[0_0_20px_rgba(255,0,160,0.35)]'
                            : 'ring-1 ring-white/20 ring-offset-2 ring-offset-neutral-950'
                        }`}
                      >
                        <div className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border border-white/10 bg-neutral-900 shadow-xl">
                          <img
                            src="/images/eco-avatar.jpg"
                            alt="Monica"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md shadow-md">
                        <span>Monica</span>
                      </div>
                    </div>
                  </div>
                )}

                {showVideo && (
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                    <span>Monica</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col flex-1 min-h-0">
              <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                {cameraEnabled ? (
                  <video
                    src={YOU_CLIP}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-neutral-800 to-neutral-900 text-lg font-bold text-white shadow-xl">
                      V
                    </div>
                    <span className="text-xs font-medium text-white/50">Camera turned off</span>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                  <span>Veer (You)</span>
                </div>

                <div className="absolute bottom-3 right-3 z-20">
                  {!micEnabled ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-[#F52D45]/40 bg-[#F52D45]/20 px-2.5 py-1 text-[10px] font-semibold text-[#F52D45] backdrop-blur-md">
                      <MicOffIcon size={12} />
                      <span>Muted</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-full border border-[#00A3FF]/30 bg-[#00A3FF]/15 px-2.5 py-1 text-[10px] font-medium text-[#00A3FF] backdrop-blur-md">
                      <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00A3FF] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00A3FF]" />
                      </span>
                      <MicIcon size={12} />
                      <span>Mic On</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="relative z-20 flex shrink-0 justify-center px-4 pb-3 sm:pb-4 pt-1">
        <motion.footer
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-neutral-950/85 p-2 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="relative">
            <div
              className={`inline-flex h-11 items-stretch rounded-full border transition-all duration-200 overflow-hidden ${
                micEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                  : 'border-red-500/40 bg-red-500/20 text-red-200 hover:bg-red-500/25'
              }`}
            >
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className="inline-flex items-center gap-2 pl-3.5 pr-2.5 text-xs font-semibold hover:bg-white/10 transition-colors active:scale-95"
                title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micEnabled ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
                <span>{micEnabled ? 'Mic' : 'Muted'}</span>
              </button>
              <div className="w-px self-stretch bg-white/15 my-2" />
              <button
                type="button"
                onClick={() => {
                  setMicMenuOpen((v) => !v);
                  setCameraMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className="inline-flex items-center px-2.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Microphone & speaker settings"
              >
                <ChevronUpIcon
                  size={13}
                  className={`transition-transform duration-200 ${micMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <AnimatePresence>
              {micMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full left-0 mb-3 w-72 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur-2xl z-30"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Microphone
                  </div>
                  <div className="space-y-0.5">
                    {[
                      'Default - Studio Microphone (HD)',
                      'External USB Mic',
                      'MacBook Air Microphone',
                    ].map((m) => {
                      const isSelected = activeMic === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setActiveMic(m);
                            setMicMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-[#00A3FF]/15 text-[#00A3FF] font-medium'
                              : 'text-white/80 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className="truncate pr-2">{m}</span>
                          {isSelected && (
                            <CheckIcon size={14} className="shrink-0 text-[#00A3FF]" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="my-2 h-px bg-white/10" />

                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Speaker
                  </div>
                  <div className="space-y-0.5">
                    {['Studio Monitor Speakers', 'MacBook Air Speakers', 'Headphones (3.5mm)'].map(
                      (s) => {
                        const isSelected = activeSpeaker === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setActiveSpeaker(s);
                              setMicMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                              isSelected
                                ? 'bg-[#00A3FF]/15 text-[#00A3FF] font-medium'
                                : 'text-white/80 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{s}</span>
                            {isSelected && (
                              <CheckIcon size={14} className="shrink-0 text-[#00A3FF]" />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <div
              className={`inline-flex h-11 items-stretch rounded-full border transition-all duration-200 overflow-hidden ${
                cameraEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                  : 'border-red-500/40 bg-red-500/20 text-red-200 hover:bg-red-500/25'
              }`}
            >
              <button
                type="button"
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className="inline-flex items-center gap-2 pl-3.5 pr-2.5 text-xs font-semibold hover:bg-white/10 transition-colors active:scale-95"
                title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {cameraEnabled ? <CameraIcon size={16} /> : <CameraOffIcon size={16} />}
                <span>{cameraEnabled ? 'Camera' : 'Cam off'}</span>
              </button>
              <div className="w-px self-stretch bg-white/15 my-2" />
              <button
                type="button"
                onClick={() => {
                  setCameraMenuOpen((v) => !v);
                  setMicMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className="inline-flex items-center px-2.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Camera device settings"
              >
                <ChevronUpIcon
                  size={13}
                  className={`transition-transform duration-200 ${cameraMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <AnimatePresence>
              {cameraMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full left-0 mb-3 w-64 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur-2xl z-30"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Select Camera
                  </div>
                  <div className="space-y-0.5">
                    {['FaceTime HD Camera', 'External 4K Webcam', 'Virtual Studio Cam'].map((c) => {
                      const isSelected = activeCam === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setActiveCam(c);
                            setCameraMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-[#00A3FF]/15 text-[#00A3FF] font-medium'
                              : 'text-white/80 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className="truncate pr-2">{c}</span>
                          {isSelected && (
                            <CheckIcon size={14} className="shrink-0 text-[#00A3FF]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSharing(!sharing)}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-all duration-200 ${
              sharing
                ? 'border-[#FF00A0] bg-gradient-to-r from-[#FF3E3E] via-[#FF00A0] to-[#A200FF] text-white font-bold shadow-[0_0_16px_rgba(255,0,160,0.4)]'
                : 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12] hover:text-white'
            }`}
            title={sharing ? 'Stop sharing screen' : 'Share your screen'}
          >
            <ScreenShareIcon size={16} />
            <span className="hidden sm:inline">{sharing ? 'Sharing' : 'Share'}</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white transition-all duration-200"
            title="Audio & Video Settings"
          >
            <SettingsIcon size={17} />
          </motion.button>

          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setMoreMenuOpen((v) => !v);
                setMicMenuOpen(false);
                setCameraMenuOpen(false);
              }}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 ${
                moreMenuOpen
                  ? 'border-white/20 bg-white/20 text-white'
                  : 'border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white'
              }`}
              title="More options"
            >
              <MoreIcon size={17} />
            </motion.button>

            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full right-0 mb-3 w-52 rounded-2xl border border-white/10 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur-2xl z-30 space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!document.fullscreenElement)
                        document.documentElement.requestFullscreen().catch(() => {});
                      else document.exitFullscreen().catch(() => {});
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <ExpandIcon size={15} />
                    <span>Full Screen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMoreMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <DownloadIcon size={15} />
                    <span>Export Transcript</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(true);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <SettingsIcon size={15} />
                    <span>Diagnostics &amp; Devices</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-6 w-px bg-white/10 mx-1" />

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setConfirmLeaveOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F52D45] px-5 text-xs font-bold text-white transition-all duration-200 hover:bg-[#d92238] active:bg-[#b8182c] shadow-[0_2px_16px_rgba(245,45,69,0.45)] hover:shadow-[0_4px_24px_rgba(245,45,69,0.65)] cursor-pointer"
            title="Conclude interview session"
          >
            <PhoneOffIcon size={16} />
            <span>End Interview</span>
          </motion.button>
        </motion.footer>
      </div>

      <AnimatePresence>
        {confirmLeaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-[2rem] border border-white/10 bg-neutral-950 p-6 text-center text-white"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F52D45]/30 bg-[#F52D45]/15 text-[#F52D45]">
                  <PhoneOffIcon size={24} />
                </div>
                <h3 className="text-lg font-bold">Conclude Interview Session?</h3>
                <p className="text-xs text-neutral-400">
                  Are you sure you want to end your interview? Once disconnected, your session will
                  conclude.
                </p>
                <div className="flex w-full gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLeaveOpen(false)}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  >
                    Stay in Interview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmLeaveOpen(false);
                      setFinalDuration(seconds);
                      setEnded(true);
                    }}
                    className="flex-1 rounded-xl bg-[#F52D45] py-2.5 text-xs font-semibold text-white shadow-[0_0_16px_rgba(245,45,69,0.4)] hover:bg-[#d92238] cursor-pointer"
                  >
                    End &amp; Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl backdrop-blur-2xl text-white"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <h3 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                  <SettingsIcon size={18} />
                  Devices &amp; Diagnostics
                </h3>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Camera
                  </label>
                  <div className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white">
                    {activeCam}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Microphone
                  </label>
                  <div className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white">
                    {activeMic}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Speaker &amp; Audio Output
                  </label>
                  <div className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white">
                    {activeSpeaker}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between text-white/60">
                    <span>AI Voice Isolation (Krisp)</span>
                    <span
                      className={
                        noiseFilterEnabled ? 'text-[#00A3FF] font-semibold' : 'text-white/40'
                      }
                    >
                      {noiseFilterEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-white/60">
                    <span>Network Stream Quality</span>
                    <span className="text-[#00A3FF] font-semibold">HD 1080p · 60fps Adaptive</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-xl bg-white/10 px-5 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreJoinPreview({
  onEnter,
  mode,
  onModeChange,
}: {
  onEnter: () => void;
  mode?: 'video' | 'audio' | 'both' | 'greenroom' | 'concluded';
  onModeChange?: (m: 'video' | 'audio' | 'both' | 'greenroom' | 'concluded') => void;
}) {
  const [username, setUsername] = React.useState('Veer');
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const [audioEnabled, setAudioEnabled] = React.useState(true);
  const [micLevel, setMicLevel] = React.useState(42);
  const [testPlaying, setTestPlaying] = React.useState(false);
  const [selectedCam, setSelectedCam] = React.useState('FaceTime HD Camera (Built-in)');
  const [selectedMic, setSelectedMic] = React.useState('MacBook Pro Microphone');
  const [selectedSpeaker, setSelectedSpeaker] = React.useState('MacBook Pro Speakers');
  const [joining, setJoining] = React.useState(false);

  React.useEffect(() => {
    if (!audioEnabled) {
      setMicLevel(0);
      return;
    }
    const interval = setInterval(() => {
      setMicLevel(Math.floor(25 + Math.random() * 55));
    }, 120);
    return () => clearInterval(interval);
  }, [audioEnabled]);

  const handleTestSpeaker = async () => {
    if (testPlaying) return;
    setTestPlaying(true);
    try {
      await playSpeakerTestSound();
    } catch {
    } finally {
      setTestPlaying(false);
    }
  };

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setTimeout(() => {
      setJoining(false);
      onEnter();
    }, 600);
  };

  return (
    <div className="relative isolate flex min-h-[100dvh] w-full flex-col justify-between overflow-x-hidden bg-[#0A0C10] font-sans text-white antialiased">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-15%,rgba(162,0,255,0.08),rgba(0,0,0,0))]" />

      <header className="relative z-20 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/40 px-4 sm:px-8 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="HireXt Logo"
            className="h-7 w-auto object-contain select-none"
          />
          <span className="h-4 w-px bg-white/15" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white">
            Interview
          </span>
          <span className="h-3.5 w-px bg-white/15" />
          <span className="text-xs font-medium text-white/80 max-w-[160px] sm:max-w-none truncate">
            Senior Software Engineer Assessment
          </span>
        </div>

        <div className="flex items-center gap-3">
          {onModeChange && (
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[11px]">
              {(['video', 'audio', 'both', 'greenroom', 'concluded'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onModeChange(s)}
                  className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                    mode === s
                      ? 'bg-gradient-to-r from-[#FF3E3E] via-[#A200FF] to-[#00A3FF] text-white font-bold shadow-[0_0_12px_rgba(162,0,255,0.35)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {s === 'video'
                    ? 'Avatar Video'
                    : s === 'audio'
                      ? 'Audio DP'
                      : s === 'both'
                        ? 'Compare'
                        : s === 'greenroom'
                          ? 'Green Room'
                          : 'Concluded'}
                </button>
              ))}
            </div>
          )}

          <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/80">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00A3FF] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00A3FF]" />
            </span>
            <span>Ready to connect</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-4 sm:px-8 py-4 sm:py-6 container mx-auto w-full">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:gap-10 lg:grid-cols-12 my-auto">
          <div className="flex flex-col gap-3 lg:col-span-7">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-950 border border-white/[0.08] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.05]">
              {videoEnabled ? (
                <video
                  src={YOU_CLIP}
                  autoPlay
                  playsInline
                  loop
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-neutral-900/60 to-neutral-950">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-900 text-xl font-semibold text-white/90 border border-white/10 shadow-lg">
                    {username ? username[0]?.toUpperCase() : 'V'}
                  </div>
                  <span className="text-xs text-white/40">Camera is off</span>
                </div>
              )}

              <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur-md border border-white/10">
                <span className="font-medium">{username.trim() || 'Candidate'}</span>
                <span className="text-white/40">(You)</span>
              </div>

              <div className="absolute top-3.5 right-3.5 z-20">
                {audioEnabled ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-[#FFB03A] backdrop-blur-md border border-white/10">
                    <span className="relative flex h-2 w-2 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFB03A] opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FFB03A]" />
                    </span>
                    <span className="text-[10px] font-medium text-[#FFB03A]">Mic active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-medium text-rose-300 backdrop-blur-md border border-rose-500/30">
                    <MicOffIcon size={11} />
                    <span>Muted</span>
                  </div>
                )}
              </div>

              <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-neutral-950/80 px-3 py-1.5 shadow-2xl backdrop-blur-2xl">
                  <button
                    type="button"
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
                      audioEnabled
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                    }`}
                    title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    {audioEnabled ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoEnabled(!videoEnabled)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
                      videoEnabled
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                    }`}
                    title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {videoEnabled ? <CameraIcon size={16} /> : <CameraOffIcon size={16} />}
                  </button>

                  <div className="h-4 w-px bg-white/15 mx-1" />

                  <button
                    type="button"
                    onClick={handleTestSpeaker}
                    disabled={testPlaying}
                    className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Test speaker output"
                  >
                    <VolumeIcon
                      size={14}
                      className={testPlaying ? 'text-[#00A3FF] animate-pulse' : 'text-white/60'}
                    />
                    <span>{testPlaying ? 'Testing audio…' : 'Test speakers'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:col-span-5">
            <div className="flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-neutral-900/40 p-6 sm:p-7 backdrop-blur-2xl shadow-xl">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  Ready to join?
                </h1>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">
                  Review your audio and video before starting your interview with Monica.
                </p>
              </div>

              <form onSubmit={handleEnter} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/60 mb-1.5">
                    Your name
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your name"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-white/20 transition-all focus:border-[#A200FF]/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-[#A200FF]/20"
                  />
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="flex items-center justify-between text-[11px] text-white/60 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <CameraIcon size={13} className="text-white/40" />
                        <span>Camera</span>
                      </span>
                      <span className="text-[10px] text-white/40">
                        {videoEnabled ? 'Active' : 'Off'}
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedCam}
                        onChange={(e) => setSelectedCam(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-neutral-900/80 px-3.5 py-2 text-xs text-white/90 focus:outline-none focus:border-[#A200FF]/60 pr-8 cursor-pointer hover:bg-neutral-900 transition-colors"
                      >
                        <option value="FaceTime HD Camera (Built-in)">
                          FaceTime HD Camera (Built-in)
                        </option>
                        <option value="Studio Camera Pro">Studio Camera Pro (External)</option>
                      </select>
                      <ChevronDownIcon
                        size={13}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-[11px] text-white/60 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <MicIcon size={13} className="text-white/40" />
                        <span>Microphone</span>
                      </span>
                      <span className="text-[10px] text-white/40">
                        {audioEnabled ? (micLevel > 10 ? 'Input detected' : 'Connected') : 'Muted'}
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedMic}
                        onChange={(e) => setSelectedMic(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-neutral-900/80 px-3.5 py-2 text-xs text-white/90 focus:outline-none focus:border-[#A200FF]/60 pr-8 cursor-pointer hover:bg-neutral-900 transition-colors"
                      >
                        <option value="MacBook Pro Microphone">
                          MacBook Pro Microphone (Built-in)
                        </option>
                        <option value="Studio USB Mic">Studio USB Mic (HD)</option>
                      </select>
                      <ChevronDownIcon
                        size={13}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                      />
                    </div>

                    {audioEnabled && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-white/40 shrink-0">Mic level</span>
                        <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#FFB03A] to-[#FF3E3E] rounded-full transition-all duration-75"
                            style={{ width: `${Math.min(100, Math.max(8, micLevel))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-[11px] text-white/60 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <VolumeIcon size={13} className="text-white/40" />
                        <span>Speakers</span>
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedSpeaker}
                        onChange={(e) => setSelectedSpeaker(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-neutral-900/80 px-3.5 py-2 text-xs text-white/90 focus:outline-none focus:border-[#A200FF]/60 pr-8 cursor-pointer hover:bg-neutral-900 transition-colors"
                      >
                        <option value="MacBook Pro Speakers">MacBook Pro Speakers (Default)</option>
                        <option value="External Studio Headphones">
                          External Studio Headphones
                        </option>
                      </select>
                      <ChevronDownIcon
                        size={13}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={joining}
                  className="mt-2 h-11 w-full rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 font-semibold text-sm transition-all active:scale-[0.99] shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {joining ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
                      <span>Connecting…</span>
                    </span>
                  ) : (
                    <span>Join Interview</span>
                  )}
                </button>
              </form>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                <ShieldCheckIcon size={13} className="text-[#00A3FF]" />
                <span>Audio &amp; video are private until you enter</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full shrink-0 border-t border-white/[0.06] bg-neutral-950/40 px-4 sm:px-8 py-2.5 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between text-[11px] text-white/40">
          <span>MeeXt by HireXt</span>
        </div>
      </footer>
    </div>
  );
}

export default function EcoDevPreview() {
  const [currentMode, setCurrentMode] = React.useState<
    'video' | 'audio' | 'both' | 'greenroom' | 'concluded'
  >(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('state');
      if (
        p === 'audio' ||
        p === 'video' ||
        p === 'both' ||
        p === 'greenroom' ||
        p === 'concluded'
      ) {
        return p as any;
      }
    }
    return 'video';
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const stateParam = urlParams.get('state');
      if (
        stateParam === 'audio' ||
        stateParam === 'video' ||
        stateParam === 'both' ||
        stateParam === 'greenroom' ||
        stateParam === 'concluded'
      ) {
        setCurrentMode(stateParam as any);
      }
    }
  }, []);

  if (currentMode === 'greenroom') {
    return (
      <PreJoinPreview
        onEnter={() => setCurrentMode('video')}
        mode={currentMode}
        onModeChange={setCurrentMode}
      />
    );
  }

  if (currentMode === 'both') {
    return (
      <div className="min-h-screen bg-neutral-950 p-6">
        <div className="mx-auto mb-5 flex max-w-[1500px] items-center gap-3">
          <h1 className="text-lg font-semibold text-white">/ai-interview — dev preview</h1>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
            mock harness — side-by-side mode
          </span>
          <div className="flex-1" />
          {(['video', 'audio', 'both', 'greenroom', 'concluded'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCurrentMode(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                currentMode === s
                  ? 'border-[#FF00A0] bg-gradient-to-r from-[#FF3E3E] via-[#FF00A0] to-[#A200FF] text-white font-bold'
                  : 'border-white/15 text-neutral-300 hover:bg-white/10'
              }`}
            >
              {s === 'both'
                ? 'Compare'
                : s === 'greenroom'
                  ? 'Green Room'
                  : s === 'concluded'
                    ? 'Concluded'
                    : s}
            </button>
          ))}
        </div>

        <div className="mx-auto grid max-w-[1500px] gap-6">
          <PreviewFor state="video" />
          <PreviewFor state="audio" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-black">
      <Screen
        showVideo={currentMode === 'video'}
        mode={currentMode}
        onModeChange={setCurrentMode}
      />
    </div>
  );
}

function PreviewFor({ state }: { state: 'video' | 'audio' }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-neutral-400">
        Eco tile:{' '}
        <span className="text-neutral-200">
          {state === 'video' ? 'intro video clip playing' : 'video off — user DP & wavy background'}
        </span>
      </h2>
      <Screen showVideo={state === 'video'} />
    </section>
  );
}
