'use client';

import * as React from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useParticipants,
  useRoomContext,
  useTracks,
  useTranscriptions,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionState, createLocalTracks, LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { WavyBackground } from '@/components/ui/wavy-background';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { playSpeakerTestSound } from '@/lib/audioTest';
import { LiveKitVoiceNoiseProcessor } from '@/lib/audioNoiseFilter';
import { BrandLogo } from '@/lib/ailink/BrandLogo';
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShrinkIcon,
  UsersIcon,
  VolumeIcon,
  WarningIcon,
} from '@/lib/ailink/icons';
import './tailwind.css';

export interface EcoInterviewProps {
  liveKitUrl: string;
  token: string;
  candidateName?: string;
  isNameFixed?: boolean;
  resultBase?: string;
  interviewTitle?: string;
  companyName?: string;
}

const ECO_IDENTITY = 'eco-avatar';
const EASE = [0.22, 1, 0.36, 1] as const;

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function getInitials(name?: string) {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  React.useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, active, onClose]);
}

// ────────────────────────────────────────────────────────────────────────────
// Custom SVG Icons for Closed Captions & Download
// ────────────────────────────────────────────────────────────────────────────
function ClosedCaptionsIcon({ size = 18, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10 9.5a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2" />
      <path d="M16 9.5a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2" />
    </svg>
  );
}

function DownloadIcon({ size = 18, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pre-Join Screen (Dark Eco Green Room)
// ────────────────────────────────────────────────────────────────────────────
interface EcoPreJoinProps {
  defaultUsername?: string;
  isNameFixed?: boolean;
  interviewTitle: string;
  companyName: string;
  onJoin: (
    tracks: Awaited<ReturnType<typeof createLocalTracks>>,
    username: string,
    choices: {
      videoEnabled: boolean;
      audioEnabled: boolean;
      videoDeviceId?: string;
      audioDeviceId?: string;
    },
  ) => void;
}

function EcoPreJoin({
  defaultUsername = '',
  isNameFixed = false,
  interviewTitle,
  companyName,
  onJoin,
}: EcoPreJoinProps) {
  const [username, setUsername] = React.useState(defaultUsername);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const [audioEnabled, setAudioEnabled] = React.useState(true);
  const [joining, setJoining] = React.useState(false);

  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = React.useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = React.useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = React.useState<string>('');

  const [micLevel, setMicLevel] = React.useState(0);
  const [testPlaying, setTestPlaying] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animFrameRef = React.useRef<number>(0);

  // Enumerate devices & start initial preview
  const startPreview = React.useCallback(
    async (vId?: string, aId?: string) => {
      try {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: videoEnabled
            ? vId
              ? { deviceId: { exact: vId } }
              : { facingMode: 'user' }
            : false,
          audio: audioEnabled
            ? aId
              ? { deviceId: { exact: aId } }
              : true
            : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        setPermissionError(null);

        if (videoRef.current && videoEnabled) {
          videoRef.current.srcObject = stream;
        }

        // Setup microphone meter
        if (audioEnabled) {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = ctx;
            const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            analyserRef.current = analyser;

            const data = new Uint8Array(analyser.frequencyBinCount);
            const check = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) sum += data[i];
              const avg = sum / data.length;
              setMicLevel(Math.min(100, Math.round(avg * 1.6)));
              animFrameRef.current = requestAnimationFrame(check);
            };
            animFrameRef.current = requestAnimationFrame(check);
          }
        } else {
          setMicLevel(0);
        }

        // Enumerate devices
        const devs = await navigator.mediaDevices.enumerateDevices();
        const vDevs = devs.filter((d) => d.kind === 'videoinput');
        const aDevs = devs.filter((d) => d.kind === 'audioinput');
        const sDevs = devs.filter((d) => d.kind === 'audiooutput');

        setVideoDevices(vDevs);
        setAudioDevices(aDevs);
        setSpeakerDevices(sDevs);

        if (!selectedVideoId && vDevs[0]) setSelectedVideoId(vDevs[0].deviceId);
        if (!selectedAudioId && aDevs[0]) setSelectedAudioId(aDevs[0].deviceId);
        if (!selectedSpeakerId && sDevs[0]) setSelectedSpeakerId(sDevs[0].deviceId);
      } catch (err: any) {
        console.warn('PreJoin media error:', err);
        setPermissionError(
          err.name === 'NotAllowedError'
            ? 'Camera and microphone permissions were denied. Please grant permission in your browser.'
            : 'Could not access camera or microphone. Please verify they are connected.'
        );
      }
    },
    [videoEnabled, audioEnabled, selectedVideoId, selectedAudioId, selectedSpeakerId]
  );

  React.useEffect(() => {
    startPreview();
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => { });
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startPreview]);

  const handleToggleCam = () => {
    setVideoEnabled((v) => !v);
  };

  const handleToggleMic = () => {
    setAudioEnabled((m) => !m);
  };

  const handlePlaySpeakerTone = async () => {
    if (testPlaying) return;
    setTestPlaying(true);
    try {
      await playSpeakerTestSound(selectedSpeakerId);
      toast.success('Speaker test tone played');
    } catch {
      toast.error('Could not play test tone');
    } finally {
      setTestPlaying(false);
    }
  };

  const handleEnterInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('Please enter your name to proceed');
      return;
    }
    setJoining(true);

    try {
      // Clean up pre-join preview and wait for camera hardware driver release
      cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => { });
      }
      if (mediaStreamRef.current) {
        const msts = mediaStreamRef.current.getTracks();
        msts.forEach((t) => t.stop());
        mediaStreamRef.current = null;
        await Promise.all(
          msts.map(
            (mst) =>
              new Promise<void>((resolve) => {
                if (mst.readyState === 'ended') return resolve();
                const timer = setTimeout(resolve, 1500);
                mst.addEventListener(
                  'ended',
                  () => {
                    clearTimeout(timer);
                    resolve();
                  },
                  { once: true },
                );
              }),
          ),
        ).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Acquire official LiveKit local tracks
      const tracks = await createLocalTracks({
        audio: audioEnabled ? { deviceId: selectedAudioId || undefined } : false,
        video: videoEnabled
          ? {
            deviceId: selectedVideoId || undefined,
            facingMode: 'user',
            resolution: { width: 1280, height: 720, frameRate: 30 },
          }
          : false,
      });

      onJoin(tracks, username.trim(), {
        videoEnabled,
        audioEnabled,
        videoDeviceId: selectedVideoId,
        audioDeviceId: selectedAudioId,
      });
    } catch (err: any) {
      setJoining(false);
      toast.error(`Could not initialize camera/mic: ${err.message}`);
    }
  };

  return (
    <div className="relative isolate flex h-[100dvh] w-full flex-col justify-between overflow-hidden bg-black font-sans text-white antialiased">
      {/* Ambient background particles & glows */}
      <BackgroundBeams />
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-[#245BFF]/10 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[#20C8F5]/[0.08] blur-[140px]" />

      {/* Top Navbar */}
      <header className="relative z-10 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/60 px-6 py-3.5 backdrop-blur-xl md:px-12">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="HireXt Logo" className="h-7 w-auto object-contain select-none" />
          <span className="h-4 w-px bg-white/15" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white">
            Interview
          </span>
        </div>
      </header>

      {/* Main PreJoin Stage */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-4 sm:p-6 lg:p-8 min-h-0 overflow-y-auto">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-8 my-auto">
          {/* Left Column: Video Preview & Quick Controls */}
          <div className="flex flex-col gap-3.5 lg:col-span-7">
            <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl backdrop-blur-2xl">
              <div className="relative aspect-video w-full overflow-hidden rounded-[calc(2rem-0.375rem)] bg-neutral-950/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                {videoEnabled ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/50">
                    <div className="relative rounded-full p-1 ring-1 ring-white/20 ring-offset-2 ring-offset-neutral-950">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 text-xl font-bold text-white shadow-xl">
                        {getInitials(username || 'Candidate')}
                      </div>
                    </div>
                    <span className="text-xs font-medium">Camera is turned off</span>
                  </div>
                )}

                {/* Candidate Badge (Top Left) */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                  <span>{username.trim() || 'Candidate'} (You)</span>
                </div>

                {/* Quality Badge (Top Right) */}
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-[#20C8F5] backdrop-blur-md border border-white/10">
                  <span>HD 1080p · Verified</span>
                </div>

                {/* Floating Bottom Overlays */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 sm:p-4">
                  {/* Dynamic Audio Level Meter */}
                  <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/60 px-3.5 py-1.5 backdrop-blur-md">
                    <span
                      className={`h-2 w-2 rounded-full transition-all duration-300 ${audioEnabled && micLevel > 15
                        ? 'bg-[#20C8F5] shadow-[0_0_8px_#20C8F5]'
                        : 'bg-white/30'
                        }`}
                    />
                    <span className="text-[11px] font-medium text-white/90">
                      {audioEnabled
                        ? micLevel > 15
                          ? 'Microphone active'
                          : 'Speak to test mic'
                        : 'Microphone muted'}
                    </span>
                    {audioEnabled && (
                      <div className="flex items-end gap-1 h-3.5 pl-1.5">
                        <span
                          className="w-1 bg-[#20C8F5] rounded-full transition-all duration-100"
                          style={{ height: `${Math.max(3, micLevel * 0.16)}px` }}
                        />
                        <span
                          className="w-1 bg-[#53E0EC] rounded-full transition-all duration-100"
                          style={{ height: `${Math.max(4, micLevel * 0.28)}px` }}
                        />
                        <span
                          className="w-1 bg-[#20C8F5] rounded-full transition-all duration-100"
                          style={{ height: `${Math.max(3, micLevel * 0.22)}px` }}
                        />
                        <span
                          className="w-1 bg-[#53E0EC] rounded-full transition-all duration-100"
                          style={{ height: `${Math.max(2, micLevel * 0.14)}px` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Cam / Mic Quick Toggles on Viewport */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleMic}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${audioEnabled
                        ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
                        : 'border-[#F52D45]/40 bg-[#F52D45]/20 text-[#F52D45] hover:bg-[#F52D45]/30'
                        }`}
                      title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    >
                      {audioEnabled ? <MicIcon size={17} /> : <MicOffIcon size={17} />}
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleCam}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${videoEnabled
                        ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
                        : 'border-[#F52D45]/40 bg-[#F52D45]/20 text-[#F52D45] hover:bg-[#F52D45]/30'
                        }`}
                      title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                    >
                      {videoEnabled ? <CameraIcon size={17} /> : <CameraOffIcon size={17} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Badges Under Video */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 rounded-full border border-[#A77BFF]/30 bg-[#A77BFF]/10 px-3 py-1 text-[11px] font-medium text-[#A8B9FF]">
                <ShieldCheckIcon size={14} className="text-[#A77BFF]" />
                <span>AI Voice Isolation (Krisp) Active</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#20C8F5]" />
                <span>WebRTC Low-Latency Engine Ready</span>
              </div>
            </div>

            {/* Permission banner */}
            {permissionError && (
              <div className="flex w-full items-center gap-2.5 rounded-2xl border border-[#F52D45]/30 bg-[#F52D45]/10 p-3 text-xs text-[#F52D45]">
                <WarningIcon size={16} className="shrink-0" />
                <span>{permissionError}</span>
              </div>
            )}
          </div>

          {/* Right Column: Candidate Info & Hardware Check */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl backdrop-blur-2xl">
              <div className="flex flex-col gap-4 sm:gap-5 rounded-[calc(2rem-0.375rem)] bg-neutral-950/80 p-5 sm:p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#53E0EC]">
                    {companyName}
                  </div>
                  <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-white">
                    {interviewTitle}
                  </h1>
                  <p className="mt-1 text-xs text-white/60 leading-relaxed">
                    Check your camera and audio devices before entering your interactive evaluation session.
                  </p>

                  {/* Highlights Checklist */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/70">
                      ⚡ Evaluator: Monica
                    </span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/70">
                      📝 Live Transcript
                    </span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/70">
                      🖥️ Screen Sharing Enabled
                    </span>
                  </div>
                </div>

                <form onSubmit={handleEnterInterview} className="flex flex-col gap-3.5">
                  {/* Candidate Name Input */}
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      readOnly={isNameFixed}
                      placeholder="e.g. Alex Morgan"
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white placeholder-white/25 transition-all focus:border-[#20C8F5] focus:bg-white/[0.08] focus:ring-1 focus:ring-[#20C8F5] focus:outline-none"
                    />
                  </div>

                  {/* Device Selectors */}
                  <div className="space-y-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                        <span className="font-semibold uppercase tracking-wider">Camera</span>
                        <span className="text-[10px] font-semibold text-[#20C8F5]">Verified</span>
                      </div>
                      <select
                        value={selectedVideoId}
                        onChange={(e) => {
                          setSelectedVideoId(e.target.value);
                          startPreview(e.target.value, selectedAudioId);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-[#20C8F5]"
                      >
                        {videoDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                        <span className="font-semibold uppercase tracking-wider">Microphone</span>
                        <span className="text-[10px] font-semibold text-[#53E0EC]">Active</span>
                      </div>
                      <select
                        value={selectedAudioId}
                        onChange={(e) => {
                          setSelectedAudioId(e.target.value);
                          startPreview(selectedVideoId, e.target.value);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-[#20C8F5]"
                      >
                        {audioDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                        <span className="font-semibold uppercase tracking-wider">Speaker</span>
                        <button
                          type="button"
                          onClick={handlePlaySpeakerTone}
                          disabled={testPlaying}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#20C8F5] hover:text-[#53E0EC] transition-colors cursor-pointer"
                        >
                          <VolumeIcon size={12} />
                          <span>{testPlaying ? 'Testing…' : 'Test Sound'}</span>
                        </button>
                      </div>
                      <select
                        value={selectedSpeakerId}
                        onChange={(e) => setSelectedSpeakerId(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-[#20C8F5]"
                      >
                        {speakerDevices.length === 0 ? (
                          <option value="">Default system speaker</option>
                        ) : (
                          speakerDevices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                              {d.label || `Speaker ${i + 1}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={joining}
                    className="relative mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#245BFF] via-[#20C8F5] to-[#53E0EC] font-bold text-neutral-950 text-sm shadow-[0_0_24px_rgba(32,200,245,0.4)] transition-all hover:shadow-[0_0_36px_rgba(32,200,245,0.65)] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {joining ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
                        <span>Connecting to Monica…</span>
                      </span>
                    ) : (
                      <span>Enter Interview Room</span>
                    )}
                  </button>
                </form>

                {/* Privacy Badge */}
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                  <ShieldCheckIcon size={14} className="text-[#20C8F5]" />
                  <span>Audio &amp; video only stream once you enter the room</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer Bar */}
      <footer className="relative z-10 flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-neutral-950/40 px-6 py-2.5 text-[11px] text-white/40 backdrop-blur-xl md:px-12">
        <span>HireXt Interview System · Enterprise Evaluation Engine</span>
        <span className="hidden sm:inline">Low-Latency Multimodal WebRTC · 1080p HD</span>
      </footer>
    </div>
  );
}

/**
 * Direct video preview: attaches the LIVE MediaStreamTrack directly to
 * a <video> element with playsInline, autoPlay, and muted.
 * Prevents WebRTC placeholder timing or subscription lags from blanking out candidate preview.
 */
function LocalSelfView({
  mst,
  className = 'h-full w-full scale-x-[-1] object-cover',
}: {
  mst: MediaStreamTrack;
  className?: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el || !mst) return;
    const stream = new MediaStream([mst]);
    el.srcObject = stream;
    el.play().catch(() => undefined);

    return () => {
      try {
        el.pause();
      } catch {}
      el.srcObject = null;
    };
  }, [mst]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// In-Room Eco AI Interview Experience
// ────────────────────────────────────────────────────────────────────────────
function EcoInterviewRoom({
  candidateName,
  interviewTitle = 'AI Technical Assessment',
  companyName = 'HireXt',
  resultBase,
  previewTracks,
  userChoices,
}: {
  candidateName: string;
  interviewTitle?: string;
  companyName?: string;
  resultBase?: string;
  previewTracks: Awaited<ReturnType<typeof createLocalTracks>>;
  userChoices: {
    videoEnabled: boolean;
    audioEnabled: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
  };
}) {
  const {
    cameraTrack: liveCameraPublication,
    microphoneTrack: liveMicrophonePublication,
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
  } = useLocalParticipant();
  const room = useRoomContext();
  const connection = useConnectionState();
  const transcriptions = useTranscriptions();
  const publishedRef = React.useRef(false);

  // Subscribe to Mic, Camera, and ScreenShare tracks
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false },
  );

  const participants = useParticipants();
  const participantCount = participants.length;

  const env = (t: TrackReferenceOrPlaceholder) => t.participant?.identity === ECO_IDENTITY;
  const ecoAudio = tracks.find((t) => env(t) && t.source === Track.Source.Microphone);
  const ecoVideo = tracks.find((t) => env(t) && t.source === Track.Source.Camera);
  const screenShareTrack = tracks.find((t) => t.source === Track.Source.ScreenShare);

  // Resolve the active local video track from all available sources:
  // 1. liveCameraPublication from useLocalParticipant()
  // 2. room.localParticipant publication
  // 3. previewTracks passed from pre-join
  const activeLocalVideoTrack = React.useMemo(() => {
    const fromPub = (liveCameraPublication as unknown as { track?: unknown } | undefined)?.track as
      | LocalVideoTrack
      | undefined;
    if (fromPub?.mediaStreamTrack && fromPub.mediaStreamTrack.readyState === 'live') {
      return fromPub;
    }
    const fromLp = room.localParticipant?.getTrackPublication(Track.Source.Camera)?.track as
      | LocalVideoTrack
      | undefined;
    if (fromLp?.mediaStreamTrack && fromLp.mediaStreamTrack.readyState === 'live') {
      return fromLp;
    }
    const fromPreview = previewTracks.find((t) => t.kind === 'video') as LocalVideoTrack | undefined;
    if (fromPreview?.mediaStreamTrack && fromPreview.mediaStreamTrack.readyState === 'live') {
      return fromPreview;
    }
    return fromPub || fromLp || fromPreview;
  }, [liveCameraPublication, room.localParticipant, previewTracks, isCameraEnabled]);

  const localVideoMst = activeLocalVideoTrack?.mediaStreamTrack;

  // Local video is live when the underlying MediaStreamTrack is live and neither track nor publication is muted
  const isLocalVideoLive =
    !!localVideoMst &&
    localVideoMst.readyState === 'live' &&
    activeLocalVideoTrack?.isMuted !== true &&
    localVideoMst.enabled !== false;

  // Resolve active local audio track from room publication or pre-acquired tracks
  const activeLocalAudioTrack = React.useMemo(() => {
    const fromPub = (liveMicrophonePublication as unknown as { track?: unknown } | undefined)?.track as
      | LocalAudioTrack
      | undefined;
    if (fromPub?.mediaStreamTrack && fromPub.mediaStreamTrack.readyState === 'live') {
      return fromPub;
    }
    const fromLp = room.localParticipant?.getTrackPublication(Track.Source.Microphone)?.track as
      | LocalAudioTrack
      | undefined;
    if (fromLp?.mediaStreamTrack && fromLp.mediaStreamTrack.readyState === 'live') {
      return fromLp;
    }
    const fromPreview = previewTracks.find((t) => t.kind === 'audio') as LocalAudioTrack | undefined;
    if (fromPreview?.mediaStreamTrack && fromPreview.mediaStreamTrack.readyState === 'live') {
      return fromPreview;
    }
    return fromPub || fromLp || fromPreview;
  }, [liveMicrophonePublication, room.localParticipant, previewTracks, isMicrophoneEnabled]);

  const localAudioMst = activeLocalAudioTrack?.mediaStreamTrack;

  // Local mic is live when underlying MediaStreamTrack is live and not muted
  const isLocalMicLive =
    !!localAudioMst &&
    localAudioMst.readyState === 'live' &&
    activeLocalAudioTrack?.isMuted !== true &&
    localAudioMst.enabled !== false;

  // Audio energy calculation for avatar ripples
  const bands = useMultibandTrackVolume(ecoAudio, { bands: 4, updateInterval: 60 });
  const energy = bands.reduce((a, b) => a + b, 0) / 4;

  // Publish pre-acquired tracks upon room connection and heal publication states
  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;

    (async () => {
      try {
        if (previewTracks && previewTracks.length > 0) {
          for (const track of previewTracks) {
            if (track.mediaStreamTrack && track.mediaStreamTrack.readyState === 'live') {
              try {
                await room.localParticipant.publishTrack(track);
              } catch (err) {
                console.warn('Could not publish pre-acquired track:', err);
              }
            }
          }
        }

        // Heal publication states to match pre-join choices
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          const vTrack = camPub.track as LocalVideoTrack;
          if (userChoices.videoEnabled) {
            if (vTrack.mediaStreamTrack && vTrack.mediaStreamTrack.readyState !== 'live') {
              await vTrack.restartTrack().catch(() => undefined);
            }
            if (vTrack.isMuted) {
              await vTrack.unmute().catch(() => undefined);
            }
            if (camPub.isMuted) {
              await camPub.unmute().catch(() => undefined);
            }
            await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
          } else {
            await camPub.mute().catch(() => undefined);
            await vTrack.mute().catch(() => undefined);
            await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
          }
        } else if (userChoices.videoEnabled) {
          await room.localParticipant
            .setCameraEnabled(true, userChoices.videoDeviceId ? { deviceId: userChoices.videoDeviceId } : undefined)
            .catch((err) => {
              console.warn('Could not enable camera on join:', err);
            });
        }

        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          const aTrack = micPub.track as LocalAudioTrack;
          if (userChoices.audioEnabled) {
            if (aTrack.mediaStreamTrack && aTrack.mediaStreamTrack.readyState !== 'live') {
              await aTrack.restartTrack().catch(() => undefined);
            }
            if (aTrack.isMuted) {
              await aTrack.unmute().catch(() => undefined);
            }
            if (micPub.isMuted) {
              await micPub.unmute().catch(() => undefined);
            }
            await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
          } else {
            await micPub.mute().catch(() => undefined);
            await aTrack.mute().catch(() => undefined);
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          }
        } else if (userChoices.audioEnabled) {
          await room.localParticipant
            .setMicrophoneEnabled(true, userChoices.audioDeviceId ? { deviceId: userChoices.audioDeviceId } : undefined)
            .catch((err) => {
              console.warn('Could not enable mic on join:', err);
            });
        }
      } catch (e) {
        console.warn('Track publication / healing error', e);
      }
    })();
  }, [connection, previewTracks, room, userChoices]);

  const [seconds, setSeconds] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const hasConnected = React.useRef(false);

  // Auto-scroll transcript state
  const [autoScroll, setAutoScroll] = React.useState(true);
  const transcriptEndRef = React.useRef<HTMLDivElement>(null);
  const transcriptContainerRef = React.useRef<HTMLDivElement>(null);

  // Leave Confirmation Dialog
  const [confirmLeaveOpen, setConfirmLeaveOpen] = React.useState(false);

  // Media devices state
  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | undefined>(userChoices.videoDeviceId);
  const [activeAudioId, setActiveAudioId] = React.useState<string | undefined>(userChoices.audioDeviceId);
  const [activeSpeakerId, setActiveSpeakerId] = React.useState<string | undefined>(undefined);

  // Pending action guards to prevent duplicate/concurrent track acquisition
  const [micActionPending, setMicActionPending] = React.useState(false);
  const [cameraActionPending, setCameraActionPending] = React.useState(false);

  // Popovers & Dialogs
  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [participantsOpen, setParticipantsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [testSoundPlaying, setTestSoundPlaying] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  // AI Noise Cancellation (Krisp)
  const [noiseFilterEnabled, setNoiseFilterEnabled] = React.useState(true);
  const noiseProcessorRef = React.useRef<LiveKitVoiceNoiseProcessor | null>(null);

  const micMenuRef = React.useRef<HTMLDivElement>(null);
  const cameraMenuRef = React.useRef<HTMLDivElement>(null);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);
  const participantsRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(micMenuRef, micMenuOpen, () => setMicMenuOpen(false));
  useClickOutside(cameraMenuRef, cameraMenuOpen, () => setCameraMenuOpen(false));
  useClickOutside(moreMenuRef, moreMenuOpen, () => setMoreMenuOpen(false));
  useClickOutside(participantsRef, participantsOpen, () => setParticipantsOpen(false));

  const refreshDevices = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
      setSpeakerDevices(devices.filter((d) => d.kind === 'audiooutput'));

      const currentAudio = room.getActiveDevice('audioinput');
      const currentVideo = room.getActiveDevice('videoinput');
      const currentSpeaker = room.getActiveDevice('audiooutput');
      const savedSpeaker = typeof window !== 'undefined' ? localStorage.getItem('hx_meet_speaker_id') : undefined;

      if (currentAudio) setActiveAudioId(currentAudio);
      if (currentVideo) setActiveVideoId(currentVideo);
      if (savedSpeaker && devices.some((d) => d.kind === 'audiooutput' && d.deviceId === savedSpeaker)) {
        setActiveSpeakerId(savedSpeaker);
        room.switchActiveDevice('audiooutput', savedSpeaker).catch(() => undefined);
      } else if (currentSpeaker) {
        setActiveSpeakerId(currentSpeaker);
      }
    } catch (e) {
      console.warn('Device enumeration error', e);
    }
  }, [room]);

  React.useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  const handleToggleMic = async () => {
    if (micActionPending) return;
    setMicActionPending(true);
    try {
      const lp = room.localParticipant;
      if (!lp) return;
      const pub = lp.getTrackPublication(Track.Source.Microphone);
      const track = (pub?.track || activeLocalAudioTrack) as LocalAudioTrack | undefined;
      const mst = track?.mediaStreamTrack;

      if (!isLocalMicLive) {
        // Turning ON microphone
        if (track) {
          if (mst && mst.readyState !== 'live') {
            await track.restartTrack().catch(() => undefined);
          }
          await track.unmute().catch(() => undefined);
          if (pub) await pub.unmute().catch(() => undefined);
          await lp
            .setMicrophoneEnabled(true, activeAudioId ? { deviceId: activeAudioId } : undefined)
            .catch(() => undefined);
        } else {
          await lp
            .setMicrophoneEnabled(true, activeAudioId ? { deviceId: activeAudioId } : undefined)
            .catch(() => undefined);
        }
      } else {
        // Turning OFF microphone
        if (track) {
          await track.mute().catch(() => undefined);
          if (pub) await pub.mute().catch(() => undefined);
          await lp.setMicrophoneEnabled(false).catch(() => undefined);
        } else {
          await lp.setMicrophoneEnabled(false).catch(() => undefined);
        }
      }
    } catch (e) {
      console.warn('Mic toggle error', e);
    } finally {
      setTimeout(() => setMicActionPending(false), 250);
    }
  };

  const handleToggleCamera = async () => {
    if (cameraActionPending) return;
    setCameraActionPending(true);
    try {
      const lp = room.localParticipant;
      if (!lp) return;
      const pub = lp.getTrackPublication(Track.Source.Camera);
      const track = (pub?.track || activeLocalVideoTrack) as LocalVideoTrack | undefined;
      const mst = track?.mediaStreamTrack;

      if (!isLocalVideoLive) {
        // Turning ON camera: if track exists, restart if underlying MST died and unmute both track and publication
        if (track) {
          if (mst && mst.readyState !== 'live') {
            await track.restartTrack().catch(() => undefined);
          }
          await track.unmute().catch(() => undefined);
          if (pub) {
            await pub.unmute().catch(() => undefined);
          }
        } else {
          await lp
            .setCameraEnabled(true, activeVideoId ? { deviceId: activeVideoId } : undefined)
            .catch(() => undefined);
        }
      } else {
        // Turning OFF camera: mute track cleanly
        if (track) {
          await track.mute().catch(() => undefined);
          if (pub) {
            await pub.mute().catch(() => undefined);
          }
        } else {
          await lp.setCameraEnabled(false).catch(() => undefined);
        }
      }
    } catch (e) {
      console.warn('Camera toggle error', e);
    } finally {
      setTimeout(() => setCameraActionPending(false), 250);
    }
  };

  const handleSwitchAudio = async (deviceId: string, label: string) => {
    try {
      setActiveAudioId(deviceId);
      await room.switchActiveDevice('audioinput', deviceId);
      const lp = room.localParticipant;
      if (lp) {
        const pub = lp.getTrackPublication(Track.Source.Microphone);
        const track = pub?.track as LocalAudioTrack | undefined;
        if (!pub || !lp.isMicrophoneEnabled) {
          await lp.setMicrophoneEnabled(true, { deviceId }).catch(() => undefined);
        } else if (track && track.isMuted) {
          await track.unmute().catch(() => undefined);
        }
      }
      toast.success(`Microphone: ${label}`);
    } catch {
      toast.error('Could not switch microphone');
    }
    setMicMenuOpen(false);
  };

  const handleSwitchSpeaker = async (deviceId: string, label: string) => {
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
      setActiveSpeakerId(deviceId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('hx_meet_speaker_id', deviceId);
      }
      toast.success(`Speaker: ${label}`);
    } catch {
      toast.error('Could not switch speaker');
    }
    setMicMenuOpen(false);
  };

  const handleSwitchVideo = async (deviceId: string, label: string) => {
    try {
      setActiveVideoId(deviceId);
      await room.switchActiveDevice('videoinput', deviceId);
      const lp = room.localParticipant;
      if (lp) {
        const pub = lp.getTrackPublication(Track.Source.Camera);
        const track = pub?.track as LocalVideoTrack | undefined;
        if (!pub || !lp.isCameraEnabled) {
          await lp.setCameraEnabled(true, { deviceId }).catch(() => undefined);
        } else if (track && track.isMuted) {
          await track.unmute().catch(() => undefined);
        }
      }
      toast.success(`Camera: ${label}`);
    } catch {
      toast.error('Could not switch camera');
    }
    setCameraMenuOpen(false);
  };

  const toggleNoiseFilter = async () => {
    const next = !noiseFilterEnabled;
    setNoiseFilterEnabled(next);
    try {
      const micPub = room.localParticipant?.getTrackPublication(Track.Source.Microphone);
      const localTrack = micPub?.track as LocalAudioTrack | undefined;
      const mediaTrack = localTrack?.mediaStreamTrack;

      if (localTrack && mediaTrack) {
        if (next) {
          if (!noiseProcessorRef.current) {
            noiseProcessorRef.current = new LiveKitVoiceNoiseProcessor(true);
          } else {
            noiseProcessorRef.current.setEnabled(true);
          }
          try {
            await localTrack.setProcessor(noiseProcessorRef.current);
          } catch (e) {
            console.warn('Noise processor error', e);
          }
        } else {
          if (noiseProcessorRef.current) {
            noiseProcessorRef.current.setEnabled(false);
          }
          try {
            await localTrack.stopProcessor();
          } catch (e) {
            console.warn('Stop processor error', e);
          }
        }
        await mediaTrack
          .applyConstraints({
            noiseSuppression: next,
            echoCancellation: true,
            autoGainControl: next,
          })
          .catch(() => undefined);
      }
      toast.success(next ? 'AI noise isolation enabled' : 'AI noise isolation disabled');
    } catch (e) {
      console.warn('Toggle noise filter error', e);
    }
  };

  const playTestSound = async () => {
    if (testSoundPlaying) return;
    setTestSoundPlaying(true);
    try {
      await playSpeakerTestSound(activeSpeakerId);
    } catch (e) {
      console.warn('Speaker test error', e);
    } finally {
      setTestSoundPlaying(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => undefined);
      setFullscreen(false);
    }
  };

  React.useEffect(() => {
    const handleFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const copyMeetingLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Interview link copied to clipboard');
    }
    setMoreMenuOpen(false);
  };

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (connection === ConnectionState.Connected) hasConnected.current = true;
    else if (connection === ConnectionState.Disconnected && hasConnected.current) setEnded(true);
  }, [connection]);

  // Clean up all local media hardware tracks when session ends
  React.useEffect(() => {
    if (ended) {
      try {
        previewTracks?.forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        room.localParticipant?.trackPublications.forEach((pub) => {
          try {
            pub.track?.stop();
          } catch {}
        });
      } catch (e) {
        console.warn('Track teardown error on session completion:', e);
      }
    }
  }, [ended, previewTracks, room]);

  const handleEndAndSubmit = () => {
    setConfirmLeaveOpen(false);
    setEnded(true);
    try {
      previewTracks?.forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      room.localParticipant?.trackPublications.forEach((pub) => {
        try {
          pub.track?.stop();
        } catch {}
      });
      room.disconnect();
    } catch (err) {
      console.warn('Disconnect error:', err);
    }
  };

  const showVideo = !!ecoVideo;
  const speaking = energy > 0.04;
  const statusWord = speaking ? 'Speaking' : connection === ConnectionState.Connected ? 'Listening' : 'Connecting';

  const lines = (transcriptions as any[])
    .map((t, idx) => ({
      id: String(t?.id || `real-${idx}`),
      text: String(t?.text ?? '').trim(),
      identity: String(t?.participantInfo?.identity ?? t?.participantIdentity ?? ''),
    }))
    .filter((l) => l.text);

  const isEco = (id: string) => id === ECO_IDENTITY || id.startsWith('agent') || id === 'eco';

  // Auto-scroll transcript container
  React.useEffect(() => {
    if (autoScroll && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines.length, autoScroll]);

  const handleTranscriptScroll = () => {
    const el = transcriptContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isNearBottom);
  };

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch {
      /* user dismissed browser picker */
    }
  };

  const downloadTranscript = () => {
    if (lines.length === 0) {
      toast('No transcript available to export yet');
      return;
    }
    const content = lines
      .map((l) => `[${isEco(l.identity) ? 'Monica' : candidateName}]: ${l.text}`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-transcript-${candidateName.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transcript downloaded');
    setMoreMenuOpen(false);
  };

  // ────────────────────────────────────────────────────────────────────────
  // Post-Interview Completed Screen
  // ────────────────────────────────────────────────────────────────────────
  if (ended) {
    return (
      <div className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black text-eco-fg p-4 sm:p-6">
        <BackgroundBeams />

        {/* Ambient emerald illumination */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-eco-accent/15 blur-[130px]" />

        <motion.div
          className="relative z-10 flex flex-col items-center gap-6 rounded-[2.5rem] border border-white/[0.08] bg-white/[0.03] p-2 shadow-2xl backdrop-blur-2xl max-w-lg w-full"
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <div className="flex w-full flex-col items-center gap-6 rounded-[calc(2.5rem-0.5rem)] bg-neutral-950/80 px-6 sm:px-10 py-10 sm:py-12 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-eco-accent/30 bg-eco-accent/10 text-eco-accent shadow-[0_0_30px_rgba(46,230,166,0.35)]">
              <CheckIcon size={32} />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-eco-accent">
                Session Complete
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Interview Concluded
              </h2>
              <p className="text-xs sm:text-sm text-eco-muted leading-relaxed max-w-sm">
                Thank you, <span className="text-white font-medium">{candidateName}</span>. Your interview responses, audio transcript, and technical assessment have been securely recorded.
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs space-y-2.5 text-left">
              <div className="flex justify-between text-white/70">
                <span>Assessment</span>
                <span className="font-semibold text-white">{interviewTitle}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Total Duration</span>
                <span className="font-mono text-[#20C8F5]">{fmt(seconds)}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Status</span>
                <span className="text-[#53E0EC] font-medium">Evaluation in progress</span>
              </div>
            </div>

            {resultBase ? (
              <a
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFC45E] via-[#FF7049] to-[#F34BB5] px-6 text-sm font-bold text-white shadow-[0_0_28px_rgba(255,112,73,0.35)] transition-all hover:shadow-[0_0_40px_rgba(255,112,73,0.55)] active:scale-[0.98]"
                href={resultBase}
                target="_blank"
                rel="noreferrer"
              >
                View Your Scorecard &amp; Report
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.close();
                    window.location.href = resultBase || '/';
                  }
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98]"
              >
                Close Window
              </button>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-white/40">
              <ShieldCheckIcon size={14} className="text-[#20C8F5]" />
              <span>Encrypted submission · Confirmation sent via email</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Active Screen Share present
  const isScreenSharingActive = !!screenShareTrack;

  return (
    <div className="relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-black font-sans text-eco-fg antialiased select-none">
      <BackgroundBeams />

      {/* ── Top Header ── */}
      <header className="relative z-20 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/40 px-4 sm:px-8 py-3 backdrop-blur-xl">
        {/* Brand & Interview Session Info */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="HireXt Logo" className="h-7 w-auto object-contain select-none" />
          <span className="h-4 w-px bg-white/15" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white">
            Interview
          </span>

          <span className="h-3.5 w-px bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80 max-w-[160px] sm:max-w-none truncate">
              {interviewTitle}
            </span>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* AI State Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${speaking
                ? 'bg-[#F34BB5] shadow-[0_0_8px_#F34BB5]'
                : 'bg-[#20C8F5] shadow-[0_0_6px_#20C8F5]'
                }`}
            />
            <span>Monica is {statusWord.toLowerCase()}</span>
          </div>

          {/* Recording & Timer */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F52D45]/30 bg-[#F52D45]/15 px-3 py-1.5 text-[11px] font-semibold text-[#F52D45]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F52D45] animate-pulse" />
            <span className="font-mono tabular-nums">{fmt(seconds)}</span>
          </div>

          {/* Participants Counter Badge & Popover */}
          <div className="relative" ref={participantsRef}>
            <button
              type="button"
              onClick={() => setParticipantsOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-3 py-1.5 text-[11px] font-medium transition-all ${participantsOpen
                ? 'border-[#20C8F5]/60 bg-[#20C8F5]/20 text-[#53E0EC] shadow-[0_0_12px_rgba(32,200,245,0.25)]'
                : 'border-white/[0.08] bg-white/[0.03] text-white/80 hover:bg-white/[0.08] hover:text-white hover:border-white/20'
                }`}
              title="Participants"
              aria-expanded={participantsOpen}
            >
              <UsersIcon size={14} className={participantsOpen ? 'text-[#20C8F5]' : 'text-white/70'} />
              <span className="font-semibold text-white">{participantCount}</span>
              <span className="hidden sm:inline text-white/60">Participants</span>
              <ChevronDownIcon
                size={12}
                className={`transition-transform duration-200 text-white/50 ${participantsOpen ? 'rotate-180 text-white' : ''}`}
              />
            </button>

            {/* Participants Popover */}
            {participantsOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-3.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <UsersIcon size={14} className="text-[#20C8F5]" />
                    <span className="text-xs font-semibold text-white">Participants</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#20C8F5] bg-[#20C8F5]/10 px-2 py-0.5 rounded-full border border-[#20C8F5]/20">
                    {participantCount} Active
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {/* Monica AI Interviewer */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#245BFF] to-[#20C8F5] text-white font-semibold text-xs shadow-[0_0_10px_rgba(32,200,245,0.3)]">
                        M
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 ${speaking ? 'bg-[#F34BB5]' : 'bg-[#20C8F5]'}`} />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">Monica</span>
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-[#20C8F5] bg-[#20C8F5]/15 px-1.5 py-0.2 rounded border border-[#20C8F5]/30">
                            AI
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50 truncate">
                          {speaking ? 'Speaking...' : 'Listening...'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-white/60">
                      <span className={`h-2 w-2 rounded-full ${speaking ? 'bg-[#F34BB5] animate-pulse' : 'bg-[#20C8F5]'}`} />
                    </div>
                  </div>

                  {/* Candidate (You) */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white font-semibold text-xs border border-white/10">
                        {getInitials(candidateName)}
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 ${isLocalMicLive ? 'bg-emerald-400' : 'bg-[#F52D45]'}`} />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">
                            {candidateName || 'Candidate'}
                          </span>
                          <span className="text-[9px] font-medium text-white/40 bg-white/5 px-1.5 py-0.2 rounded">
                            You
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50">
                          {isLocalMicLive ? 'Mic Active' : 'Muted'} • {isLocalVideoLive ? 'Cam On' : 'Cam Off'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-white/60">
                      {isLocalMicLive ? (
                        <MicIcon size={13} className="text-emerald-400" />
                      ) : (
                        <MicOffIcon size={13} className="text-[#F52D45]" />
                      )}
                      {isLocalVideoLive ? (
                        <CameraIcon size={13} className="text-emerald-400" />
                      ) : (
                        <CameraOffIcon size={13} className="text-[#F52D45]" />
                      )}
                    </div>
                  </div>

                  {/* Additional LiveKit Remote Participants if any */}
                  {participants
                    .filter((p) => !p.isLocal && p.identity !== ECO_IDENTITY)
                    .map((p) => (
                      <div key={p.identity} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white font-semibold text-xs border border-white/10">
                            {getInitials(p.name || p.identity)}
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <span className="text-xs font-medium text-white truncate">
                              {p.name || p.identity}
                            </span>
                            <span className="text-[10px] text-white/50">Observer</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>


          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-95"
            title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {fullscreen ? <ShrinkIcon size={14} /> : <ExpandIcon size={14} />}
          </button>
        </div>
      </header>

      {/* ── Main Viewport Stage ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-2.5 px-3 sm:px-6 py-2 container mx-auto w-full">
        {/* SCREEN SHARE ACTIVE VIEW */}
        {isScreenSharingActive ? (
          <div className="relative flex flex-1 overflow-hidden rounded-[1.75rem] border border-eco-accent/30 bg-black shadow-2xl">
            <div className="relative flex h-full w-full items-center justify-center">
              <VideoTrack trackRef={screenShareTrack!} className="h-full w-full object-contain" />

              {/* Screen Share Overlay Header */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md">
                <ScreenShareIcon size={14} className="text-eco-accent" />
                <span>
                  {screenShareTrack?.participant?.isLocal
                    ? 'You are presenting your screen'
                    : `${screenShareTrack?.participant?.identity || 'Interviewer'} is presenting`}
                </span>
              </div>

              {/* Floating Picture-in-Picture Dock for AI & Candidate */}
              <div className="absolute bottom-4 right-4 z-20 flex gap-3">
                <div className="relative h-28 w-44 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl backdrop-blur-xl">
                  {showVideo ? (
                    <VideoTrack trackRef={ecoVideo!} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-black/70">
                      <span className={`h-3 w-3 rounded-full ${speaking ? 'bg-eco-accent animate-ping' : 'bg-white/30'}`} />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">
                    Monica
                  </span>
                </div>

                <div className="relative h-28 w-44 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl backdrop-blur-xl">
                  {isLocalVideoLive && localVideoMst ? (
                    <LocalSelfView mst={localVideoMst} />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-black/70 text-white/40">
                      <CameraOffIcon size={16} />
                      <span className="text-[10px] mt-1">Cam Off</span>
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">
                    You
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 w-full h-full items-stretch">
            {/* ── Left Side: Flowing Live Transcript Area (No Box, Auto-flowing, 4 Recent) ── */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between min-h-0 h-full relative py-2 px-1 sm:px-3 order-2 lg:order-1">
              {/* Transcript Stream Header */}
              <div className="flex items-center justify-end pb-3 border-b border-white/[0.06] mb-auto">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/40 hidden sm:inline">Streaming last 4 exchanges</span>
                  <button
                    type="button"
                    onClick={downloadTranscript}
                    className="flex items-center gap-1 text-[11px] font-medium text-white/60 hover:text-white transition-colors"
                    title="Export transcript as text"
                  >
                    <DownloadIcon size={13} />
                    <span>Export</span>
                  </button>
                </div>
              </div>

              {/* Flowing Transcript Dialogue Stream */}
              <div
                ref={transcriptContainerRef}
                className="relative flex flex-col justify-end gap-5 overflow-hidden flex-1 py-4"
              >
                {/* Ambient top dissolution gradient */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black to-transparent z-10" />

                {lines.length === 0 ? (
                  <div className="flex flex-col gap-2 py-8 my-auto opacity-60">
                    <div className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-[#20C8F5]">
                      <span>Ready to Begin</span>
                    </div>
                    <p className="text-sm text-white/50 max-w-md leading-relaxed">
                      As you and Monica speak, the live dialogue will flow here dynamically with real-time recognition.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 justify-end">
                    {lines.slice(-4).map((l, i) => {
                      const ecoLine = isEco(l.identity);
                      return (
                        <motion.div
                          key={l.id || `${l.identity}-${i}-${l.text.slice(0, 18)}`}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, ease: EASE }}
                          className={`flex flex-col w-full ${ecoLine ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`flex flex-col w-[80%] max-w-[80%] ${ecoLine ? 'items-start text-left' : 'items-end text-right'
                              }`}
                          >
                            {/* Speaker Label (clean text, no pill, no dot) */}
                            <span
                              className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${ecoLine ? 'text-white/40 text-left' : 'text-[#53E0EC]/70 text-right'
                                }`}
                            >
                              {ecoLine ? 'Monica' : `${candidateName} (You)`}
                            </span>

                            {/* Spoken dialogue text using Aceternity TextGenerateEffect */}
                            <div
                              className={`text-base sm:text-lg lg:text-xl font-semibold leading-relaxed tracking-tight ${ecoLine ? 'text-white text-left' : 'text-[#53E0EC] text-right'
                                }`}
                            >
                              <TextGenerateEffect
                                words={l.text}
                                duration={0.3}
                                staggerDelay={0.025}
                                className={`font-semibold ${ecoLine ? 'text-white text-left' : 'text-[#53E0EC] text-right'}`}
                              />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Side: AI & Candidate Stacked Vertically (Up and Down) ── */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3 min-h-0 h-full justify-center order-1 lg:order-2">
              {/* Eco AI Interviewer Tile (Top) */}
              <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col flex-1 min-h-0">
                <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                  {showVideo ? (
                    <VideoTrack trackRef={ecoVideo!} className="h-full w-full object-cover" />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center">
                      {/* Bottom Wavy Audio Flow (Thin Sharp Lines) */}
                      <div className="absolute inset-x-0 bottom-0 h-28 sm:h-32 overflow-hidden pointer-events-none [mask-image:linear-gradient(to_top,black_70%,transparent_100%)]">
                        <WavyBackground
                          blur={0}
                          waveWidth={1.8}
                          waveOpacity={0.9}
                          speed="fast"
                          backgroundFill="transparent"
                          colors={['#FFC45E', '#FF7049', '#F34BB5', '#245BFF', '#20C8F5']}
                          audioEnergy={energy}
                          isSpeaking={speaking}
                          containerClassName="h-full w-full"
                        />
                      </div>

                      {/* Central Normal User DP with simple circle around */}
                      <div className="relative z-10 flex flex-col items-center gap-3">
                        <div
                          className={`relative rounded-full p-1 transition-all duration-300 ${speaking
                            ? 'ring-2 ring-[#20C8F5] ring-offset-2 ring-offset-neutral-950 shadow-[0_0_20px_rgba(32,200,245,0.35)]'
                            : 'ring-1 ring-white/20 ring-offset-2 ring-offset-neutral-950'
                            }`}
                        >
                          <div className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border border-white/10 bg-neutral-900 shadow-xl">
                            <img
                              src="/images/eco-avatar.jpg"
                              alt="Monica"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md shadow-md">
                          <span
                            className={`h-2 w-2 rounded-full transition-all duration-300 ${speaking ? 'bg-[#F34BB5] shadow-[0_0_8px_#F34BB5]' : 'bg-[#20C8F5] shadow-[0_0_6px_#20C8F5]'
                              }`}
                          />
                          <span>Monica</span>
                          <span className="text-[10px] uppercase tracking-wider text-white/40">
                            {speaking ? 'Speaking' : 'Listening'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Eco Bottom Pill */}
                  <div className="absolute bottom-3 left-3 z-20 flex items-center rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                    <span>Monica</span>
                  </div>
                </div>
              </div>

              {/* Candidate Tile (Bottom) */}
              <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col flex-1 min-h-0">
                <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                  <AnimatePresence mode="wait" initial={false}>
                    {isLocalVideoLive && localVideoMst ? (
                      <motion.div
                        key="cam-active"
                        className="absolute inset-0 flex items-center justify-center overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        <LocalSelfView mst={localVideoMst} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="cam-muted"
                        className="flex flex-col items-center gap-2.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-neutral-800 to-neutral-900 text-lg font-bold text-white shadow-xl">
                          {getInitials(candidateName)}
                        </div>
                        <span className="text-xs font-medium text-white/50">Camera turned off</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Candidate Bottom Pill */}
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                    <span>{candidateName} (You)</span>
                  </div>

                  {/* Microphone Status Pill */}
                  <div className="absolute bottom-3 right-3 z-20">
                    {!isLocalMicLive ? (
                      <div className="flex items-center gap-1.5 rounded-full border border-[#F52D45]/40 bg-[#F52D45]/20 px-2.5 py-1 text-[10px] font-semibold text-[#F52D45] backdrop-blur-md">
                        <MicOffIcon size={12} />
                        <span>Muted</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full border border-[#20C8F5]/30 bg-[#20C8F5]/15 px-2.5 py-1 text-[10px] font-medium text-[#53E0EC] backdrop-blur-md">
                        <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#20C8F5] opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#20C8F5]" />
                        </span>
                        <MicIcon size={12} />
                        <span>Mic On</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Screen Share Guidance Pill (When Not Sharing) ── */}
      <AnimatePresence>
        {!sharing && !isScreenSharingActive && (
          <motion.div
            className="relative z-10 mx-auto max-w-md w-full flex items-center justify-between gap-3 rounded-full border border-[#20C8F5]/20 bg-[#20C8F5]/[0.05] px-4 py-2 text-[11px] text-white/80 backdrop-blur-md mb-2 shadow-lg"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center gap-2">
              <ScreenShareIcon size={16} className="text-[#20C8F5]" />
              <span>Share screen anytime if code or diagrams are required.</span>
            </div>
            <button
              type="button"
              onClick={toggleShare}
              className="text-[#20C8F5] font-semibold hover:underline shrink-0"
            >
              Share now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Island Control Dock ── */}
      <div className="relative z-20 flex shrink-0 justify-center px-4 pb-3 sm:pb-4 pt-1">
        <motion.footer
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-neutral-950/85 p-2 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* Split Mic Button */}
          <div className="relative" ref={micMenuRef}>
            <div
              className={`inline-flex h-11 items-stretch rounded-full border transition-all duration-200 overflow-hidden ${isLocalMicLive
                ? 'border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                : 'border-[#F52D45]/40 bg-[#F52D45]/20 text-[#F52D45] hover:bg-[#F52D45]/25'
                }`}
            >
              <button
                type="button"
                onClick={handleToggleMic}
                disabled={micActionPending}
                className="inline-flex items-center gap-2 pl-3.5 pr-2.5 text-xs font-semibold hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-60"
                title={isLocalMicLive ? 'Mute microphone' : 'Unmute microphone'}
              >
                {isLocalMicLive ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
                <span>{isLocalMicLive ? 'Mic' : 'Muted'}</span>
              </button>
              <div className="w-px self-stretch bg-white/15 my-2" />
              <button
                type="button"
                onClick={() => {
                  setMicMenuOpen((v) => !v);
                  setCameraMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className="inline-flex items-center px-2.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Microphone & speaker settings"
              >
                <ChevronUpIcon
                  size={13}
                  className={`transition-transform duration-200 ${micMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {/* Audio Device Menu Popover */}
            <AnimatePresence>
              {micMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full left-0 mb-3 w-72 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur-2xl z-30"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Microphone
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {audioDevices.map((d, i) => {
                      const isSelected = activeAudioId ? activeAudioId === d.deviceId : i === 0;
                      return (
                        <button
                          key={d.deviceId || i}
                          type="button"
                          onClick={() => handleSwitchAudio(d.deviceId, d.label || `Microphone ${i + 1}`)}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${isSelected
                            ? 'bg-[#20C8F5]/15 text-[#20C8F5] font-medium'
                            : 'text-white/80 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span className="truncate pr-2">{d.label || `Microphone ${i + 1}`}</span>
                          {isSelected && <CheckIcon size={14} className="shrink-0 text-[#20C8F5]" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="my-2 h-px bg-white/10" />

                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Speaker
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {speakerDevices.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-white/40">Default system speaker</div>
                    ) : (
                      speakerDevices.map((d, i) => {
                        const isSelected = activeSpeakerId ? activeSpeakerId === d.deviceId : i === 0;
                        return (
                          <button
                            key={d.deviceId || i}
                            type="button"
                            onClick={() => handleSwitchSpeaker(d.deviceId, d.label || `Speaker ${i + 1}`)}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${isSelected
                              ? 'bg-[#20C8F5]/15 text-[#20C8F5] font-medium'
                              : 'text-white/80 hover:bg-white/5 hover:text-white'
                              }`}
                          >
                            <span className="truncate pr-2">{d.label || `Speaker ${i + 1}`}</span>
                            {isSelected && <CheckIcon size={14} className="shrink-0 text-[#20C8F5]" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="my-2 h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={playTestSound}
                    disabled={testSoundPlaying}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#20C8F5] hover:bg-[#20C8F5]/10 transition-colors"
                  >
                    <VolumeIcon size={14} />
                    <span>{testSoundPlaying ? 'Playing tone…' : 'Test speakers'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Split Camera Button */}
          <div className="relative" ref={cameraMenuRef}>
            <div
              className={`inline-flex h-11 items-stretch rounded-full border transition-all duration-200 overflow-hidden ${isLocalVideoLive
                ? 'border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]'
                : 'border-[#F52D45]/40 bg-[#F52D45]/20 text-[#F52D45] hover:bg-[#F52D45]/25'
                }`}
            >
              <button
                type="button"
                onClick={handleToggleCamera}
                disabled={cameraActionPending}
                className="inline-flex items-center gap-2 pl-3.5 pr-2.5 text-xs font-semibold hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-60"
                title={isLocalVideoLive ? 'Turn off camera' : 'Turn on camera'}
              >
                {isLocalVideoLive ? <CameraIcon size={16} /> : <CameraOffIcon size={16} />}
                <span>{isLocalVideoLive ? 'Camera' : 'Cam off'}</span>
              </button>
              <div className="w-px self-stretch bg-white/15 my-2" />
              <button
                type="button"
                onClick={() => {
                  setCameraMenuOpen((v) => !v);
                  setMicMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className="inline-flex items-center px-2.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Camera device settings"
              >
                <ChevronUpIcon
                  size={13}
                  className={`transition-transform duration-200 ${cameraMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {/* Camera Device Menu Popover */}
            <AnimatePresence>
              {cameraMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full left-0 mb-3 w-64 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur-2xl z-30"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 px-2 pb-1">
                    Select Camera
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {videoDevices.map((d, i) => {
                      const isSelected = activeVideoId ? activeVideoId === d.deviceId : i === 0;
                      return (
                        <button
                          key={d.deviceId || i}
                          type="button"
                          onClick={() => handleSwitchVideo(d.deviceId, d.label || `Camera ${i + 1}`)}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${isSelected
                            ? 'bg-[#20C8F5]/15 text-[#20C8F5] font-medium'
                            : 'text-white/80 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span className="truncate pr-2">{d.label || `Camera ${i + 1}`}</span>
                          {isSelected && <CheckIcon size={14} className="shrink-0 text-[#20C8F5]" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Screen Share Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleShare}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-all duration-200 ${sharing
              ? 'border-[#245BFF] bg-gradient-to-r from-[#245BFF] to-[#20C8F5] text-white font-bold shadow-[0_0_18px_rgba(36,91,255,0.4)]'
              : 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12] hover:text-white'
              }`}
            title={sharing ? 'Stop sharing screen' : 'Share your screen'}
          >
            <ScreenShareIcon size={16} />
            <span className="hidden sm:inline">{sharing ? 'Sharing' : 'Share'}</span>
          </motion.button>

          {/* Settings Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white transition-all duration-200"
            title="Audio & Video Settings"
          >
            <SettingsIcon size={17} />
          </motion.button>

          {/* More Options (...) */}
          <div className="relative" ref={moreMenuRef}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setMoreMenuOpen((v) => !v);
                setMicMenuOpen(false);
                setCameraMenuOpen(false);
              }}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 ${moreMenuOpen
                ? 'border-white/20 bg-white/20 text-white'
                : 'border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white'
                }`}
              title="More options"
            >
              <MoreIcon size={17} />
            </motion.button>

            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-full right-0 mb-3 w-52 rounded-2xl border border-white/10 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur-2xl z-30 space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      toggleFullscreen();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {fullscreen ? <ShrinkIcon size={15} /> : <ExpandIcon size={15} />}
                    <span>{fullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={downloadTranscript}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <DownloadIcon size={15} />
                    <span>Export Transcript</span>
                  </button>

                  <button
                    type="button"
                    onClick={copyMeetingLink}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <CopyIcon size={15} />
                    <span>Copy Room URL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(true);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <SettingsIcon size={15} />
                    <span>Diagnostics &amp; Devices</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-6 w-px bg-white/10 mx-1" />

          {/* End Interview Button (Triggers Confirmation Modal) */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setConfirmLeaveOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F52D45] px-5 text-xs font-bold text-white transition-all duration-200 hover:bg-[#d92238] active:bg-[#b8182c] shadow-[0_2px_16px_rgba(245,45,69,0.45)] hover:shadow-[0_4px_22px_rgba(245,45,69,0.6)] cursor-pointer"
            title="Conclude interview session"
          >
            <PhoneOffIcon size={16} />
            <span>End Interview</span>
          </motion.button>
        </motion.footer>
      </div>

      {/* ── Leave Interview Confirmation Dialog ── */}
      <AnimatePresence>
        {confirmLeaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-neutral-950 p-6 shadow-2xl backdrop-blur-2xl text-white"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F52D45]/30 bg-[#F52D45]/15 text-[#F52D45] shadow-[0_0_24px_rgba(245,45,69,0.25)]">
                  <PhoneOffIcon size={24} />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold tracking-tight text-white">
                    Conclude Interview Session?
                  </h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Are you sure you want to end your interview? Once disconnected, your session will be locked and your answers submitted for scoring.
                  </p>
                </div>

                <div className="flex w-full gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLeaveOpen(false)}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
                  >
                    Stay in Interview
                  </button>
                  <button
                    type="button"
                    onClick={handleEndAndSubmit}
                    className="flex-1 rounded-xl bg-[#F52D45] py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-[#d92238] transition-colors"
                  >
                    End &amp; Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Settings & Diagnostics Modal ── */}
      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl backdrop-blur-2xl text-white"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <h3 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                  <SettingsIcon size={18} />
                  Devices &amp; Diagnostics
                </h3>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Camera
                  </label>
                  <select
                    value={activeVideoId || ''}
                    onChange={(e) => {
                      const dev = videoDevices.find((d) => d.deviceId === e.target.value);
                      if (dev) handleSwitchVideo(dev.deviceId, dev.label || 'Camera');
                    }}
                    className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-eco-accent"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900 text-white">
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Microphone
                  </label>
                  <select
                    value={activeAudioId || ''}
                    onChange={(e) => {
                      const dev = audioDevices.find((d) => d.deviceId === e.target.value);
                      if (dev) handleSwitchAudio(dev.deviceId, dev.label || 'Microphone');
                    }}
                    className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-eco-accent"
                  >
                    {audioDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900 text-white">
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Speaker &amp; Audio Output
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={activeSpeakerId || ''}
                      onChange={(e) => {
                        const dev = speakerDevices.find((d) => d.deviceId === e.target.value);
                        if (dev) handleSwitchSpeaker(dev.deviceId, dev.label || 'Speaker');
                      }}
                      className="flex-1 rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-eco-accent"
                    >
                      {speakerDevices.length === 0 ? (
                        <option value="" className="bg-neutral-900 text-white">
                          Default system speaker
                        </option>
                      ) : (
                        speakerDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900 text-white">
                            {d.label || `Speaker ${i + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={playTestSound}
                      disabled={testSoundPlaying}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-eco-accent/30 bg-eco-accent/10 px-3 py-2 text-xs font-medium text-eco-accent hover:bg-eco-accent/20 transition-colors shrink-0"
                    >
                      <VolumeIcon size={14} />
                      <span>{testSoundPlaying ? 'Playing…' : 'Test'}</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between text-white/60">
                    <span>AI Voice Isolation (Krisp)</span>
                    <span className={noiseFilterEnabled ? 'text-emerald-400 font-semibold' : 'text-white/40'}>
                      {noiseFilterEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-white/60">
                    <span>Network Stream Quality</span>
                    <span className="text-eco-accent font-semibold">HD 1080p · Adaptive</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-xl bg-white/10 px-5 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EcoInterview Root Gate Component
// ────────────────────────────────────────────────────────────────────────────
export function EcoInterview(props: EcoInterviewProps) {
  const [preAcquiredTracks, setPreAcquiredTracks] = React.useState<
    Awaited<ReturnType<typeof createLocalTracks>> | null
  >(null);
  const [userChoices, setUserChoices] = React.useState<{
    videoEnabled: boolean;
    audioEnabled: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
  }>({ videoEnabled: true, audioEnabled: true });
  const [resolvedUsername, setResolvedUsername] = React.useState<string>(
    props.candidateName || ''
  );

  if (!preAcquiredTracks) {
    return (
      <EcoPreJoin
        defaultUsername={props.candidateName}
        isNameFixed={props.isNameFixed}
        interviewTitle={props.interviewTitle || 'Assessment'}
        companyName={props.companyName || 'HireXt'}
        onJoin={(tracks, name, choices) => {
          setResolvedUsername(name);
          setUserChoices(choices);
          setPreAcquiredTracks(tracks);
        }}
      />
    );
  }

  return (
    <LiveKitRoom
      token={props.token}
      serverUrl={props.liveKitUrl}
      connect
      audio={false}
      video={false}
      className="w-full h-full min-h-[100dvh] flex flex-col"
    >
      <RoomAudioRenderer />
      <EcoInterviewRoom
        candidateName={resolvedUsername || 'Candidate'}
        interviewTitle={props.interviewTitle}
        companyName={props.companyName}
        resultBase={props.resultBase}
        previewTracks={preAcquiredTracks}
        userChoices={userChoices}
      />
    </LiveKitRoom>
  );
}
