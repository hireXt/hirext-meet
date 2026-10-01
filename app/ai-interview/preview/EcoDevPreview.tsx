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
import { SparklesCore } from '@/components/ui/sparkles';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  LayoutGridIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShrinkIcon,
  SpotlightIcon,
  VolumeIcon,
} from '@/lib/ailink/icons';

const EASE = [0.22, 1, 0.36, 1] as const;

const MOCK_DIALOGUE = [
  { eco: true, text: 'Hi Veer, good morning. Thanks for joining the interview today. Are you ready to begin our technical assessment?' },
  { eco: false, text: 'Good morning! Yes, absolutely ready.' },
  {
    eco: true,
    text: 'Great. Let us start with system design. Tell me about a time you had to diagnose and resolve a severe production outage.',
  },
  { eco: false, text: 'We had an incident where an asynchronous queue backed up due to a database deadlock. I isolated the worker pool and deployed a migration within ten minutes.' },
  { eco: true, text: 'Walk me through the deadlock diagnosis. What telemetry or metrics led you to pinpoint the contention?' },
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

function ClosedCaptionsIcon({ size = 18, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
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

/** Deterministic pseudo-audio energy cycling between speaking bursts and stillness. */
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

function Screen({ showVideo }: { showVideo: boolean }) {
  const energy = useMockEnergy(true);
  const speaking = energy > 0.05;
  const [seconds, setSeconds] = React.useState(74);

  const [micEnabled, setMicEnabled] = React.useState(true);
  const [cameraEnabled, setCameraEnabled] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [noiseFilterEnabled, setNoiseFilterEnabled] = React.useState(true);
  const [layoutMode, setLayoutMode] = React.useState<'split' | 'spotlight'>('split');
  const [captionsOpen, setCaptionsOpen] = React.useState(true);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = React.useState(false);

  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeMic, setActiveMic] = React.useState('Studio Microphone (HD)');
  const [activeCam, setActiveCam] = React.useState('FaceTime HD Camera');
  const [activeSpeaker, setActiveSpeaker] = React.useState('Studio Monitor Speakers');

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative isolate flex h-[820px] flex-col overflow-hidden rounded-[2rem] border border-white/[0.08] bg-black font-sans text-[#eef1f5] antialiased shadow-2xl">
      <BackgroundBeams />

      {/* ── Top Header ── */}
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/40 px-6 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2ee6a6] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2ee6a6] shadow-[0_0_8px_#2ee6a6]" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">Eco</span>
          </div>

          <span className="h-3.5 w-px bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">
              Senior Software Engineer Assessment
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
              HireXt Enterprise
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                speaking ? 'bg-[#2ee6a6] shadow-[0_0_6px_#2ee6a6]' : 'bg-white/30'
              }`}
            />
            <span>Eco is {speaking ? 'speaking' : 'listening'}</span>
          </div>

          {/* Recording & Timer */}
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono tabular-nums">{fmt(seconds)}</span>
          </div>

          {/* Layout Toggle */}
          <button
            type="button"
            onClick={() => setLayoutMode((m) => (m === 'split' ? 'spotlight' : 'split'))}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title={`Switch to ${layoutMode === 'split' ? 'Spotlight View' : 'Split View'}`}
          >
            {layoutMode === 'split' ? <SpotlightIcon size={14} /> : <LayoutGridIcon size={14} />}
            <span>{layoutMode === 'split' ? 'Spotlight' : 'Grid'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-6 py-3 w-full">
        {layoutMode === 'spotlight' ? (
          /* Spotlight View */
          <div className="relative flex flex-1 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(2rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
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
                  <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)] pointer-events-none">
                    <WavyBackground
                      blur={10}
                      waveWidth={45}
                      waveOpacity={0.4}
                      speed="fast"
                      backgroundFill="transparent"
                      audioEnergy={energy}
                      isSpeaking={speaking}
                    />
                  </div>

                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center">
                      <div
                        className="absolute h-36 w-36 rounded-full border border-[#2ee6a6]/30 transition-all duration-300"
                        style={{
                          transform: `scale(${1 + energy * 1.5})`,
                          opacity: speaking ? 0.7 : 0.2,
                          boxShadow: speaking ? '0 0 40px rgba(46,230,166,0.3)' : 'none',
                        }}
                      />
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-[#0fb59a] via-[#2ee6a6] to-emerald-300 shadow-[0_0_30px_#2ee6a6]">
                        <SparklesCore
                          background="transparent"
                          minSize={0.4}
                          maxSize={1.5}
                          particleCount={12}
                          particleColor="#ffffff"
                          speed={5}
                          className="h-full w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md shadow-lg">
                      <span className={`h-2 w-2 rounded-full ${speaking ? 'bg-[#2ee6a6] animate-pulse shadow-[0_0_8px_#2ee6a6]' : 'bg-white/30'}`} />
                      <span>Eco (AI Interviewer)</span>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">
                        {speaking ? 'Speaking' : 'Listening'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* PiP Candidate Tile */}
              <div className="absolute bottom-4 right-4 z-20 h-36 w-56 overflow-hidden rounded-2xl border border-white/20 bg-neutral-900/90 shadow-2xl backdrop-blur-xl">
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
                  <div className="flex h-full w-full flex-col items-center justify-center text-white/40">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 font-semibold text-white/80">
                      V
                    </div>
                    <span className="text-[10px] mt-1">Camera off</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  <span>Veer (You)</span>
                  {!micEnabled && <MicOffIcon size={12} className="text-red-400" />}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Split Grid View */
          <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
            {/* Eco Tile */}
            <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col min-h-0">
              <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
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
                    <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)] pointer-events-none">
                      <WavyBackground
                        blur={10}
                        waveWidth={45}
                        waveOpacity={0.4}
                        speed="fast"
                        backgroundFill="transparent"
                        audioEnergy={energy}
                        isSpeaking={speaking}
                      />
                    </div>

                    <div className="relative z-10 flex flex-col items-center gap-3">
                      <div className="relative flex items-center justify-center">
                        <div
                          className="absolute h-28 w-28 rounded-full border border-[#2ee6a6]/30 transition-all duration-300"
                          style={{
                            transform: `scale(${1 + energy * 1.4})`,
                            opacity: speaking ? 0.7 : 0.2,
                            boxShadow: speaking ? '0 0 30px rgba(46,230,166,0.3)' : 'none',
                          }}
                        />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[#0fb59a] via-[#2ee6a6] to-emerald-300 shadow-[0_0_24px_#2ee6a6]">
                          <SparklesCore
                            background="transparent"
                            minSize={0.4}
                            maxSize={1.4}
                            particleCount={10}
                            particleColor="#ffffff"
                            speed={4}
                            className="h-full w-full"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md shadow-md">
                        <span
                          className={`h-2 w-2 rounded-full transition-all duration-300 ${
                            speaking ? 'bg-[#2ee6a6] shadow-[0_0_8px_#2ee6a6]' : 'bg-white/30'
                          }`}
                        />
                        <span>Eco</span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          {speaking ? 'Speaking' : 'Listening'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2ee6a6]" />
                  <span>Eco (AI Interviewer)</span>
                </div>
              </div>
            </div>

            {/* Candidate Tile */}
            <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col min-h-0">
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
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-neutral-800 to-neutral-900 text-xl font-bold text-white shadow-xl">
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
                    <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-300 backdrop-blur-md">
                      <MicOffIcon size={12} />
                      <span>Muted</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-300 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Mic On</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Closed Captions & Live Transcription Drawer ── */}
        <AnimatePresence>
          {captionsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: '170px' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950/60 shadow-xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <ClosedCaptionsIcon size={15} className="text-[#2ee6a6]" />
                  <span className="font-semibold text-white/80">Live AI Transcript</span>
                  <span className="text-[10px] text-white/40">Real-time evaluation stream</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCaptionsOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Minimize captions"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                {MOCK_DIALOGUE.map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 ${line.eco ? '' : 'ml-auto justify-end max-w-[80%]'}`}
                  >
                    {line.eco && (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2ee6a6]/15 border border-[#2ee6a6]/30 text-[#2ee6a6] text-[10px] font-bold">
                        AI
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        line.eco
                          ? 'border border-white/10 bg-white/[0.04] text-white/90'
                          : 'border border-[#2ee6a6]/25 bg-[#2ee6a6]/[0.08] text-white font-medium'
                      }`}
                    >
                      <div className="text-[10px] font-semibold text-white/40 mb-0.5">
                        {line.eco ? 'Eco (Interviewer)' : 'Veer (Candidate)'}
                      </div>
                      <span>{line.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Control Bar Dock ── */}
      <div className="relative z-20 flex shrink-0 justify-center px-4 pb-4 pt-1">
        <motion.footer
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-neutral-950/80 p-2 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* Split Mic Button */}
          <div className="relative">
            <div
              className={`inline-flex h-10 items-center rounded-full border transition-all duration-300 ${
                micEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                  : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
              }`}
            >
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className="inline-flex h-full items-center gap-2 pl-3.5 pr-2 text-[12px] font-medium transition-transform active:scale-95"
              >
                {micEnabled ? <MicIcon size={17} /> : <MicOffIcon size={17} />}
                <span>{micEnabled ? 'Mic' : 'Muted'}</span>
              </button>
              <div className="h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => setMicMenuOpen((v) => !v)}
                className="inline-flex h-full items-center px-2 text-white/60 hover:text-white"
              >
                <ChevronUpIcon size={13} />
              </button>
            </div>
          </div>

          {/* Split Camera Button */}
          <div className="relative">
            <div
              className={`inline-flex h-10 items-center rounded-full border transition-all duration-300 ${
                cameraEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                  : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
              }`}
            >
              <button
                type="button"
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className="inline-flex h-full items-center gap-2 pl-3.5 pr-2 text-[12px] font-medium transition-transform active:scale-95"
              >
                {cameraEnabled ? <CameraIcon size={17} /> : <CameraOffIcon size={17} />}
                <span>{cameraEnabled ? 'Camera' : 'Cam off'}</span>
              </button>
              <div className="h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => setCameraMenuOpen((v) => !v)}
                className="inline-flex h-full items-center px-2 text-white/60 hover:text-white"
              >
                <ChevronUpIcon size={13} />
              </button>
            </div>
          </div>

          {/* Screen Share */}
          <button
            type="button"
            onClick={() => setSharing(!sharing)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium transition-all ${
              sharing
                ? 'border-[#2ee6a6] bg-[#2ee6a6] text-neutral-950 font-semibold'
                : 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
            }`}
          >
            <ScreenShareIcon size={17} />
            <span>{sharing ? 'Sharing' : 'Share'}</span>
          </button>

          {/* Closed Captions Button */}
          <button
            type="button"
            onClick={() => setCaptionsOpen((v) => !v)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all ${
              captionsOpen
                ? 'border-[#2ee6a6]/40 bg-[#2ee6a6]/15 text-[#2ee6a6]'
                : 'border-white/10 bg-white/[0.06] text-white/60 hover:text-white'
            }`}
          >
            <ClosedCaptionsIcon size={16} />
            <span>CC</span>
          </button>

          {/* Noise filter */}
          <button
            type="button"
            onClick={() => setNoiseFilterEnabled(!noiseFilterEnabled)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all ${
              noiseFilterEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-white/10 bg-white/[0.06] text-white/50'
            }`}
          >
            <ShieldCheckIcon size={16} />
            <span>Filter</span>
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
          >
            <SettingsIcon size={17} />
          </button>

          <div className="h-5 w-px bg-white/10 mx-1" />

          {/* Leave Button */}
          <button
            type="button"
            onClick={() => setConfirmLeaveOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-4 text-[12px] font-medium text-red-300 hover:bg-red-500/25"
          >
            <PhoneOffIcon size={16} />
            <span>Leave</span>
          </button>
        </motion.footer>
      </div>

      {/* Leave Modal */}
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
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15 text-red-400">
                  <PhoneOffIcon size={24} />
                </div>
                <h3 className="text-lg font-bold">Conclude Interview Session?</h3>
                <p className="text-xs text-neutral-400">
                  Are you sure you want to end your interview? Once disconnected, your session will conclude.
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
                    onClick={() => setConfirmLeaveOpen(false)}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-semibold text-white"
                  >
                    End &amp; Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EcoDevPreview() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      <div className="mx-auto mb-5 flex max-w-[1500px] items-center gap-3">
        <h1 className="text-lg font-semibold text-white">/ai-interview — dev preview</h1>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
          mock harness — no LiveKit required
        </span>
        <div className="flex-1" />
        {(['both', 'video', 'audio'] as const).map((s) => (
          <a
            key={s}
            href={`/ai-interview/preview?state=${s}`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10"
          >
            {s}
          </a>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-6">
        <PreviewFor state="video" />
        <PreviewFor state="audio" />
      </div>
    </div>
  );
}

function PreviewFor({ state }: { state: 'video' | 'audio' }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-neutral-400">
        Eco tile:{' '}
        <span className="text-neutral-200">
          {state === 'video' ? 'intro video clip playing' : 'video off — neural voice orb & wavy background'}
        </span>
      </h2>
      <Screen showVideo={state === 'video'} />
    </section>
  );
}
