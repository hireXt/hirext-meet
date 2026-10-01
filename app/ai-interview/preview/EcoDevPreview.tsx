'use client';

/**
 * Dev-only visual harness for /ai-interview.
 *
 * Renders the real Eco screen shell against mock data so both states can be
 * reviewed and tweaked without a LiveKit room, the eco agent, or a camera:
 *   ?state=video  → Eco tile shows the intro clip (avatar video ON)
 *   ?state=audio  → Eco tile shows WavyBackground (video OFF)
 *   ?state=both   → both stacked, for side-by-side comparison (default)
 *
 * Guarded by NEXT_PUBLIC_ECO_DEV_PREVIEW=1 — in production without that flag
 * this route 404s, so it can never be reached by a candidate.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { WavyBackground } from '@/components/ui/wavy-background';
import { SparklesCore } from '@/components/ui/sparkles';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';

const EASE = [0.22, 1, 0.36, 1] as const;

const MOCK_DIALOGUE = [
  { eco: true, text: 'Hi Veer, good morning. Thanks for making the time — are you ready to begin?' },
  { eco: false, text: 'Yes, ready to go.' },
  {
    eco: true,
    text: 'Great. Tell me about a time you had to ship something quickly. What did you do, and what would you do differently now?',
  },
  { eco: false, text: 'We lost a production incident caused by a bad deploy. I rolled it back in under ten minutes.' },
  { eco: true, text: 'Walk me through the rollback. How did you decide it was the safest option?' },
];

const YOU_CLIP = '/mock/eco-candidate-video.mp4';
const ECO_CLIP = '/mock/eco-avatar-video.mp4';

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Deterministic pseudo-audio energy cycling between speaking bursts and stillness. */
function useMockEnergy(active: boolean) {
  const [energy, setEnergy] = React.useState(0.4);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      // Cycle: 4s of speaking, then 3s of stillness
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
  const seconds = 74;

  return (
    <div className="relative isolate flex h-[820px] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-black font-sans text-[#eef1f5] antialiased shadow-2xl">
      <BackgroundBeams />

      {/* ── Header ── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 md:px-10 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2ee6a6] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2ee6a6] shadow-[0_0_10px_#2ee6a6]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Eco</span>
          <span className="text-[10px] font-medium text-white/40 tracking-[0.14em] uppercase px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            AI Interview
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/70">
            <span className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${speaking ? 'bg-[#2ee6a6] shadow-[0_0_6px_#2ee6a6]' : 'bg-white/30'}`} />
            {speaking ? 'Speaking' : 'Listening'}
          </div>
          <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium tabular-nums text-white/50">
            {fmt(seconds)}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 md:px-8 pb-2 w-full">
        <div className="grid shrink-0 grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* Eco Tile — single double-bezel wrapper for both states */}
          <div className="rounded-[1.75rem] border border-white/[0.06] bg-white/[0.03] p-1.5">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              {showVideo ? (
                <motion.video
                  key="clip"
                  src={ECO_CLIP}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              ) : (
                <>
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
                    <span className={`h-2 w-2 rounded-full transition-all duration-500 ${speaking ? 'bg-[#2ee6a6] shadow-[0_0_8px_#2ee6a6]' : 'bg-white/25'}`} />
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

          {/* Candidate Tile */}
          <div className="rounded-[1.75rem] border border-white/[0.06] bg-white/[0.03] p-1.5">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              <video
                src={YOU_CLIP}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute bottom-3 left-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                You
              </span>
            </div>
          </div>
        </div>

        {/* ── Transcription Area ── */}
        <div className="relative flex min-h-[140px] flex-1 flex-col overflow-hidden rounded-[1.5rem]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden z-0">
            <div className="absolute inset-x-16 top-0 mx-auto h-[2px] w-2/3 bg-gradient-to-r from-transparent via-[#2ee6a6]/80 to-transparent blur-sm" />
            <div className="absolute inset-x-16 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-[#2ee6a6]/60 to-transparent" />
            <div className="absolute inset-x-32 top-0 mx-auto h-[3px] w-1/4 bg-gradient-to-r from-transparent via-[#0fb59a]/70 to-transparent blur-sm" />

            <SparklesCore
              background="transparent"
              minSize={0.3}
              maxSize={1}
              particleDensity={250}
              className="h-full w-full"
              particleColor="#5cf5bd"
            />
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 md:px-6 py-4">
            {MOCK_DIALOGUE.map((line, i) => (
              <motion.div
                key={i}
                className={`flex max-w-[620px] items-start gap-2.5 ${line.eco ? '' : 'ml-auto justify-end'}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
              >
                {line.eco && (
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
                  words={line.text}
                  staggerDelay={0.035}
                  className={
                    line.eco
                      ? 'text-[14px] leading-relaxed text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
                      : 'rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-[14px] leading-relaxed text-white/80 backdrop-blur-sm'
                  }
                />
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Screen Share Hint ── */}
      <div className="relative z-10 mx-auto max-w-lg w-[calc(100%-2rem)] flex items-center gap-3 rounded-2xl border border-[#2ee6a6]/20 bg-[#2ee6a6]/[0.06] px-4 py-2.5 text-[11px] text-white/80 backdrop-blur-sm mb-3">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px] shrink-0 text-[#2ee6a6]/80">
          <path d="M12 3 7 8h3v4h4V8h3l-5-5ZM5 14h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Z" />
        </svg>
        <div className="flex-1">
          <span className="font-semibold text-[#2ee6a6]/90">Share your screen when you&rsquo;re ready.</span>{' '}
          <span className="text-white/45">Whole screen or a single window.</span>
        </div>
      </div>

      {/* ── Floating Island Control Bar ── */}
      <div className="relative z-10 flex shrink-0 justify-center px-4 pb-5 pt-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {['Mic', 'Camera', 'Share'].map((t) => (
            <div
              key={t}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[12px] font-medium text-white/90 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.12] cursor-pointer"
            >
              {t}
            </div>
          ))}
          <div className="h-5 w-px bg-white/[0.08] mx-0.5" />
          <div className="inline-flex h-10 items-center gap-2 rounded-full bg-red-500/15 px-5 text-[12px] font-medium text-red-300 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/25 cursor-pointer">
            Leave
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EcoDevPreview() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      <div className="mx-auto mb-5 flex max-w-[1500px] items-center gap-3">
        <h1 className="text-lg font-semibold text-white">/ai-interview — dev preview</h1>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
          mock data — no LiveKit, no camera
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
        Eco tile: <span className="text-neutral-200">{state === 'video' ? 'intro clip playing' : 'video off — wavy background'}</span>
      </h2>
      <Screen showVideo={state === 'video'} />
    </section>
  );
}
