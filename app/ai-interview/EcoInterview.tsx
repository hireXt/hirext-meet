'use client';

import * as React from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useTranscriptions,
  useTracks,
  useRoomContext,
  useVoiceAssistant,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { CustomMediaGate, type MediaGateResult } from '@/lib/ailink/CustomMediaGate';
import './eco.css';

type Props = {
  liveKitUrl: string;
  token: string;
  candidateName?: string;
  isNameFixed?: boolean;
  resultBase?: string;
};

const ECO_IDENTITY = 'eco-avatar';

/** Small inline icons (kept local so the eco screen has no Meet imports). */
const I = {
  mic: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-4 4.9V20h3v1H8v-1h3v-3.1A5 5 0 0 1 7 12h2a3 3 0 0 0 6 0h2Z" />,
  micOff: <path d="M3.3 2.3 2 3.6 8 9.6V12a4 4 0 0 0 5.8 3.6l1.2 1.2A6 6 0 0 1 6 12H4a8 8 0 0 0 7 7.9V22H8v1h8v-1h-3v-2.1c.9-.1 1.8-.4 2.5-.9l3.4 3.4 1.3-1.3L3.3 2.3ZM16 12a4 4 0 0 0-.2-1.2l-1.6-1.6c0 .3.1.6.1.9v.1a2.4 2.4 0 0 1-2.7 2.4l1.3 1.3c.1 0 .2 0 .3 0A4 4 0 0 0 16 12Zm4 0h-2a5.9 5.9 0 0 1-1.2 3.6l1.5 1.5A7.9 7.9 0 0 0 20 12Z" />,
  cam: <path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
  camOff: <path d="M3.3 2.3 2 3.6l2.4 2.4H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10c.5 0 1-.2 1.4-.5l3.3 3.3 1.3-1.3L3.3 2.3ZM14 10.5l4-2.5v7l-2.5-1.6L14 12v-1.5Zm-2 5.1L6 9.6V15c0 .6.4 1 1 1h5Z" />,
  share: <path d="M12 3 7 8h3v4h4V8h3l-5-5ZM5 14h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Z" />,
  leave: <path d="M2 4h9v16H2V4Zm12.6 3.4L13.2 8.8 15.4 11H8v2h7.4l-2.2 2.2 1.4 1.4L20 12l-5.4-4.6Z" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>{d}</svg>;
}

/** Audio-reactive blob. Reads `bands` (low→high energy) and draws a wobbling
 *  metaball-ish shape in the eco accent. Self-contained (canvas). */
function EcoOrb({ bands, speaking }: { bands: number[]; speaking: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const smooth = React.useRef<number[]>([0, 0, 0, 0]);
  const bandsRef = React.useRef(bands);
  bandsRef.current = bands;

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const render = () => {
      const size = canvas.clientWidth || 480;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const b = bandsRef.current;
      for (let i = 0; i < smooth.current.length; i++) {
        smooth.current[i] += ((b[i] ?? 0) - smooth.current[i]) * 0.2;
      }
      const s = smooth.current;
      const energy = (s[0] + s[1] + s[2] + s[3]) / 4;
      const base = Math.min(w, h) * 0.22;
      const t2 = (t += speaking ? 0.05 : 0.022);

      ctx.clearRect(0, 0, w, h);

      // glow
      const glow = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 2.6);
      glow.addColorStop(0, `rgba(46,230,166,${0.18 + energy * 0.35})`);
      glow.addColorStop(0.5, 'rgba(14,165,233,0.10)');
      glow.addColorStop(1, 'rgba(9,11,15,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // wobbly closed shape
      const pts = 160;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wob =
          s[0] * 0.5 * Math.sin(3 * a + t2 * 1.1) +
          s[1] * 0.42 * Math.sin(5 * a - t2 * 1.4) +
          s[2] * 0.34 * Math.sin(8 * a + t2 * 1.9) +
          s[3] * 0.28 * Math.sin(12 * a - t2 * 2.3);
        const r = base * (1 + wob * 0.45 + energy * 0.12);
        const x = cx + Math.cos(a) * r * 1.06;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const fill = ctx.createLinearGradient(cx - base, cy - base, cx + base, cy + base);
      fill.addColorStop(0, '#3df0b0');
      fill.addColorStop(0.55, '#18c98f');
      fill.addColorStop(1, '#0ea5e9');
      ctx.fillStyle = fill;
      ctx.shadowColor = 'rgba(46,230,166,0.55)';
      ctx.shadowBlur = 40 + energy * 90;
      ctx.fill();
      ctx.shadowBlur = 0;

      // inner highlight
      ctx.beginPath();
      ctx.arc(cx - base * 0.28, cy - base * 0.3, base * 0.5, 0, Math.PI * 2);
      const hi = ctx.createRadialGradient(cx - base * 0.28, cy - base * 0.3, 0, cx - base * 0.28, cy - base * 0.3, base * 0.6);
      hi.addColorStop(0, 'rgba(255,255,255,0.35)');
      hi.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hi;
      ctx.fill();

      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  return <canvas ref={ref} className="eco-orb-canvas" aria-hidden />;
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
  const { state, audioTrack, videoTrack } = useVoiceAssistant();
  const transcriptions = useTranscriptions();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const connection = useConnectionState();
  const camTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const localCam = camTracks.find((t) => t.participant?.isLocal);
  const publishedRef = React.useRef(false);

  // Publish the tracks the pre-join gate acquired (mic + camera). Done here
  // rather than via LiveKitRoom's audio/video props because getUserMedia must
  // stay tied to the gate's click gesture.
  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;
    previewTracks.forEach((t) => {
      room.localParticipant.publishTrack(t).catch(() => {});
    });
  }, [connection, previewTracks, room]);

  const bands = useMultibandTrackVolume(audioTrack, {
    bands: 4,
    updateInterval: 60,
  });

  const [seconds, setSeconds] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const hasConnected = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    // useConnectionState() starts as 'disconnected' before connect() runs, so
    // only treat a disconnect as "ended" after we were actually connected.
    if (connection === ConnectionState.Connected) {
      hasConnected.current = true;
    } else if (connection === ConnectionState.Disconnected && hasConnected.current) {
      setEnded(true);
    }
  }, [connection]);

  const speaking = state === 'speaking';
  const statusWord =
    state === 'speaking' ? 'Speaking' : state === 'thinking' ? 'Thinking' : state === 'initializing' ? 'Connecting' : 'Listening';

  // Current question = the most recent interviewer line ending in '?'.
  const lines = (transcriptions as any[]).map((t) => ({
    text: String(t?.text ?? '').trim(),
    identity: String(t?.participantInfo?.identity ?? t?.participantIdentity ?? ''),
  }));
  const isEco = (id: string) => id === ECO_IDENTITY || id.startsWith('agent');
  const question = [...lines].reverse().find((l) => isEco(l.identity) && l.text.includes('?'))?.text;

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch {
      /* user cancelled the picker */
    }
  };

  if (ended) {
    return (
      <div className="eco-root">
        <div className="eco-center">
          <div className="eco-ended">
            <div className="eco-brand" style={{ fontSize: 20 }}>
              <span className="eco-dot" /> Eco
            </div>
            <h2>Interview complete</h2>
            <p style={{ color: 'var(--eco-muted)', margin: 0 }}>Thanks, {candidateName}. You can close this tab.</p>
            {resultBase && (
              <a className="eco-btn" href={resultBase} target="_blank" rel="noreferrer">
                View your report
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="eco-root">
      <header className="eco-top">
        <div className="eco-brand">
          <span className="eco-dot" /> Eco <small>· AI Interview</small>
        </div>
        <div className="eco-spacer" />
        <div className="eco-state">
          <span className="eco-pulse" /> <b>{statusWord}</b>
        </div>
        <div className="eco-timer">{fmt(seconds)}</div>
      </header>

      <div className="eco-main">
        <section className="eco-stage">
          {videoTrack ? (
            <div className="eco-video-wrap">
              <VideoTrack trackRef={videoTrack} />
            </div>
          ) : (
            <EcoOrb bands={bands} speaking={speaking} />
          )}

          {!sharing && !videoTrack && (
            <div className="eco-share-card">
              <span className="eco-share-ico">
                <Icon d={I.share} />
              </span>
              <p>
                <b>Share your screen when you&rsquo;re ready.</b>
                <br />
                <small>Share the whole screen or a single window — you can start any time.</small>
              </p>
            </div>
          )}

          <div className="eco-stage-name">
            <span className="eco-dot" style={{ width: 8, height: 8, background: 'var(--eco-accent)', borderRadius: 999 }} />
            <b>Eco</b> {speaking ? 'is speaking…' : 'is listening…'}
          </div>
        </section>

        <aside className="eco-aside">
          <div className="eco-card">
            <div className="eco-card-head">
              <h3>Current question</h3>
            </div>
            <div className="eco-question">
              <span className="eco-q-label">Eco asks</span>
              <p>{question || 'Your interviewer will ask the first question shortly…'}</p>
            </div>
          </div>

          <div className="eco-card" style={{ flex: 1, minHeight: 0 }}>
            <div className="eco-card-head">
              <h3>Live transcript</h3>
            </div>
            <div className="eco-transcript">
              {lines.length === 0 && <div className="eco-empty">The transcript will appear here as you speak.</div>}
              {lines.map((l, i) => (
                <div key={i} className={`eco-line ${isEco(l.identity) ? 'eco-eco' : 'eco-you'}`}>
                  <span className="eco-who">{isEco(l.identity) ? 'Eco' : 'You'}</span>
                  <p>{l.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="eco-controls">
        <button
          className={`eco-btn ${isMicrophoneEnabled ? '' : 'eco-off'}`}
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Icon d={isMicrophoneEnabled ? I.mic : I.micOff} /> {isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
        </button>
        <button
          className={`eco-btn ${isCameraEnabled ? '' : 'eco-off'}`}
          onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        >
          <Icon d={isCameraEnabled ? I.cam : I.camOff} /> {isCameraEnabled ? 'Camera on' : 'Camera off'}
        </button>
        <button className={`eco-btn ${sharing ? 'eco-primary' : ''}`} onClick={toggleShare}>
          <Icon d={I.share} /> {sharing ? 'Sharing screen' : 'Share screen'}
        </button>
        <button className="eco-btn eco-danger" onClick={() => room.disconnect()}>
          <Icon d={I.leave} /> Leave
        </button>
      </div>

      <div className="eco-pip">
        {localCam ? (
          <VideoTrack trackRef={localCam} />
        ) : (
          <div className="eco-pip-off">Camera off</div>
        )}
      </div>
    </div>
  );
}

export function EcoInterview(props: Props) {
  const [gate, setGate] = React.useState<MediaGateResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  if (!gate) {
    return (
      <div className="eco-root">
        <CustomMediaGate
          defaultUsername={props.candidateName}
          isNameFixed={props.isNameFixed}
          onReady={(r) => {
            setError(null);
            setGate(r);
          }}
          onError={setError}
        />
        {error && <div className="eco-center">Camera & microphone are required to start.</div>}
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
