'use client';

import * as React from 'react';
import {
  Track,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  type Room,
} from 'livekit-client';

/**
 * Candidate-side interview recording.
 *
 * The interview is recorded in the candidate's own browser: a 640x360 composite
 * of the AI interviewer (left) and the candidate (right) with the two audio
 * streams mixed, produced by MediaRecorder and posted to the Node API in ~5s
 * WebM chunks. Nothing runs on the LiveKit SFU — recording therefore adds no
 * CPU to the interview infrastructure, which has to keep 30 concurrent sessions
 * smooth — only a few hundred kbps of upload per candidate.
 *
 * If the connection cannot sustain the stream the recorder silently switches to
 * buffering locally and posts the whole file once at the end, so a poor network
 * degrades the upload instead of losing the recording. Either way the candidate
 * gets their own copy downloaded to their machine the moment the interview ends,
 * with no network involved.
 */

export type InterviewRecorderStatus =
  | 'off' // not enabled here (phone, or the server handed out no token)
  | 'recording'
  | 'saving'
  | 'saved' // uploaded to the server AND downloaded to the candidate
  | 'device-only'; // downloaded locally, but the server copy failed

const OUT_W = 640;
const OUT_H = 360;
const FPS = 15;
const VIDEO_BPS = 400_000;
const AUDIO_BPS = 48_000;
const TIMESLICE_MS = 5000;
// The eco interview is capped server-side at 15 minutes. Recording stops well
// past that so a stuck session cannot grow browser memory without bound.
const MAX_RECORDING_MS = 20 * 60 * 1000;

const MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function timestampSuffix(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

type Sources = {
  candidate: LocalVideoTrack | null;
  mic: LocalAudioTrack | null;
  interviewer: RemoteVideoTrack | null;
  voice: RemoteAudioTrack | null;
};

type RecorderHandle = { stop: () => void };
type Outcome = 'saved' | 'device-only';

function resolveSources(room: Room): Sources {
  const local = room.localParticipant;
  const candidate =
    (local?.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined) ?? null;
  const mic =
    (local?.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined) ??
    null;

  // The AI interviewer is the remote participant. Eco ships her audio-only, so
  // the video track is usually absent and the panel falls back to her still.
  let interviewer: RemoteVideoTrack | null = null;
  let voice: RemoteAudioTrack | null = null;
  room.remoteParticipants?.forEach((p) => {
    const v = p.getTrackPublication(Track.Source.Camera)?.track as RemoteVideoTrack | undefined;
    const a = p.getTrackPublication(Track.Source.Microphone)?.track as RemoteAudioTrack | undefined;
    if (v && !interviewer) interviewer = v;
    if (a && !voice) voice = a;
  });
  return { candidate, mic, interviewer, voice };
}

/**
 * Builds and starts the composite recorder. Returns a handle whose `stop()`
 * ends the capture, downloads the candidate's copy and stores it server-side.
 */
function startCompositeRecorder(opts: {
  room: Room;
  apiBase: string;
  sessionId: string;
  recordToken: string;
  interviewerName: string;
  candidateName: string;
  onFinish: (outcome: Outcome) => void;
}): RecorderHandle {
  const { room, apiBase, sessionId, recordToken, interviewerName, candidateName, onFinish } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');

  // Detached <video> elements: the composite reads frames from these, so a
  // screen-share takeover or an on-screen remount cannot interrupt recording.
  const candidateEl = document.createElement('video');
  const interviewerEl = document.createElement('video');
  for (const el of [candidateEl, interviewerEl]) {
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
  }

  const avatar = typeof Image !== 'undefined' ? new Image() : null;
  if (avatar) avatar.src = '/images/eco-avatar.png';

  const startedAt = Date.now();
  const parts: Blob[] = [];
  const queue: Blob[] = [];

  // ── Audio mix: candidate mic + interviewer voice → one track ───────────────
  // A MediaStreamAudioDestinationNode only captures, it never plays, so the
  // candidate does not hear themselves twice.
  const AudioCtor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  let ac: AudioContext | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let micGain: GainNode | null = null;
  let voiceGain: GainNode | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let voiceSource: MediaStreamAudioSourceNode | null = null;
  let wiredMic: MediaStreamTrack | null = null;
  let wiredVoice: MediaStreamTrack | null = null;
  let recorder: MediaRecorder | null = null;
  let pumping = false;
  let streamingHealthy = true;
  let streamedRequests = 0;
  let finished = false;
  let stopped = false;
  let raf = 0;
  let timer = 0;
  let lastSync = 0;

  const initAudio = () => {
    if (ac || !AudioCtor) return;
    try {
      ac = new AudioCtor();
      const mix = ac.createGain();
      mix.gain.value = 1;
      destination = ac.createMediaStreamDestination();
      mix.connect(destination);
      micGain = ac.createGain();
      micGain.gain.value = 1;
      micGain.connect(mix);
      voiceGain = ac.createGain();
      voiceGain.gain.value = 1;
      voiceGain.connect(mix);
      void ac.resume?.().catch(() => {});
    } catch {
      ac = null;
      destination = null;
    }
  };

  const wire = (
    current: MediaStreamTrack | null,
    wired: MediaStreamTrack | null,
    gain: GainNode | null,
    existing: MediaStreamAudioSourceNode | null,
  ): { source: MediaStreamAudioSourceNode | null; track: MediaStreamTrack | null } => {
    if (!ac || !current || current === wired || current.readyState === 'ended') {
      return { source: existing, track: wired };
    }
    try {
      existing?.disconnect();
    } catch {}
    try {
      const source = ac.createMediaStreamSource(new MediaStream([current]));
      if (gain) source.connect(gain);
      return { source, track: current };
    } catch {
      return { source: null, track: null };
    }
  };

  const syncAudio = (s: Sources) => {
    if (!ac) return;
    {
      const r = wire(s.mic?.mediaStreamTrack ?? null, wiredMic, micGain, micSource);
      micSource = r.source;
      wiredMic = r.track;
    }
    {
      const r = wire(s.voice?.mediaStreamTrack ?? null, wiredVoice, voiceGain, voiceSource);
      voiceSource = r.source;
      wiredVoice = r.track;
    }
  };

  // ── Composite ──────────────────────────────────────────────────────────────
  const bind = (el: HTMLVideoElement, track: { mediaStreamTrack: MediaStreamTrack } | null) => {
    const mst = track?.mediaStreamTrack;
    if (!mst) return;
    const bound = (el.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (bound === mst) return;
    el.srcObject = new MediaStream([mst]);
    void el.play().catch(() => {});
  };

  const drawPane = (
    video: HTMLVideoElement,
    still: HTMLImageElement | null,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean => {
    if (!ctx) return false;
    const live: CanvasImageSource | null =
      video.videoWidth > 0 && video.readyState >= 2 ? video : null;
    const source: CanvasImageSource | null = live ?? (still && still.complete && still.naturalWidth ? still : null);
    if (!source) return false;
    const sw = live ? video.videoWidth : (still?.naturalWidth ?? 0);
    const sh = live ? video.videoHeight : (still?.naturalHeight ?? 0);
    if (!sw || !sh) return false;
    const scale = Math.max(w / sw, h / sh);
    ctx.save();
    ctx.drawImage(source, x + (w - sw * scale) / 2, y + (h - sh * scale) / 2, sw * scale, sh * scale);
    ctx.restore();
    return true;
  };

  const drawLabel = (text: string, x: number, y: number) => {
    if (!ctx) return;
    ctx.save();
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, sans-serif';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    const round = (ctx as unknown as { roundRect?: Function }).roundRect;
    if (typeof round === 'function') {
      ctx.roundRect(x - 8, y - 15, w + 16, 22, 11);
    } else {
      ctx.rect(x - 8, y - 15, w + 16, 22);
    }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const draw = () => {
    if (!ctx) return;
    const half = OUT_W / 2;

    ctx.fillStyle = '#0b1016';
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (!drawPane(interviewerEl, avatar, 0, 0, half, OUT_H)) {
      // No interviewer video and no still loaded yet: plain panel.
      ctx.fillStyle = '#0b1016';
      ctx.fillRect(0, 0, half, OUT_H);
    }
    if (!drawPane(candidateEl, null, half, 0, half, OUT_H)) {
      ctx.fillStyle = '#05070b';
      ctx.fillRect(half, 0, half, OUT_H);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(half - 1, 0, 2, OUT_H);

    drawLabel(interviewerName, 12, OUT_H - 14);
    drawLabel(candidateName, half + 12, OUT_H - 14);
  };

  // ── Chunk streaming ────────────────────────────────────────────────────────
  const authHeaders = () => ({
    Authorization: `Bearer ${recordToken}`,
    'Content-Type': 'application/octet-stream',
  });
  const base = `${apiBase}/api/interview/recording/${encodeURIComponent(sessionId)}`;
  const chunkUrl = `${base}/chunk`;
  const uploadUrl = `${base}/upload`;
  const completeUrl = `${base}/complete`;

  const pump = async () => {
    if (pumping || !streamingHealthy) return;
    pumping = true;
    try {
      while (queue.length && streamingHealthy) {
        const part = queue[0];
        const res = await fetch(chunkUrl, { method: 'POST', headers: authHeaders(), body: part });
        if (!res.ok) throw new Error(`chunk ${res.status}`);
        queue.shift();
        streamedRequests += 1;
      }
    } catch {
      // The connection cannot keep up: stop streaming, keep everything in
      // memory and post the whole file at the end. The server overwrites
      // whatever it had already spooled, so nothing is duplicated.
      streamingHealthy = false;
      queue.length = 0;
    } finally {
      pumping = false;
    }
  };

  const drainQueue = async () => {
    for (let i = 0; i < 120 && (pumping || queue.length); i += 1) {
      await new Promise((r) => window.setTimeout(r, 250));
    }
  };

  const teardown = () => {
    stopped = true;
    if (raf) window.cancelAnimationFrame(raf);
    if (timer) window.clearTimeout(timer);
    try {
      candidateEl.srcObject = null;
      interviewerEl.srcObject = null;
      micSource?.disconnect();
      voiceSource?.disconnect();
      micGain?.disconnect();
      voiceGain?.disconnect();
    } catch {}
    void ac?.close().catch(() => {});
    ac = null;
  };

  const finalize = async () => {
    if (finished) return;
    finished = true;

    const blob = new Blob(parts, { type: pickMimeType() || 'video/webm' });
    teardown();

    // Nothing captured (stopped before a single frame): nothing to keep.
    if (!blob.size && streamedRequests === 0) return;

    // 1) The candidate's own copy first — it must never depend on the network,
    //    so the download is kicked off before any upload is attempted.
    if (blob.size) {
      try {
        downloadBlob(blob, `HireXt-Interview-${sessionId.slice(0, 8)}-${timestampSuffix()}.webm`);
      } catch {}
    }

    // 2) Store it server-side.
    if (!blob.size || !apiBase || !recordToken) {
      onFinish('device-only');
      return;
    }
    try {
      if (streamingHealthy && streamedRequests > 0) {
        await drainQueue();
        if (streamingHealthy && queue.length === 0) {
          const res = await fetch(completeUrl, { method: 'POST', headers: authHeaders() });
          if (!res.ok) throw new Error(`complete ${res.status}`);
          onFinish('saved');
          return;
        }
      }
      const res = await fetch(uploadUrl, { method: 'POST', headers: authHeaders(), body: blob });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      onFinish('saved');
    } catch {
      onFinish('device-only');
    }
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    const blob = new Blob(parts, { type: pickMimeType() || 'video/webm' });
    teardown();

    if (!blob.size && streamedRequests === 0) return;

    if (blob.size) {
      try {
        downloadBlob(blob, `HireXt-Interview-${sessionId.slice(0, 8)}-${timestampSuffix()}.webm`);
      } catch {}
    }
    if (!apiBase || !recordToken || !blob.size) {
      onFinish('device-only');
      return;
    }
    try {
      if (streamingHealthy && streamedRequests > 0) {
        await drainQueue();
        if (streamingHealthy && queue.length === 0) {
          const res = await fetch(completeUrl, { method: 'POST', headers: authHeaders() });
          if (!res.ok) throw new Error(`complete ${res.status}`);
          onFinish('saved');
          return;
        }
      }
      const res = await fetch(uploadUrl, { method: 'POST', headers: authHeaders(), body: blob });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      onFinish('saved');
    } catch {
      onFinish('device-only');
    }
  };

  const stop = () => {
    if (stopped || finished) return;
    stopped = true;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else void finish();
    } catch {
      void finish();
    }
  };

  const tick = () => {
    if (stopped || finished) return;
    draw();

    const now = Date.now();
    if (now - lastSync > 1000) {
      lastSync = now;
      const s = resolveSources(room);
      if (!ac && (s.mic || s.voice)) initAudio();
      syncAudio(s);
      bind(candidateEl, s.candidate);
      bind(interviewerEl, s.interviewer);
    }
    if (now - startedAt > MAX_RECORDING_MS) {
      stop();
      return;
    }
    // While the tab is hidden requestAnimationFrame is throttled to a stop, so
    // fall back to a timer to keep producing frames for the recorder.
    if (typeof document !== 'undefined' && document.hidden) {
      timer = window.setTimeout(tick, Math.round(1000 / FPS));
    } else {
      raf = window.requestAnimationFrame(tick);
    }
  };

  // ── Start ──────────────────────────────────────────────────────────────────
  const initial = resolveSources(room);
  if (initial.mic || initial.voice) initAudio();
  syncAudio(initial);
  bind(candidateEl, initial.candidate);
  bind(interviewerEl, initial.interviewer);
  draw();

  const canvasStream = canvas.captureStream(FPS);
  const audioDest = destination as MediaStreamAudioDestinationNode | null;
  const outgoing = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioDest ? audioDest.stream.getAudioTracks() : []),
  ]);

  const mime = pickMimeType();
  recorder = new MediaRecorder(outgoing, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: VIDEO_BPS,
    audioBitsPerSecond: AUDIO_BPS,
  });
  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    parts.push(e.data);
    if (streamingHealthy) {
      queue.push(e.data);
      void pump();
    }
  };
  recorder.onstop = () => {
    void finish();
  };
  recorder.start(TIMESLICE_MS);
  tick();

  return { stop };
}

// ─────────────────────────────────────────────────────────────────────────────
// React wrapper
// ─────────────────────────────────────────────────────────────────────────────

export type UseInterviewRecorderResult = {
  status: InterviewRecorderStatus;
  /** Human label for the concluded screen, or null when nothing was recorded. */
  label: string | null;
  /**
   * Finalize immediately. Call this from a manual "end interview" handler
   * BEFORE tearing the local tracks down, otherwise the last timeslice is
   * captured from already-dead audio/video tracks.
   */
  stop: () => void;
};

const STATUS_LABEL: Record<InterviewRecorderStatus, string | null> = {
  off: null,
  recording: 'In progress',
  saving: 'Saving…',
  saved: 'Saved',
  'device-only': 'On your device',
};

export function useInterviewRecorder(options: {
  /** False on phones, and when the server did not hand out a recording token. */
  enabled: boolean;
  /** The room is connected — begin capturing. */
  armed: boolean;
  /** The interview has concluded — stop and upload. */
  ending: boolean;
  room: Room;
  sessionId: string;
  recordToken?: string;
  apiBase?: string;
  interviewerName?: string;
  candidateName?: string;
}): UseInterviewRecorderResult {
  const {
    enabled,
    armed,
    ending,
    room,
    sessionId,
    recordToken,
    apiBase = '',
    interviewerName = 'Monica',
    candidateName = 'You',
  } = options;

  const [status, setStatus] = React.useState<InterviewRecorderStatus>('off');
  const handleRef = React.useRef<RecorderHandle | null>(null);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!armed || !enabled || !recordToken || !sessionId || !apiBase) return;
    if (handleRef.current) return;
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) {
      return;
    }
    try {
      handleRef.current = startCompositeRecorder({
        room,
        apiBase,
        sessionId,
        recordToken,
        interviewerName,
        candidateName,
        onFinish: (outcome) => {
          handleRef.current = null;
          if (aliveRef.current) setStatus(outcome);
        },
      });
      setStatus('recording');
    } catch (err) {
      console.warn('[recording] could not start:', err);
      handleRef.current = null;
    }
  }, [armed, enabled, recordToken, sessionId, apiBase, room, interviewerName, candidateName]);

  // Finalize the moment the interview concludes — before the room tears the
  // local tracks down, so the composite still gets its last audio frames.
  React.useEffect(() => {
    if (!ending) return;
    const handle = handleRef.current;
    if (!handle) return;
    setStatus((prev) => (prev === 'recording' ? 'saving' : prev));
    handle.stop();
  }, [ending]);

  // If the room unmounts while still recording, stop so the file is produced.
  React.useEffect(
    () => () => {
      handleRef.current?.stop();
      handleRef.current = null;
    },
    [],
  );

  const stop = React.useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    setStatus((prev) => (prev === 'recording' ? 'saving' : prev));
    handle.stop();
  }, []);

  const effective: InterviewRecorderStatus = enabled ? status : 'off';
  return { status: effective, label: STATUS_LABEL[effective], stop };
}
