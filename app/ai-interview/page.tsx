import { EcoInterview } from './EcoInterview';

export const dynamic = 'force-dynamic';

/**
 * Dedicated AI-interview screen (Eco).
 *
 * Completely separate from /rooms (normal meeXt meetings) and /custom
 * (MuseTalk talking-head interviews). The Node join endpoint routes eco
 * interviews here; MuseTalk still lands on /custom.
 */
export default async function AiInterviewPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const liveKitUrl = pick('liveKitUrl');
  const token = pick('token');

  if (!liveKitUrl || !token) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#090b0f', color: '#e9ecf2' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontWeight: 600 }}>Missing session</h2>
          <p style={{ color: '#8b93a7' }}>This link is incomplete or has expired. Please rejoin from your interview page.</p>
        </div>
      </main>
    );
  }

  return (
    <EcoInterview
      liveKitUrl={liveKitUrl}
      token={token}
      candidateName={pick('name')}
      isNameFixed={!!pick('name')}
      resultBase={pick('resultBase')}
    />
  );
}
