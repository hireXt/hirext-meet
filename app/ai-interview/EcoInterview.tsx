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
import { ConnectionState, createLocalTracks, LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { WavyBackground } from '@/components/ui/wavy-background';
import { SparklesCore } from '@/components/ui/sparkles';
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
  LayoutGridIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShrinkIcon,
  SpotlightIcon,
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
  onJoin: (tracks: Awaited<ReturnType<typeof createLocalTracks>>, username: string) => void;
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
        audioContextRef.current.close().catch(() => {});
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
      // Clean up pre-join preview
      cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
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

      onJoin(tracks, username.trim());
    } catch (err: any) {
      setJoining(false);
      toast.error(`Could not initialize camera/mic: ${err.message}`);
    }
  };

  return (
    <div className="relative isolate flex min-h-[100dvh] w-full flex-col overflow-hidden bg-black font-sans text-eco-fg antialiased">
      <BackgroundBeams />

      {/* Top Navbar */}
      <header className="relative z-10 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/40 px-6 py-4 backdrop-blur-xl md:px-12">
        <div className="flex items-center gap-3.5">
          <BrandLogo theme="dark" size={32} />
          <span className="h-4 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eco-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-eco-accent shadow-[0_0_8px_#2ee6a6]" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-eco-accent">
              Eco AI Interview
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheckIcon size={16} className="text-eco-accent" />
          <span className="hidden sm:inline">Secure candidate evaluation room</span>
        </div>
      </header>

      {/* Main PreJoin Stage */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-4 sm:p-8">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Left Column: Video Preview & Quick Controls */}
          <div className="flex flex-col items-center gap-4 lg:col-span-7">
            <div className="relative aspect-video w-full overflow-hidden rounded-[2rem] border border-white/[0.08] bg-neutral-950/80 shadow-2xl backdrop-blur-2xl">
              {videoEnabled ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/40">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <CameraOffIcon size={28} />
                  </div>
                  <span className="text-xs font-medium">Camera is turned off</span>
                </div>
              )}

              {/* Floating Camera Overlays */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                {/* Audio Level Meter */}
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-md">
                  <span
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${
                      micLevel > 15
                        ? 'bg-eco-accent shadow-[0_0_8px_#2ee6a6]'
                        : 'bg-white/30'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-white/80">
                    {audioEnabled
                      ? micLevel > 15
                        ? 'Microphone active'
                        : 'Speak to test mic'
                      : 'Microphone muted'}
                  </span>
                  {audioEnabled && (
                    <div className="flex items-center gap-0.5 h-3 pl-1">
                      <span
                        className="w-1 bg-eco-accent rounded-full transition-all"
                        style={{ height: `${Math.max(3, micLevel * 0.16)}px` }}
                      />
                      <span
                        className="w-1 bg-eco-accent rounded-full transition-all"
                        style={{ height: `${Math.max(4, micLevel * 0.24)}px` }}
                      />
                      <span
                        className="w-1 bg-eco-accent rounded-full transition-all"
                        style={{ height: `${Math.max(3, micLevel * 0.18)}px` }}
                      />
                    </div>
                  )}
                </div>

                {/* Cam / Mic Quick Toggles on Viewport */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${
                      audioEnabled
                        ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
                        : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
                    }`}
                    title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    {audioEnabled ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleCam}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${
                      videoEnabled
                        ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
                        : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
                    }`}
                    title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {videoEnabled ? <CameraIcon size={18} /> : <CameraOffIcon size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Permission banner */}
            {permissionError && (
              <div className="flex w-full items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <WarningIcon size={16} className="shrink-0" />
                <span>{permissionError}</span>
              </div>
            )}
          </div>

          {/* Right Column: Candidate Info & Hardware Check */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl backdrop-blur-2xl">
              <div className="flex flex-col gap-5 rounded-[calc(2rem-0.375rem)] bg-neutral-950/70 p-6 sm:p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-eco-accent">
                    {companyName}
                  </div>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                    {interviewTitle}
                  </h1>
                  <p className="mt-1.5 text-xs text-eco-muted leading-relaxed">
                    Welcome. Check your devices and enter your name to begin your interactive AI interview session.
                  </p>
                </div>

                <form onSubmit={handleEnterInterview} className="flex flex-col gap-4">
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
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white placeholder-white/25 transition-all focus:border-eco-accent focus:bg-white/[0.08] focus:outline-none"
                    />
                  </div>

                  {/* Device Selectors */}
                  <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                        <span className="font-semibold uppercase tracking-wider">Camera</span>
                        <span className="text-[10px] text-eco-accent">Verified</span>
                      </div>
                      <select
                        value={selectedVideoId}
                        onChange={(e) => {
                          setSelectedVideoId(e.target.value);
                          startPreview(e.target.value, selectedAudioId);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-eco-accent"
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
                        <span className="text-[10px] text-eco-accent">Active</span>
                      </div>
                      <select
                        value={selectedAudioId}
                        onChange={(e) => {
                          setSelectedAudioId(e.target.value);
                          startPreview(selectedVideoId, e.target.value);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-eco-accent"
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
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-eco-accent hover:underline"
                        >
                          <VolumeIcon size={12} />
                          <span>{testPlaying ? 'Testing…' : 'Test Sound'}</span>
                        </button>
                      </div>
                      <select
                        value={selectedSpeakerId}
                        onChange={(e) => setSelectedSpeakerId(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-eco-accent"
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
                    className="relative mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-eco-accent font-semibold text-neutral-950 text-sm shadow-[0_0_24px_rgba(46,230,166,0.35)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_36px_rgba(46,230,166,0.55)] active:scale-[0.98] disabled:opacity-50"
                  >
                    {joining ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
                        <span>Connecting to Eco…</span>
                      </span>
                    ) : (
                      <span>Enter Interview Room</span>
                    )}
                  </button>
                </form>

                {/* Privacy Badge */}
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                  <ShieldCheckIcon size={14} className="text-emerald-400" />
                  <span>AI evaluation starts when you click enter</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
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
}: {
  candidateName: string;
  interviewTitle?: string;
  companyName?: string;
  resultBase?: string;
  previewTracks: Awaited<ReturnType<typeof createLocalTracks>>;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const connection = useConnectionState();
  const transcriptions = useTranscriptions();
  const publishedRef = React.useRef(false);

  // Subscribe to Mic, Camera, and ScreenShare tracks
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false },
  );

  const env = (t: TrackReferenceOrPlaceholder) => t.participant?.identity === ECO_IDENTITY;
  const ecoAudio = tracks.find((t) => env(t) && t.source === Track.Source.Microphone);
  const ecoVideo = tracks.find((t) => env(t) && t.source === Track.Source.Camera);
  const localCam = tracks.find((t) => t.participant?.isLocal && t.source === Track.Source.Camera);
  const screenShareTrack = tracks.find((t) => t.source === Track.Source.ScreenShare);

  // Audio energy calculation for avatar ripples
  const bands = useMultibandTrackVolume(ecoAudio, { bands: 4, updateInterval: 60 });
  const energy = bands.reduce((a, b) => a + b, 0) / 4;

  // Publish pre-acquired tracks upon room connection
  React.useEffect(() => {
    if (connection !== ConnectionState.Connected || publishedRef.current) return;
    publishedRef.current = true;
    previewTracks.forEach((t) => {
      room.localParticipant.publishTrack(t).catch(() => {});
    });
  }, [connection, previewTracks, room]);

  const [seconds, setSeconds] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const hasConnected = React.useRef(false);

  // Layout View: 'split' | 'spotlight'
  const [layoutMode, setLayoutMode] = React.useState<'split' | 'spotlight'>('split');
  // Closed Captions Drawer toggle
  const [captionsOpen, setCaptionsOpen] = React.useState(true);
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
  const [activeVideoId, setActiveVideoId] = React.useState<string | undefined>(undefined);
  const [activeAudioId, setActiveAudioId] = React.useState<string | undefined>(undefined);
  const [activeSpeakerId, setActiveSpeakerId] = React.useState<string | undefined>(undefined);

  // Popovers & Dialogs
  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [testSoundPlaying, setTestSoundPlaying] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  // AI Noise Cancellation (Krisp)
  const [noiseFilterEnabled, setNoiseFilterEnabled] = React.useState(true);
  const noiseProcessorRef = React.useRef<LiveKitVoiceNoiseProcessor | null>(null);

  const micMenuRef = React.useRef<HTMLDivElement>(null);
  const cameraMenuRef = React.useRef<HTMLDivElement>(null);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(micMenuRef, micMenuOpen, () => setMicMenuOpen(false));
  useClickOutside(cameraMenuRef, cameraMenuOpen, () => setCameraMenuOpen(false));
  useClickOutside(moreMenuRef, moreMenuOpen, () => setMoreMenuOpen(false));

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

  const handleSwitchAudio = async (deviceId: string, label: string) => {
    try {
      setActiveAudioId(deviceId);
      await room.switchActiveDevice('audioinput', deviceId);
      const lp = room.localParticipant;
      if (lp) {
        if (!lp.isMicrophoneEnabled) {
          await lp.setMicrophoneEnabled(true, { deviceId }).catch(() => undefined);
        }
        const pub = lp.getTrackPublication(Track.Source.Microphone);
        const track = pub?.track as LocalAudioTrack | undefined;
        if (track && track.isMuted) {
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
        if (!lp.isCameraEnabled) {
          await lp.setCameraEnabled(true, { deviceId }).catch(() => undefined);
        }
        const pub = lp.getTrackPublication(Track.Source.Camera);
        const track = pub?.track as LocalVideoTrack | undefined;
        if (track && track.isMuted) {
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
      .map((l) => `[${isEco(l.identity) ? 'Eco (AI Interviewer)' : candidateName}]: ${l.text}`)
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
                <span className="font-mono text-eco-accent">{fmt(seconds)}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Status</span>
                <span className="text-emerald-400 font-medium">Evaluation in progress</span>
              </div>
            </div>

            {resultBase ? (
              <a
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-eco-accent px-6 text-sm font-semibold text-neutral-950 shadow-[0_0_24px_rgba(46,230,166,0.3)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_36px_rgba(46,230,166,0.5)] active:scale-[0.98]"
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
                  if (typeof window !== 'undefined') window.close();
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98]"
              >
                Close Window
              </button>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-white/40">
              <ShieldCheckIcon size={14} className="text-emerald-400" />
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
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eco-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-eco-accent shadow-[0_0_8px_#2ee6a6]" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">Eco</span>
          </div>

          <span className="h-3.5 w-px bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80 max-w-[160px] sm:max-w-none truncate">
              {interviewTitle}
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
              {companyName}
            </span>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* AI State Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                speaking
                  ? 'bg-eco-accent shadow-[0_0_6px_#2ee6a6]'
                  : 'bg-white/30'
              }`}
            />
            <span>Eco is {statusWord.toLowerCase()}</span>
          </div>

          {/* Recording & Timer */}
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono tabular-nums">{fmt(seconds)}</span>
          </div>

          {/* Layout Mode Toggle */}
          <button
            type="button"
            onClick={() => setLayoutMode((m) => (m === 'split' ? 'spotlight' : 'split'))}
            className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title={`Switch to ${layoutMode === 'split' ? 'Spotlight View' : 'Split View'}`}
          >
            {layoutMode === 'split' ? <SpotlightIcon size={14} /> : <LayoutGridIcon size={14} />}
            <span>{layoutMode === 'split' ? 'Spotlight' : 'Grid'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {fullscreen ? <ShrinkIcon size={14} /> : <ExpandIcon size={14} />}
          </button>
        </div>
      </header>

      {/* ── Main Viewport Stage ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-3 sm:px-6 py-3 max-w-7xl mx-auto w-full">
        {/* Video / Content Stage */}
        <div className="relative flex min-h-0 flex-1 flex-col">
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
                  {/* Eco Mini Tile */}
                  <div className="relative h-28 w-44 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl backdrop-blur-xl">
                    {showVideo ? (
                      <VideoTrack trackRef={ecoVideo!} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-black/70">
                        <span className={`h-3 w-3 rounded-full ${speaking ? 'bg-eco-accent animate-ping' : 'bg-white/30'}`} />
                      </div>
                    )}
                    <span className="absolute bottom-1.5 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">
                      Eco
                    </span>
                  </div>

                  {/* Candidate Mini Tile */}
                  <div className="relative h-28 w-44 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl backdrop-blur-xl">
                    {localCam ? (
                      <VideoTrack trackRef={localCam} className="h-full w-full scale-x-[-1] object-cover" />
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
          ) : layoutMode === 'spotlight' ? (
            /* SPOTLIGHT VIEW (Eco Full Stage, Candidate PiP) */
            <div className="relative flex flex-1 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(2rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                {showVideo ? (
                  <VideoTrack trackRef={ecoVideo!} className="h-full w-full object-cover" />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center">
                    {/* Aceternity wave background */}
                    <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)] pointer-events-none">
                      <WavyBackground
                        blur={10}
                        waveWidth={45}
                        waveOpacity={0.4}
                        speed="fast"
                        backgroundFill="transparent"
                        audioEnergy={energy}
                        isSpeaking={speaking}
                      />
                    </div>

                    {/* Central AI Voice Core (Neural Orb) */}
                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <div className="relative flex items-center justify-center">
                        {/* Outer pulsating resonance rings */}
                        <div
                          className="absolute h-36 w-36 rounded-full border border-eco-accent/30 transition-all duration-300"
                          style={{
                            transform: `scale(${1 + energy * 1.5})`,
                            opacity: speaking ? 0.7 : 0.2,
                            boxShadow: speaking ? '0 0 40px rgba(46,230,166,0.3)' : 'none',
                          }}
                        />
                        <div
                          className="absolute h-28 w-28 rounded-full border border-eco-teal/40 transition-all duration-200"
                          style={{
                            transform: `scale(${1 + energy * 1.2})`,
                            opacity: speaking ? 0.9 : 0.3,
                          }}
                        />

                        {/* Central glowing sphere */}
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-eco-teal via-eco-accent to-emerald-300 shadow-[0_0_30px_#2ee6a6]">
                          <SparklesCore
                            background="transparent"
                            minSize={0.4}
                            maxSize={1.5}
                            particleCount={12}
                            particleColor="#ffffff"
                            speed={5}
                            className="h-full w-full"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md shadow-lg">
                        <span className={`h-2 w-2 rounded-full ${speaking ? 'bg-eco-accent animate-pulse shadow-[0_0_8px_#2ee6a6]' : 'bg-white/30'}`} />
                        <span>Eco (AI Interviewer)</span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          {speaking ? 'Speaking' : 'Listening'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Candidate Floating Picture-in-Picture Tile */}
                <div className="absolute bottom-4 right-4 z-20 h-36 w-56 overflow-hidden rounded-2xl border border-white/20 bg-neutral-900/90 shadow-2xl backdrop-blur-xl">
                  {localCam ? (
                    <VideoTrack trackRef={localCam} className="h-full w-full scale-x-[-1] object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-white/40">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 font-semibold text-white/80">
                        {getInitials(candidateName)}
                      </div>
                      <span className="text-[10px] mt-1">Camera off</span>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                    <span>{candidateName} (You)</span>
                    {!isMicrophoneEnabled && <MicOffIcon size={12} className="text-red-400" />}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* SPLIT GRID VIEW (Default 50/50 Side-by-Side) */
            <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-h-0">
              {/* Eco AI Interviewer Tile */}
              <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col min-h-0">
                <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                  {showVideo ? (
                    <VideoTrack trackRef={ecoVideo!} className="h-full w-full object-cover" />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center">
                      <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)] pointer-events-none">
                        <WavyBackground
                          blur={10}
                          waveWidth={45}
                          waveOpacity={0.4}
                          speed="fast"
                          backgroundFill="transparent"
                          audioEnergy={energy}
                          isSpeaking={speaking}
                        />
                      </div>

                      {/* Central Animated Neural Voice Core */}
                      <div className="relative z-10 flex flex-col items-center gap-3">
                        <div className="relative flex items-center justify-center">
                          {/* Pulsing ring on speech */}
                          <div
                            className="absolute h-28 w-28 rounded-full border border-eco-accent/30 transition-all duration-300"
                            style={{
                              transform: `scale(${1 + energy * 1.4})`,
                              opacity: speaking ? 0.7 : 0.2,
                              boxShadow: speaking ? '0 0 30px rgba(46,230,166,0.3)' : 'none',
                            }}
                          />
                          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-eco-teal via-eco-accent to-emerald-300 shadow-[0_0_24px_#2ee6a6]">
                            <SparklesCore
                              background="transparent"
                              minSize={0.4}
                              maxSize={1.4}
                              particleCount={10}
                              particleColor="#ffffff"
                              speed={4}
                              className="h-full w-full"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md shadow-md">
                          <span
                            className={`h-2 w-2 rounded-full transition-all duration-300 ${
                              speaking ? 'bg-eco-accent shadow-[0_0_8px_#2ee6a6]' : 'bg-white/30'
                            }`}
                          />
                          <span>Eco</span>
                          <span className="text-[10px] uppercase tracking-wider text-white/40">
                            {speaking ? 'Speaking' : 'Listening'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Eco Bottom Pill */}
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-eco-accent" />
                    <span>Eco (AI Interviewer)</span>
                  </div>
                </div>
              </div>

              {/* Candidate Tile */}
              <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl flex flex-col min-h-0">
                <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-neutral-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                  <AnimatePresence mode="wait" initial={false}>
                    {localCam ? (
                      <motion.div
                        key="cam-active"
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        <VideoTrack trackRef={localCam} className="h-full w-full scale-x-[-1] object-cover" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="cam-muted"
                        className="flex flex-col items-center gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-neutral-800 to-neutral-900 text-xl font-bold text-white shadow-xl">
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
                    {!isMicrophoneEnabled ? (
                      <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-300 backdrop-blur-md">
                        <MicOffIcon size={12} />
                        <span>Muted</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-300 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Mic On</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Closed Captions & Live Transcription Drawer ── */}
        <AnimatePresence>
          {captionsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: '170px' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950/60 shadow-xl backdrop-blur-xl"
            >
              {/* Transcript Header Bar */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <ClosedCaptionsIcon size={15} className="text-eco-accent" />
                  <span className="font-semibold text-white/80">Live AI Transcript</span>
                  <span className="text-[10px] text-white/40">Real-time evaluation stream</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadTranscript}
                    className="flex items-center gap-1 text-[11px] font-medium text-white/60 hover:text-white transition-colors"
                    title="Export transcript as text"
                  >
                    <DownloadIcon size={13} />
                    <span className="hidden sm:inline">Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCaptionsOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Minimize captions"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              </div>

              {/* Scrollable Dialogue Area */}
              <div
                ref={transcriptContainerRef}
                onScroll={handleTranscriptScroll}
                className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
              >
                {lines.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <span className="text-xs text-white/50">
                      The conversation transcript will appear here automatically as you and Eco speak.
                    </span>
                  </div>
                ) : (
                  lines.map((l, i) => {
                    const ecoLine = isEco(l.identity);
                    return (
                      <div
                        key={`${l.identity}-${i}`}
                        className={`flex items-start gap-2.5 ${ecoLine ? '' : 'ml-auto justify-end max-w-[80%]'}`}
                      >
                        {ecoLine && (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-eco-accent/15 border border-eco-accent/30 text-eco-accent text-[10px] font-bold">
                            AI
                          </div>
                        )}

                        <div
                          className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            ecoLine
                              ? 'border border-white/10 bg-white/[0.04] text-white/90'
                              : 'border border-eco-accent/25 bg-eco-accent/[0.08] text-white font-medium'
                          }`}
                        >
                          <div className="text-[10px] font-semibold text-white/40 mb-0.5">
                            {ecoLine ? 'Eco (Interviewer)' : candidateName}
                          </div>
                          {ecoLine ? (
                            <TextGenerateEffect words={l.text} staggerDelay={0.03} />
                          ) : (
                            <span>{l.text}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Jump to latest button if user scrolled up */}
              {!autoScroll && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoScroll(true);
                    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-eco-accent/30 bg-neutral-900/90 px-3 py-1 text-[11px] font-medium text-eco-accent shadow-lg backdrop-blur-md hover:bg-neutral-800 transition-all"
                >
                  <ChevronDownIcon size={13} />
                  <span>Latest messages</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Screen Share Guidance Pill (When Not Sharing) ── */}
      <AnimatePresence>
        {!sharing && !isScreenSharingActive && (
          <motion.div
            className="relative z-10 mx-auto max-w-md w-full flex items-center justify-between gap-3 rounded-full border border-eco-accent/20 bg-eco-accent/[0.05] px-4 py-2 text-[11px] text-white/80 backdrop-blur-md mb-2 shadow-lg"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center gap-2">
              <ScreenShareIcon size={16} className="text-eco-accent" />
              <span>Share screen anytime if code or diagrams are required.</span>
            </div>
            <button
              type="button"
              onClick={toggleShare}
              className="text-eco-accent font-semibold hover:underline shrink-0"
            >
              Share now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Island Control Dock ── */}
      <div className="relative z-20 flex shrink-0 justify-center px-4 pb-4 pt-1">
        <motion.footer
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-neutral-950/80 p-1.5 sm:p-2 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* Split Mic Button */}
          <div className="relative" ref={micMenuRef}>
            <div
              className={`inline-flex h-10 items-center rounded-full border transition-all duration-300 ${
                isMicrophoneEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                  : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
              }`}
            >
              <button
                type="button"
                onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
                className="inline-flex h-full items-center gap-2 pl-3.5 pr-2 text-[12px] font-medium transition-transform active:scale-95"
                title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {isMicrophoneEnabled ? <MicIcon size={17} /> : <MicOffIcon size={17} />}
                <span>{isMicrophoneEnabled ? 'Mic' : 'Muted'}</span>
              </button>
              <div className="h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => {
                  setMicMenuOpen((v) => !v);
                  setCameraMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className={`inline-flex h-full items-center px-2 text-white/60 hover:text-white transition-all ${
                  micMenuOpen ? 'rotate-180 text-white' : ''
                }`}
                title="Microphone and speaker settings"
              >
                <ChevronUpIcon size={13} />
              </button>
            </div>

            {/* Audio Device Menu Popover */}
            <AnimatePresence>
              {micMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
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
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-eco-accent/15 text-eco-accent font-medium'
                              : 'text-white/80 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className="truncate pr-2">{d.label || `Microphone ${i + 1}`}</span>
                          {isSelected && <CheckIcon size={14} className="shrink-0 text-eco-accent" />}
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
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                              isSelected
                                ? 'bg-eco-accent/15 text-eco-accent font-medium'
                                : 'text-white/80 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{d.label || `Speaker ${i + 1}`}</span>
                            {isSelected && <CheckIcon size={14} className="shrink-0 text-eco-accent" />}
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
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-eco-accent hover:bg-eco-accent/10 transition-colors"
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
              className={`inline-flex h-10 items-center rounded-full border transition-all duration-300 ${
                isCameraEnabled
                  ? 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
                  : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
              }`}
            >
              <button
                type="button"
                onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
                className="inline-flex h-full items-center gap-2 pl-3.5 pr-2 text-[12px] font-medium transition-transform active:scale-95"
                title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {isCameraEnabled ? <CameraIcon size={17} /> : <CameraOffIcon size={17} />}
                <span>{isCameraEnabled ? 'Camera' : 'Cam off'}</span>
              </button>
              <div className="h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => {
                  setCameraMenuOpen((v) => !v);
                  setMicMenuOpen(false);
                  setMoreMenuOpen(false);
                }}
                className={`inline-flex h-full items-center px-2 text-white/60 hover:text-white transition-all ${
                  cameraMenuOpen ? 'rotate-180 text-white' : ''
                }`}
                title="Camera device settings"
              >
                <ChevronUpIcon size={13} />
              </button>
            </div>

            {/* Camera Device Menu Popover */}
            <AnimatePresence>
              {cameraMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
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
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-eco-accent/15 text-eco-accent font-medium'
                              : 'text-white/80 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className="truncate pr-2">{d.label || `Camera ${i + 1}`}</span>
                          {isSelected && <CheckIcon size={14} className="shrink-0 text-eco-accent" />}
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
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium transition-all duration-300 ${
              sharing
                ? 'border-eco-accent bg-eco-accent text-neutral-950 font-semibold shadow-[0_0_16px_rgba(46,230,166,0.4)]'
                : 'border-white/10 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
            }`}
            title={sharing ? 'Stop sharing screen' : 'Share your screen'}
          >
            <ScreenShareIcon size={17} />
            <span className="hidden sm:inline">{sharing ? 'Sharing' : 'Share'}</span>
          </motion.button>

          {/* Captions (CC) Drawer Toggle */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setCaptionsOpen((v) => !v)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all duration-300 ${
              captionsOpen
                ? 'border-eco-accent/40 bg-eco-accent/15 text-eco-accent'
                : 'border-white/10 bg-white/[0.06] text-white/60 hover:text-white'
            }`}
            title="Toggle Live Transcript & Closed Captions"
          >
            <ClosedCaptionsIcon size={16} />
            <span className="hidden sm:inline">CC</span>
          </motion.button>

          {/* AI Noise Isolation (Krisp) Toggle */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleNoiseFilter}
            className={`hidden sm:inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all duration-300 ${
              noiseFilterEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'border-white/10 bg-white/[0.06] text-white/50 hover:bg-white/[0.12] hover:text-white/80'
            }`}
            title={noiseFilterEnabled ? 'Voice Isolation: Active' : 'Voice Isolation: Disabled'}
          >
            <ShieldCheckIcon size={16} />
            <span className="hidden md:inline">Voice Filter</span>
          </motion.button>

          {/* Settings Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white transition-all"
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
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                moreMenuOpen
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
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
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

          <div className="h-5 w-px bg-white/10 mx-1" />

          {/* End Interview Button (Triggers Confirmation Modal) */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setConfirmLeaveOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-4 text-[12px] font-medium text-red-300 transition-all duration-300 hover:bg-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
            title="Conclude interview session"
          >
            <PhoneOffIcon size={16} />
            <span>Leave</span>
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
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15 text-red-400 shadow-[0_0_24px_rgba(239,68,68,0.25)]">
                  <PhoneOffIcon size={24} />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold tracking-tight text-white">
                    Conclude Interview Session?
                  </h3>
                  <p className="text-xs text-eco-muted leading-relaxed">
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
                    onClick={() => {
                      setConfirmLeaveOpen(false);
                      room.disconnect();
                    }}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-red-600 transition-colors"
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
  const [resolvedUsername, setResolvedUsername] = React.useState<string>(
    props.candidateName || ''
  );

  if (!preAcquiredTracks) {
    return (
      <EcoPreJoin
        defaultUsername={props.candidateName}
        isNameFixed={props.isNameFixed}
        interviewTitle={props.interviewTitle || 'AI Technical Assessment'}
        companyName={props.companyName || 'HireXt'}
        onJoin={(tracks, name) => {
          setResolvedUsername(name);
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
      />
    </LiveKitRoom>
  );
}
