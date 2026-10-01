'use client';

import * as React from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useRoomContext,
  useTracks,
  useTranscriptions,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { AnimatePresence, motion } from 'framer-motion';
import { CustomMediaGate, type MediaGateResult } from '@/lib/ailink/CustomMediaGate';
import './eco.css';

type Props = {
  liveKitUrl: string;
  token: string;
  candidateName?: string;
  isNameFixed?: boolean;
  resultBase?: string;
};

// The avatar joins as its OWN participant (not the agents worker), so its audio
// and the intro-clip video are found by identity, not via useVoiceAssistant().
const ECO_IDENTITY = 'eco-avatar';

const EASE = [0.22, 1, 0.36, 1] as const;
const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.35, ease: EASE },
};

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

function EcoOrb({ bands, speaking }: { bands: number[]; speaking: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const smooth = React.useRef([0, 0, 0, 0]);
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
      for (let i = 0; i < smooth.current.length; i++) smooth.current[i] += ((b[i] ?? 0) - smooth.current[i]) * 0.18;
      const s = smooth.current;
      const energy = (s[0] + s[1] + s[2] + s[3]) / 4;
      const base = Math.min(w, h) * 0.23;
      const t2 = (t += speaking ? 0.045 : 0.02);
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
      fill.addColorStop(0, '#5cf5bd');
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
      const gap = Math.max(16 * dpr, w / 18);
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
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const connection = useConnectionState();
  const transcriptions = useTranscriptions();
  const publishedRef = React.useRef(false);

  // All local + remote mic/camera tracks; pick the avatar's by identity.
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Camera],
    { onlySubscribed: false },
  );
  const env = (t: TrackReferenceOrPlaceholder) => t.participant?.identity === ECO_IDENTITY;
  const ecoAudio = tracks.find((t) => env(t) && t.source === Track.Source.Microphone);
  const ecoVideo = tracks.find((t) => env(t) && t.source === Track.Source.Camera);
  const localCam = tracks.find((t) => t.participant?.isLocal && t.source === Track.Source.Camera);

  const bands = useMultibandTrackVolume(ecoAudio, { bands: 4, updateInterval: 60 });
  const energy = bands.reduce((a, b) => a + b, 0) / 4;

  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;
    previewTracks.forEach((t) => { room.localParticipant.publishTrack(t).catch(() => {}); });
  }, [connection, previewTracks, room]);

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

  const showVideo = !!ecoVideo;
  const speaking = energy > 0.04;
  const statusWord = speaking ? 'Speaking' : connection === ConnectionState.Connected ? 'Listening' : 'Connecting';

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
        <div className="eco-ended-wrap">
          <motion.div className="eco-ended" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <div className="eco-brand" style={{ fontSize: 20 }}><span className="eco-dot" /> Eco</div>
            <h2>Interview complete</h2>
            <p>Thanks, {candidateName}. You can close this tab.</p>
            {resultBase && <a className="eco-btn" href={resultBase} target="_blank" rel="noreferrer">View your report</a>}
          </motion.div>
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
              <AnimatePresence mode="wait" initial={false}>
                {showVideo ? (
                  <motion.div key="video" className="eco-tile-fill"
                    initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.5, ease: EASE }}>
                    <VideoTrack trackRef={ecoVideo!} />
                  </motion.div>
                ) : (
                  <motion.div key="orb" className="eco-tile-fill eco-tile-orb"
                    initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.5, ease: EASE }}>
                    <EcoOrb bands={bands} speaking={speaking} />
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="eco-tile-label">Eco</span>
            </div>

            <div className="eco-tile eco-you">
              <AnimatePresence mode="wait" initial={false}>
                {localCam ? (
                  <motion.div key="you" className="eco-tile-fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                    <VideoTrack trackRef={localCam} />
                  </motion.div>
                ) : (
                  <motion.div key="off" className="eco-tile-off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>Camera off</motion.div>
                )}
              </AnimatePresence>
              <span className="eco-tile-label">You</span>
            </div>
          </div>

          <div className="eco-convo">
            {lines.length === 0 && <div className="eco-convo-empty">The conversation will appear here as you speak.</div>}
            <AnimatePresence initial={false}>
              {lines.map((l, i) => (
                <motion.div key={`${l.identity}-${i}`} layout
                  className={`eco-msg ${isEco(l.identity) ? 'eco-ai' : 'eco-you'}`}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.02 }}>
                  {isEco(l.identity) && <span className="eco-spark"><Icon d={I.spark} /></span>}
                  <p>{l.text}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="eco-visual"><EcoDots bands={bands} speaking={speaking} /></div>
      </div>

      <AnimatePresence>
        {!sharing && (
          <motion.div className="eco-share-hint"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <Icon d={I.share} />
            <span><b>Share your screen when you&rsquo;re ready.</b> <small>Whole screen or a single window — you can start any time.</small></span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="eco-controls">
        <motion.button whileTap={{ scale: 0.96 }} className={`eco-btn ${isMicrophoneEnabled ? '' : 'eco-off'}`} onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>
          <Icon d={isMicrophoneEnabled ? I.mic : I.micOff} /> {isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} className={`eco-btn ${isCameraEnabled ? '' : 'eco-off'}`} onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}>
          <Icon d={isCameraEnabled ? I.cam : I.camOff} /> {isCameraEnabled ? 'Camera on' : 'Camera off'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} className={`eco-btn ${sharing ? 'eco-primary' : ''}`} onClick={toggleShare}>
          <Icon d={I.share} /> {sharing ? 'Sharing screen' : 'Share screen'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} className="eco-btn eco-danger" onClick={() => room.disconnect()}>
          <Icon d={I.leave} /> Leave
        </motion.button>
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
