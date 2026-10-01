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

/** Deterministic pseudo-audio energy so waves/sparkles move without a real feed. */
function useMockEnergy(active: boolean) {
  const [energy, setEnergy] = React.useState(0.12);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setEnergy(0.12 + Math.abs(Math.sin(Date.now() / 260)) * 0.55 + Math.random() * 0.2);
    }, 90);
    return () => clearInterval(id);
  }, [active]);
  return energy;
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex aspect-video w-full max-h-[42vh] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[#05070a]">
      {children}
      <span className="absolute bottom-3 left-3 z-20 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-[#dfe5ec] backdrop-blur-md">
        {label}
      </span>
    </div>
  );
}

function Screen({ showVideo }: { showVideo: boolean }) {
  const energy = useMockEnergy(true);
  const speaking = energy > 0.35;
  const seconds = 74;

  return (
    <div className="relative isolate flex h-[820px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black font-sans text-[#eef1f5] antialiased">
      <BackgroundBeams />

      <header className="relative z-10 flex shrink-0 items-center gap-3.5 px-6 py-3.5">
        <div className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2ee6a6] shadow-[0_0_0_4px_rgba(46,230,166,0.14),0_0_18px_rgba(46,230,166,0.6)]" />
          Eco <span className="font-medium text-[#9aa3b2]">· AI Interview</span>
        </div>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12.5px] text-[#9aa3b2]">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2ee6a6]" />
          <b className="font-semibold text-[#eef1f5]">{speaking ? 'Speaking' : 'Listening'}</b>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] tabular-nums text-[#9aa3b2]">
          {fmt(seconds)}
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 px-6 pt-2">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid shrink-0 grid-cols-2 gap-4">
            <Tile label="Eco">
              <AnimatePresence mode="wait" initial={false}>
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
            </Tile>

            <Tile label="You">
              <video
                src={YOU_CLIP}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            </Tile>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto py-1.5">
            {MOCK_DIALOGUE.map((line, i) => (
              <motion.div
                key={i}
                className={`flex max-w-[620px] gap-2.5 ${line.eco ? '' : 'ml-14 max-w-[540px]'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: i * 0.05 }}
              >
                {line.eco && (
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
                  words={line.text}
                  staggerDelay={0.04}
                  className={
                    line.eco
                      ? 'text-[15px] leading-relaxed text-[#e7ecf2]'
                      : 'rounded-2xl border border-white/10 bg-white/[0.09] px-3.5 py-2.5 text-[15px] leading-relaxed text-[#cfd6e0]'
                  }
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-6 flex shrink-0 items-center gap-2.5 rounded-xl border border-[#2ee6a6]/30 bg-gradient-to-b from-[#2ee6a6]/10 to-[#2ee6a6]/[0.03] px-3.5 py-2.5 text-[13px] text-[#dfe6ee]">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px] shrink-0 text-[#2ee6a6]">
          <path d="M12 3 7 8h3v4h4V8h3l-5-5ZM5 14h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Z" />
        </svg>
        <span>
          <b className="font-semibold text-[#2ee6a6]">Share your screen when you&rsquo;re ready.</b>{' '}
          <span className="text-[#9aa3b2]">Whole screen or a single window — you can start any time.</span>
        </span>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-center gap-2.5 px-6 pb-5 pt-4">
        {['Mic on', 'Camera on', 'Share screen'].map((t) => (
          <div key={t} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[13.5px] font-medium text-[#eef1f5]">
            {t}
          </div>
        ))}
        <div className="inline-flex items-center gap-2 rounded-xl border border-[#f05252]/40 bg-[#f05252]/10 px-4 py-2.5 text-[13.5px] font-medium text-[#ffb4b4]">
          Leave
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
