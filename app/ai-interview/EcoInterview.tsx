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

const I = {
  mic: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-4 4.9V20h3v1H8v-1h3v-3.1A5 5 0 0 1 7 12h2a3 3 0 0 0 6 0h2Z" />,
  micOff: <path d="M3.3 2.3 2 3.6 8 9.6V12a4 4 0 0 0 5.8 3.6l1.2 1.2A6 6 0 0 1 6 12H4a8 8 0 0 0 7 7.9V22H8v1h8v-1h-3v-2.1c.9-.1 1.8-.4 2.5-.9l3.4 3.4 1.3-1.3L3.3 2.3ZM16 12a4 4 0 0 0-.2-1.2l-1.6-1.6c0 .3.1.6.1.9v.1a2.4 2.4 0 0 1-2.7 2.4l1.3 1.3c.1 0 .2 0 .3 0A4 4 0 0 0 16 12Zm4 0h-2a5.9 5.9 0 0 1-1.2 3.6l1.5 1.5A7.9 7.9 0 0 0 20 12Z" />,
  cam: <path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
  camOff: <path d="M3.3 2.3 2 3.6l2.4 2.4H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10c.5 0 1-.2 1.4-.5l3.3 3.3 1.3-1.3L3.3 2.3ZM14 10.5l4-2.5v7l-2.5-1.6L14 12v-1.5Zm-2 5.1L6 9.6V15c0 .6.4 1 1 1h5Z" />,
  share: <path d="M12 3 7 8h3v4h4V8h3l-5-5ZM5 14h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Z" />,
  leave: <path d="M2 4h9v16H2V4Zm12.6 3.4L13.2 8.8 15.4 11H8v2h7.4l-2.2 2.2 1.4 1.4L20 12l-5.4-4.6Z" />,
  spark: <path d="M12 2c.5 3.4 2.1 5 5.5 5.5-3.4.5-5 2.1-5.5 5.5-.5-3.4-2.1-5-5.5-5.5C9.9 7 11.5 5.4 12 2Zm6.5 11c.25 1.7 1.05 2.5 2.75 2.75-1.7.25-2.5 1.05-2.75 2.75-.25-1.7-1.05-2.5-2.75-2.75 1.7-.25 2.5-1.05 2.75-2.75Z" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>{d}</svg>;
}

/** Green audio-reactive sphere (audio-only state). */
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
      const size = canvas.clientWidth || 320;
      if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
      const b = bandsRef.current;
      for (let i = 0; i < smooth.current.length; i++) smooth.current[i] += ((b[i] ?? 0) - smooth.current[i]) * 0.2;
      const s = smooth.current;
      const energy = (s[0] + s[1] + s[2] + s[3]) / 4;
      const base = Math.min(w, h) * 0.22;
      const t2 = (t += speaking ? 0.05 : 0.022);
      ctx.clearRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 2.4);
      glow.addColorStop(0, `rgba(46,230,166,${0.16 + energy * 0.3})`);
      glow.addColorStop(1, 'rgba(5,6,7,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      const pts = 160;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wob = s[0]*0.5*Math.sin(3*a + t2*1.1) + s[1]*0.42*Math.sin(5*a - t2*1.4) + s[2]*0.34*Math.sin(8*a + t2*1.9) + s[3]*0.28*Math.sin(12*a - t2*2.3);
        const r = base * (1 + wob * 0.45 + energy * 0.12);
        const x = cx + Math.cos(a) * r * 1.06;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const fill = ctx.createLinearGradient(cx - base, cy - base, cx + base, cy + base);
      fill.addColorStop(0, '#4ef2b6');
      fill.addColorStop(0.55, '#22d3a0');
      fill.addColorStop(1, '#0ea5e9');
      ctx.fillStyle = fill;
      ctx.shadowColor = 'rgba(46,230,166,0.5)';
      ctx.shadowBlur = 30 + energy * 70;
      ctx.fill();
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  return <canvas ref={ref} className="eco-orb-canvas" aria-hidden />;
}

/** Teal dot-grid that reacts to the interviewer's voice. */
function EcoDots({ bands, speaking }: { bands: number[]; speaking: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
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
      const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
      if (!w0 || !h0) { raf = requestAnimationFrame(render); return; }
      if (canvas.width !== w0 * dpr) { canvas.width = w0 * dpr; canvas.height = h0 * dpr; }
      const w = canvas.width, h = canvas.height;
      const b = bandsRef.current;
      const energy = (b[0] + b[1] + b[2] + b[3]) / 4;
      t += 0.02 + energy * 0.05 + (speaking ? 0.02 : 0);
      ctx.clearRect(0, 0, w, h);
      const gap = Math.max(16 * dpr, w / 20);
      const base = gap * 0.2;
      const cols = Math.floor(w / gap), rows = Math.floor(h / gap);
      const offX = (w - cols * gap) / 2 + gap / 2;
      const offY = (h - rows * gap) / 2 + gap / 2;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = offX + i * gap, y = offY + j * gap;
          const wave = 0.5 + 0.5 * Math.sin(i * 0.55 + t) * Math.cos(j * 0.45 - t * 0.8);
          const r = base * (0.5 + wave * 0.9 + energy * 1.1);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6 * dpr, r), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(15,181,154,${0.22 + wave * 0.5})`;
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  return <canvas ref={ref} aria-hidden />;
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

  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;
    previewTracks.forEach((t) => { room.localParticipant.publishTrack(t).catch(() => {}); });
  }, [connection, previewTracks, room]);

  const bands = useMultibandTrackVolume(audioTrack, { bands: 4, updateInterval: 60 });

  const [seconds, setSeconds] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const hasConnected = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (connection === ConnectionState.Connected) hasConnected.current = true;
    else if (connection === ConnectionState.Disconnected && hasConnected.current) setEnded(true);
  }, [connection]);

  const speaking = state === 'speaking';
  const statusWord = state === 'speaking' ? 'Speaking' : state === 'thinking' ? 'Thinking' : state === 'initializing' ? 'Connecting' : 'Listening';

  const lines = (transcriptions as any[])
    .map((t) => ({
      text: String(t?.text ?? '').trim(),
      identity: String(t?.participantInfo?.identity ?? t?.participantIdentity ?? ''),
    }))
    .filter((l) => l.text);
  const isEco = (id: string) => id === ECO_IDENTITY || id.startsWith('agent');

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch { /* cancelled */ }
  };

  if (ended) {
    return (
      <div className="eco-root">
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div className="eco-brand" style={{ fontSize: 20 }}><span className="eco-dot" /> Eco</div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Interview complete</h2>
            <p style={{ color: 'var(--eco-muted)', margin: 0 }}>Thanks, {candidateName}. You can close this tab.</p>
            {resultBase && <a className="eco-btn" href={resultBase} target="_blank" rel="noreferrer">View your report</a>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="eco-root">
      <header className="eco-top">
        <div className="eco-brand"><span className="eco-dot" /> Eco <small>· AI Interview</small></div>
        <div className="eco-spacer" />
        <div className="eco-state"><span className="eco-pulse" /> <b>{statusWord}</b></div>
        <div className="eco-timer">{fmt(seconds)}</div>
      </header>

      <div className="eco-body">
        <div className="eco-main">
          <div className="eco-tiles">
            <div className="eco-tile eco-ai">
              {videoTrack ? <VideoTrack trackRef={videoTrack} /> : <EcoOrb bands={bands} speaking={speaking} />}
              <span className="eco-tile-label">Eco</span>
            </div>
            <div className="eco-tile eco-you">
              {localCam ? <VideoTrack trackRef={localCam} /> : <div className="eco-tile-off">Camera off</div>}
              <span className="eco-tile-label">You</span>
            </div>
          </div>

          <div className="eco-convo">
            {lines.length === 0 && <div className="eco-convo-empty">The conversation will appear here as you speak.</div>}
            {lines.map((l, i) =>
              isEco(l.identity) ? (
                <div key={i} className="eco-msg eco-ai">
                  <span className="eco-spark"><Icon d={I.spark} /></span>
                  <p>{l.text}</p>
                </div>
              ) : (
                <div key={i} className="eco-msg eco-you"><p>{l.text}</p></div>
              ),
            )}
          </div>
        </div>

        <aside className="eco-visual">
          <EcoDots bands={bands} speaking={speaking} />
        </aside>
      </div>

      {!sharing && (
        <div className="eco-share-hint">
          <Icon d={I.share} />
          <span><b>Share your screen when you&rsquo;re ready.</b> <small>Whole screen or a single window — you can start any time.</small></span>
        </div>
      )}

      <div className="eco-controls">
        <button className={`eco-btn ${isMicrophoneEnabled ? '' : 'eco-off'}`} onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>
          <Icon d={isMicrophoneEnabled ? I.mic : I.micOff} /> {isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
        </button>
        <button className={`eco-btn ${isCameraEnabled ? '' : 'eco-off'}`} onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}>
          <Icon d={isCameraEnabled ? I.cam : I.camOff} /> {isCameraEnabled ? 'Camera on' : 'Camera off'}
        </button>
        <button className={`eco-btn ${sharing ? 'eco-primary' : ''}`} onClick={toggleShare}>
          <Icon d={I.share} /> {sharing ? 'Sharing screen' : 'Share screen'}
        </button>
        <button className="eco-btn eco-danger" onClick={() => room.disconnect()}>
          <Icon d={I.leave} /> Leave
        </button>
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
          onReady={(r) => { setError(null); setGate(r); }}
          onError={setError}
        />
        {error && <div style={{ padding: 20, color: 'var(--eco-muted)' }}>Camera & microphone are required to start.</div>}
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
