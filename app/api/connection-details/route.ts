import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { ConnectionDetails } from '@/lib/types';
import { AccessToken, AccessTokenOptions, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

/** Server-side CSPRNG string (client-utils version needs `window`). */
function serverRandomString(length: number): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(bytes[i] % characters.length);
  }
  return result;
}

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

const COOKIE_KEY = 'random-participant-postfix';

const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Per-IP sliding-window timestamps (in-memory; per server instance).
const rateLimitBuckets = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function pruneTimestamps(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
}

function isRateLimited(ip: string, now: number): { limited: boolean; retryAfterSec: number } {
  const existing = pruneTimestamps(rateLimitBuckets.get(ip) ?? [], now);
  if (existing.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = existing[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    rateLimitBuckets.set(ip, existing);
    return { limited: true, retryAfterSec };
  }
  existing.push(now);
  rateLimitBuckets.set(ip, existing);
  return { limited: false, retryAfterSec: 0 };
}

function logRequest(
  ip: string,
  params: { roomName: string | null; participantName: string | null; region: string | null },
  outcome: string,
  status: number,
) {
  // Minimal structured request logging (no secrets/tokens).
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      route: 'GET /api/connection-details',
      ip,
      roomName: params.roomName,
      participantName: params.participantName,
      region: params.region,
      outcome,
      status,
    }),
  );
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const now = Date.now();
  // Parse query parameters (read early so logs carry context)
  const roomName = request.nextUrl.searchParams.get('roomName');
  const participantName = request.nextUrl.searchParams.get('participantName');
  const metadata = request.nextUrl.searchParams.get('metadata') ?? '';
  const region = request.nextUrl.searchParams.get('region');
  const logParams = { roomName, participantName, region };

  // Per-IP in-memory rate limiting: ~20 req/min (sliding window).
  const rateCheck = isRateLimited(ip, now);
  if (rateCheck.limited) {
    logRequest(ip, logParams, 'rate_limited', 429);
    return new NextResponse('Rate limit exceeded. Try again shortly.', {
      status: 429,
      headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
    });
  }

  try {
    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    const livekitServerUrl = region ? getLiveKitURL(LIVEKIT_URL, region) : LIVEKIT_URL;
    let randomParticipantPostfix = request.cookies.get(COOKIE_KEY)?.value;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    if (typeof roomName !== 'string') {
      logRequest(ip, logParams, 'bad_request_missing_roomName', 400);
      return new NextResponse('Missing required query parameter: roomName', { status: 400 });
    }
    if (participantName === null) {
      logRequest(ip, logParams, 'bad_request_missing_participantName', 400);
      return new NextResponse('Missing required query parameter: participantName', { status: 400 });
    }

    // Generate participant token
    if (!randomParticipantPostfix) {
      randomParticipantPostfix = serverRandomString(4);
    }
    const participantToken = await createParticipantToken(
      {
        identity: `${participantName}__${randomParticipantPostfix}`,
        name: participantName,
        metadata,
      },
      roomName,
    );

    // Return connection details (shape unchanged)
    const data: ConnectionDetails = {
      serverUrl: livekitServerUrl,
      roomName: roomName,
      participantToken: participantToken,
      participantName: participantName,
    };
    logRequest(ip, logParams, 'ok', 200);
    return new NextResponse(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${COOKIE_KEY}=${randomParticipantPostfix}; Path=/; HttpOnly; SameSite=Strict; Secure; Expires=${getCookieExpirationTime()}`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      logRequest(ip, logParams, `error:${error.message}`, 500);
      return new NextResponse(error.message, { status: 500 });
    }
    logRequest(ip, logParams, 'error:unknown', 500);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
  const at = new AccessToken(API_KEY, API_SECRET, userInfo);
  at.ttl = '5m';
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);
  return at.toJwt();
}

function getCookieExpirationTime(): string {
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 60 * 120 * 1000;
  now.setTime(expireTime);
  return now.toUTCString();
}
