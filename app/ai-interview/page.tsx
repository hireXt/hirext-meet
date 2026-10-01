import Link from 'next/link';
import { EcoInterview } from './EcoInterview';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { BrandLogo } from '@/lib/ailink/BrandLogo';
import { ShieldCheckIcon, WarningIcon } from '@/lib/ailink/icons';
import './tailwind.css';

export const dynamic = 'force-dynamic';

/**
 * Dedicated Enterprise AI Interview Screen (HireXt Eco).
 *
 * Provides real-time multimodal evaluation with AI avatar / neural voice synthesis,
 * live automated transcription, low-latency audio processing, and screen sharing.
 */
export default async function AiInterviewPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const liveKitUrl = pick('liveKitUrl');
  const token = pick('token');
  const candidateName = pick('name');
  const interviewTitle = pick('title') || pick('role') || 'AI Technical Assessment';
  const companyName = pick('company') || 'HireXt';
  const resultBase = pick('resultBase');

  const isDevOrPreview =
    process.env.NEXT_PUBLIC_ECO_DEV_PREVIEW === '1' || process.env.NODE_ENV === 'development';

  if (!liveKitUrl || !token) {
    return (
      <main className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black font-sans text-eco-fg antialiased p-4 sm:p-6">
        {/* Ambient atmospheric backdrop */}
        <BackgroundBeams />

        {/* Ambient radial lighting */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-eco-accent/10 blur-[130px]" />

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-6">
          {/* Brand header */}
          <div className="flex items-center gap-3">
            <BrandLogo theme="dark" size={32} />
            <span className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eco-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-eco-accent shadow-[0_0_8px_#2ee6a6]" />
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-eco-accent">
                Eco AI Interview
              </span>
            </div>
          </div>

          {/* Elevated Glass Card */}
          <div className="w-full rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-col items-center gap-5 rounded-[calc(2rem-0.375rem)] bg-neutral-950/70 p-6 sm:p-8 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.2)]">
                <WarningIcon size={26} />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Session Key Required
                </h1>
                <p className="text-xs sm:text-sm leading-relaxed text-eco-muted">
                  This interview requires an active authorization token and server URL. Please use
                  the unique personalized link provided in your candidate invitation email.
                </p>
              </div>

              {/* Status checklist */}
              <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left text-xs space-y-2.5">
                <div className="flex items-center justify-between text-white/70">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    LiveKit Session URL
                  </span>
                  <span className="font-mono text-[11px] text-red-400">Missing</span>
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    Security Access Token
                  </span>
                  <span className="font-mono text-[11px] text-red-400">Missing</span>
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-eco-accent" />
                    AI Neural Engine
                  </span>
                  <span className="font-mono text-[11px] text-eco-accent">Online</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex w-full flex-col gap-3 pt-2">
                {isDevOrPreview && (
                  <Link
                    href="/ai-interview/preview"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-eco-accent px-5 text-xs font-semibold text-neutral-950 shadow-[0_0_20px_rgba(46,230,166,0.3)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(46,230,166,0.5)] active:scale-[0.98]"
                  >
                    <span>Launch Developer Preview (Mock Room)</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-neutral-950/20 px-1.5 py-0.5 rounded">
                      Demo
                    </span>
                  </Link>
                )}

                <Link
                  href="/"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white active:scale-[0.98]"
                >
                  Return to meeXt Home
                </Link>
              </div>

              {/* Security notice */}
              <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-white/40">
                <ShieldCheckIcon size={14} className="text-emerald-400" />
                <span>End-to-End Encrypted Session · ISO 27001 Certified</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <EcoInterview
      liveKitUrl={liveKitUrl}
      token={token}
      candidateName={candidateName}
      isNameFixed={!!candidateName}
      resultBase={resultBase}
      interviewTitle={interviewTitle}
      companyName={companyName}
    />
  );
}
