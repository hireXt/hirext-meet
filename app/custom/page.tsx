import { videoCodecs } from 'livekit-client';
import { VideoConferenceClientImpl } from './VideoConferenceClientImpl';
import { isVideoCodec } from '@/lib/types';

/**
 * Decode the MuseTalk flag from the signed JWT token's payload.
 * The Node server embeds { museTalkEnabled: boolean } in the token metadata,
 * which is HMAC-signed — tampering invalidates the token when LiveKit verifies it.
 */
function decodeMuseTalkFlag(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    // Base64url decode the JWT payload
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    // The Node server sets token.metadata = JSON.stringify({ museTalkEnabled }),
    // which lands in the JWT payload's "metadata" field as a string
    const meta = typeof payload.metadata === 'string' ? JSON.parse(payload.metadata) : payload.metadata;
    return meta?.museTalkEnabled === true;
  } catch {
    return false;
  }
}

export default async function CustomRoomConnection(props: {
  searchParams: Promise<{
    liveKitUrl?: string;
    token?: string;
    codec?: string;
    singlePC?: string;
  }>;
}) {
  const { liveKitUrl, token, codec, singlePC } = await props.searchParams;
  if (typeof liveKitUrl !== 'string') {
    return <h2>Missing server URL</h2>;
  }
  if (typeof token !== 'string') {
    return <h2>Missing token</h2>;
  }
  if (codec !== undefined && !isVideoCodec(codec)) {
    return <h2>Invalid codec, if defined it has to be [{videoCodecs.join(', ')}].</h2>;
  }

  const museTalkEnabled = decodeMuseTalkFlag(token);

  return (
    <main style={{ height: '100%', position: 'relative' }}>
      <VideoConferenceClientImpl
        liveKitUrl={liveKitUrl}
        token={token}
        codec={codec}
        singlePeerConnection={singlePC === 'true'}
        museTalkEnabled={museTalkEnabled}
      />
    </main>
  );
}
