import { EcoInterview } from './EcoInterview';
import { BackgroundBeams } from '@/components/ui/background-beams';
import './tailwind.css';
import Image from 'next/image';
import { BrandLogo } from '@/lib/ailink/BrandLogo';

export const dynamic = 'force-dynamic';

/**
 * Dedicated Enterprise AI Interview Screen (HireXt Eco).
 * Minimalist broken URL state with ambient background.
 */
export default async function AiInterviewPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);

  const liveKitUrl = pick('liveKitUrl');
  const token = pick('token');
  const candidateName = pick('name');
  const interviewTitle = pick('title') || pick('role') || 'Assessment';
  const companyName = pick('company') || 'HireXt';
  const resultBase = pick('resultBase');

  if (!liveKitUrl || !token) {
    return (
      <main className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black font-sans antialiased p-6">
        {/* Ambient atmospheric backdrop */}
        <BackgroundBeams />

        {/* Ambient radial lighting */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-eco-accent/10 blur-[130px]" />

        {/* Minimal Centered Content */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-3">
          <Image
            src="/images/broken-links.png"
            alt="HireXt Eco Logo"
            className="mb-2 w-28 h-28 object-contain"
            width={100}
            height={100}
            priority
          />
          <h1 className="text-xl font-medium tracking-wide text-neutral-200">URL Broken</h1>
          <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
            The interview link is invalid or missing session parameters. Please verify the URL
            provided in your invitation.
          </p>
        </div>

        <div className="absolute bottom-6 left-6 flex flex-col items-start space-y-1">
          <BrandLogo theme="light" className="scale-50 text-white!" showText={false} />
          <span className="text-xs text-neutral-500">
            meeXt by HireXt &copy; {new Date().getFullYear()}
          </span>
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
