'use client';

import * as React from 'react';
import {
  Chat,
  isTrackReference,
  RoomAudioRenderer,
  StartAudio,
  useConnectionQualityIndicator,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { MessageFormatter, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { ConnectionState, LocalAudioTrack, Participant, ParticipantEvent, Track, TrackEvent } from 'livekit-client';
import { LiveKitVoiceNoiseProcessor } from '../audioNoiseFilter';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRecording } from './useRecording';
import {
  BrandLogo,
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  GoogleMeetLogo,
  HandIcon,
  InfoIcon,
  LayoutGridIcon,
  LogoMark,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  RecordIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShrinkIcon,
  SpotlightIcon,
  UsersIcon,
  VolumeIcon,
} from './icons';
import { playSpeakerTestSound } from '@/lib/audioTest';


type PanelId = 'chat' | 'participants' | 'settings' | 'info' | null;
type LayoutMode = 'grid' | 'spotlight';

export interface AILinkRoomProps {
  chatMessageFormatter?: MessageFormatter;
  SettingsComponent?: React.ComponentType<{ onClose?: () => void; recordingEnabled?: boolean }>;
  label?: string;
  onLeaveRequest?: () => void;
  museTalkEnabled?: boolean;
  /**
   * True when the server armed this interview for recording (Egress). The REC
   * pill + announcement show whenever Egress is active (real state) OR armed —
   * the honest, non-cosmetic version of the banner.
   */
  recordingEnabled?: boolean;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function displayName(p: Participant): string {
  return p.name || p.identity || 'Guest';
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

function useIsTrackMuted(participant: Participant, source: Track.Source): boolean {
  const readMuted = () => {
    const pub = participant.getTrackPublication(source);
    return pub ? pub.isMuted : true;
  };
  const [muted, setMuted] = React.useState<boolean>(() => readMuted());

  React.useEffect(() => {
    const update = () => setMuted(readMuted());
    const resubscribeToPublication = () => {
      const pub = participant.getTrackPublication(source);
      pub?.on?.(TrackEvent.Muted, update);
      pub?.on?.(TrackEvent.Unmuted, update);
      update();
    };

    resubscribeToPublication();

    participant.on(ParticipantEvent.TrackMuted, update);
    participant.on(ParticipantEvent.TrackUnmuted, update);
    participant.on(ParticipantEvent.TrackPublished, resubscribeToPublication);
    participant.on(ParticipantEvent.TrackUnpublished, update);
    // Local participant emits these instead of the generic ones above
    participant.on(ParticipantEvent.LocalTrackPublished, resubscribeToPublication);
    participant.on(ParticipantEvent.LocalTrackUnpublished, update);

    return () => {
      participant.getTrackPublication(source)?.off?.(TrackEvent.Muted, update);
      participant.getTrackPublication(source)?.off?.(TrackEvent.Unmuted, update);
      participant.off(ParticipantEvent.TrackMuted, update);
      participant.off(ParticipantEvent.TrackUnmuted, update);
      participant.off(ParticipantEvent.TrackPublished, resubscribeToPublication);
      participant.off(ParticipantEvent.TrackUnpublished, update);
      participant.off(ParticipantEvent.LocalTrackPublished, resubscribeToPublication);
      participant.off(ParticipantEvent.LocalTrackUnpublished, update);
    };
  }, [participant, source]);

  return muted;
}
function trackKey(ref: TrackReferenceOrPlaceholder): string {
  return `${ref.participant.identity}:${ref.source}`;
}

/**
 * Google-Meet-style self-view: attaches the LIVE MediaStreamTrack directly to
 * a <video> element. No publication flags, no mute caches, no useTracks
 * placeholder timing — if the OS is delivering frames, they show here.
 */
function LocalSelfView({ mst, name }: { mst: MediaStreamTrack; name: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
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
    <div className="ail-tile ail-tile--self" data-testid="local-selfview-tile">
      <video ref={videoRef} className="ail-tile-video" autoPlay playsInline muted />
      <div className="ail-chip ail-name-pill">
        <span>{`${name} (You)`}</span>
      </div>
    </div>
  );
}

function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <div
      className="ail-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a73e8, #6366f1)',
        color: '#ffffff',
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      {initials(name)}
    </div>
  );
}

function ConnectionChip() {
  const state = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  let tone = 'good';
  let pulse = false;
  let label = 'Good';

  if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) {
    tone = 'warn';
    pulse = true;
    label = 'Connecting…';
  } else if (state === ConnectionState.Disconnected) {
    tone = 'bad';
    label = 'Disconnected';
  } else if (quality === 'lost') {
    tone = 'bad';
    pulse = true;
    label = 'Reconnecting…';
  } else if (quality === 'poor') {
    tone = 'warn';
    label = 'Weak';
  }

  return (
    <div className={cx('ail-chip', 'ail-conn', `ail-conn--${tone}`)} title={`Connection: ${label}`}>
      <span className={cx('ail-dot', pulse && 'ail-dot--pulse')} />
      <span>{label}</span>
    </div>
  );
}

function Tile({
  trackRef,
  isSpotlight = false,
  onRescueCamera,
  camRescuePending = false,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  isSpotlight?: boolean;
  onRescueCamera?: () => void;
  camRescuePending?: boolean;
}) {
  const { participant, source } = trackRef;
  const isScreen = source === Track.Source.ScreenShare;
  const camMuted = useIsTrackMuted(participant, Track.Source.Camera);
  const micMuted = useIsTrackMuted(participant, Track.Source.Microphone);
  const isSpeaking = useIsSpeaking(participant);
  // Like Google Meet: if the publication carries a live track, SHOW THE VIDEO.
  // The local camMuted flag is a separate concern (it can wedge when mute
  // events fire before the publication registers) and must never hide a live
  // local track — otherwise: tile says "Camera off" while the server receives
  // frames. A stuck flag is recoverable via the rescue button, not by hiding.
  const hasLiveLocalTrack =
    !isScreen &&
    participant.isLocal &&
    isTrackReference(trackRef) &&
    !!trackRef.publication?.track &&
    trackRef.publication.track.mediaStreamTrack?.readyState === 'live';
  const hasVideo =
    isTrackReference(trackRef) &&
    !!trackRef.publication &&
    !!trackRef.publication.track &&
    !trackRef.publication.isMuted;
  const showVideo = isScreen ? hasVideo : hasVideo || hasLiveLocalTrack;
  const name = displayName(participant);

  return (
    <div
      className={cx(
        'ail-tile',
        isSpeaking && !micMuted && 'ail-tile--speaking',
        isScreen && 'ail-tile--screen',
        isSpotlight && 'ail-tile--spotlight',
      )}
      data-identity={participant.identity}
    >
      {showVideo ? (
        <VideoTrack
          trackRef={trackRef as any}
          className="ail-tile-video"
          style={{ objectFit: isScreen ? 'contain' : 'cover' }}
        />
      ) : (
        <div className="ail-tile-avatar">
          <div className={cx('ail-avatar-halo', isSpeaking && !micMuted && 'ail-avatar-halo--speaking')}>
            <Avatar name={name} size={isSpotlight ? 96 : 72} />
          </div>
          {!isScreen && camMuted && <span className="ail-tile-hint">Camera off</span>}
          {!isScreen && participant.isLocal && onRescueCamera && (
            <button
              type="button"
              className="ail-tile-rescue"
              onClick={onRescueCamera}
              disabled={camRescuePending}
              title="Force the camera back on"
            >
              {camRescuePending ? 'Starting…' : 'Turn camera back on'}
            </button>
          )}
        </div>
      )}
      <div className="ail-chip ail-name-pill">
        <span>{isScreen ? `${name}'s screen` : `${name}${participant.isLocal ? ' (You)' : ''}`}</span>
        {micMuted && !isScreen && (
          <span className="ail-mic-muted-icon" title="Microphone muted">
            <MicOffIcon size={13} />
          </span>
        )}
      </div>
    </div>
  );
}

function Menu({
  trigger,
  open,
  onToggle,
  children,
  align = 'left',
}: {
  trigger: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, onToggle);
  return (
    <div className="ail-menu" ref={ref}>
      <button
        type="button"
        className={cx('ail-icon-btn', open && 'ail-icon-btn--active')}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {trigger}
      </button>
      {open && (
        <div className={cx('ail-menu-popover', `ail-menu-popover--${align}`)} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

interface TopNavProps {
  label: string;
  layout: LayoutMode;
  recording: ReturnType<typeof useRecording>;
  fullscreen: boolean;
  onLayout: (mode: LayoutMode) => void;
  onFullscreen: () => void;
}

function TopNav(props: TopNavProps) {
  const room = useRoomContext();
  const [roomMenuOpen, setRoomMenuOpen] = React.useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = React.useState(false);
  const roomMenuRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(roomMenuRef, roomMenuOpen, () => setRoomMenuOpen(false));

  const copyInvite = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() =>
        toast.success(
          window.location.hash
            ? 'Invite link copied (with passphrase)'
            : 'Invite link copied to clipboard',
        ),
      )
      .catch(() => toast.error('Could not copy link'));
    setRoomMenuOpen(false);
  };

  const secure = room.isE2EEEnabled;

  return (
    <header className="ail-nav">
      <div className="ail-nav-left">
        <Link className="ail-brand" href="/" title="meeXt home">
          <BrandLogo theme="dark" size={32} />
        </Link>
        <span className="ail-v-divider" aria-hidden="true" />
        <div className="ail-room" ref={roomMenuRef}>
          <button
            type="button"
            className="ail-room-trigger"
            onClick={() => setRoomMenuOpen((v) => !v)}
            aria-expanded={roomMenuOpen}
            aria-haspopup="menu"
            title="Meeting details"
          >
            <span className="ail-room-code">{(room.name || props.label).toUpperCase()}</span>
            <ChevronDownIcon size={14} className="ail-caret" />
          </button>
          {roomMenuOpen && (
            <div className="ail-menu-popover ail-menu-popover--left ail-room-card" role="menu">
              <div className="ail-room-card-title">Meeting details</div>
              <div className="ail-room-card-id">{(room.name || props.label).toUpperCase()}</div>
              <div className="ail-room-card-row">
                <ShieldCheckIcon size={15} />
                {secure ? 'End-to-end encrypted' : 'Encrypted real-time stream'}
              </div>
              <button type="button" className="ail-menu-item" onClick={copyInvite}>
                <CopyIcon size={15} />
                Copy joining link
              </button>
            </div>
          )}
        </div>
        <div className="ail-secure" title={secure ? 'End-to-end encrypted' : 'Encrypted connection'}>
          <ShieldCheckIcon size={14} />
          <span>Secure</span>
        </div>
      </div>

      <div className="ail-nav-right">
        {props.recording.isRecording && (
          <div className="ail-rec-pill" title={`Recording — ${props.recording.durationLabel}`}>
            <span className="ail-rec-dot" />
            <span className="ail-rec-label">REC</span>
            <span className="ail-rec-time">{props.recording.durationLabel}</span>
          </div>
        )}

        <div className="ail-nav-layout-menu">
          <Menu
            open={layoutMenuOpen}
            onToggle={() => setLayoutMenuOpen((v) => !v)}
            align="right"
            trigger={<LayoutGridIcon size={18} />}
          >
            <button
              type="button"
              className="ail-menu-item"
              role="menuitemradio"
              aria-checked={props.layout === 'grid'}
              onClick={() => {
                props.onLayout('grid');
                setLayoutMenuOpen(false);
              }}
            >
              <LayoutGridIcon size={16} />
              Grid view
              {props.layout === 'grid' && <CheckIcon size={14} className="ail-check" />}
            </button>
            <button
              type="button"
              className="ail-menu-item"
              role="menuitemradio"
              aria-checked={props.layout === 'spotlight'}
              onClick={() => {
                props.onLayout('spotlight');
                setLayoutMenuOpen(false);
              }}
            >
              <SpotlightIcon size={16} />
              Spotlight view
              {props.layout === 'spotlight' && <CheckIcon size={14} className="ail-check" />}
            </button>
          </Menu>
        </div>

        <button
          type="button"
          className="ail-icon-btn"
          onClick={props.onFullscreen}
          title={props.fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {props.fullscreen ? <ShrinkIcon size={18} /> : <ExpandIcon size={18} />}
        </button>
      </div>
    </header>
  );
}

/** Google Meet style bottom control dock */
function GoogleMeetDock({
  roomName,
  mic,
  camera,
  screenShare,
  recording,
  recordingEnforced,
  panel,
  participantsCount,
  onPanel,
  onLeave,
  onFullscreen,
  fullscreen,
  noiseCancellation,
}: {
  roomName: string;
  mic: { enabled: boolean; pending: boolean; toggle: () => void };
  camera: { enabled: boolean; pending: boolean; toggle: () => void };
  screenShare: { enabled: boolean; pending: boolean; toggle: () => void };
  recording: ReturnType<typeof useRecording>;
  recordingEnforced?: boolean;
  panel: PanelId;
  participantsCount: number;
  onPanel: (id: PanelId) => void;
  onLeave: () => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  noiseCancellation: { enabled: boolean; pending: boolean; toggle: () => void };
}) {
  const room = useRoomContext();
  const [clockTime, setClockTime] = React.useState('');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [handRaised, setHandRaised] = React.useState(false);

  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | undefined>(undefined);
  const [activeAudioId, setActiveAudioId] = React.useState<string | undefined>(undefined);
  const [activeSpeakerId, setActiveSpeakerId] = React.useState<string | undefined>(undefined);
  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [testSoundPlaying, setTestSoundPlaying] = React.useState(false);

  const moreRef = React.useRef<HTMLDivElement>(null);
  const micMenuRef = React.useRef<HTMLDivElement>(null);
  const cameraMenuRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(moreRef, moreOpen, () => setMoreOpen(false));
  useClickOutside(micMenuRef, micMenuOpen, () => setMicMenuOpen(false));
  useClickOutside(cameraMenuRef, cameraMenuOpen, () => setCameraMenuOpen(false));

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
      console.warn('In-call device enumeration error', e);
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
      await room.switchActiveDevice('audioinput', deviceId);
      setActiveAudioId(deviceId);
      toast.success(`Microphone: ${label}`);
    } catch (err) {
      toast.error('Could not switch microphone');
      console.warn('Switch audio error', err);
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
    } catch (err) {
      toast.error('Could not switch speaker');
      console.warn('Switch speaker error', err);
    }
    setMicMenuOpen(false);
  };

  const handleSwitchVideo = async (deviceId: string, label: string) => {
    try {
      await room.switchActiveDevice('videoinput', deviceId);
      setActiveVideoId(deviceId);
      toast.success(`Camera: ${label}`);
    } catch (err) {
      toast.error('Could not switch camera');
      console.warn('Switch camera error', err);
    }
    setCameraMenuOpen(false);
  };

  const playTestSound = () => {
    setTestSoundPlaying(true);
    playSpeakerTestSound(activeSpeakerId).finally(() => {
      setTimeout(() => setTestSoundPlaying(false), 450);
    });
  };

  React.useEffect(() => {
    const update = () => {
      setClockTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const copyInvite = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Meeting link copied!'))
      .catch(() => toast.error('Could not copy link'));
  };

  return (
    <footer className="ail-gm-dock">
      {/* Left section: Time and Room Name */}
      <div className="ail-dock-left">
        {clockTime && <span className="ail-dock-time">{clockTime}</span>}
        <span className="ail-dock-divider">|</span>
        <button
          type="button"
          className="ail-dock-code"
          onClick={copyInvite}
          title="Click to copy meeting link"
        >
          <span>{roomName.toUpperCase()}</span>
          <CopyIcon size={13} />
        </button>
      </div>

      {/* Center section: Circular controls + Red End Call Pill */}
      <div className="ail-dock-center">
        {/* Google Meet Split Mic Button */}
        <div className="ail-split-btn-wrapper" ref={micMenuRef}>
          <div className={cx('ail-split-btn', !mic.enabled && 'ail-split-btn--muted')}>
            <button
              type="button"
              className="ail-split-btn-action"
              onClick={() => mic.toggle()}
              disabled={mic.pending}
              title={mic.enabled ? 'Turn off microphone' : 'Turn on microphone'}
              aria-label={mic.enabled ? 'Turn off microphone' : 'Turn on microphone'}
            >
              {mic.enabled ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
            </button>
            <span className="ail-split-btn-divider" />
            <button
              type="button"
              className={cx('ail-split-btn-chevron', micMenuOpen && 'ail-split-btn-chevron--active')}
              onClick={() => {
                setMicMenuOpen((v) => !v);
                setCameraMenuOpen(false);
                setMoreOpen(false);
              }}
              title="Audio settings (Microphone & Speaker)"
              aria-label="Select audio devices"
              aria-expanded={micMenuOpen}
            >
              <ChevronUpIcon size={14} />
            </button>
          </div>

          {/* Upward Audio Popover Menu */}
          {micMenuOpen && (
            <div className="ail-device-popover" role="menu">
              <div className="ail-device-section-title">MICROPHONE</div>
              <div className="ail-device-list">
                {audioDevices.length === 0 ? (
                  <div className="ail-device-empty">No microphones found</div>
                ) : (
                  audioDevices.map((d, i) => {
                    const isSelected = activeAudioId ? activeAudioId === d.deviceId : i === 0;
                    return (
                      <button
                        key={d.deviceId || i}
                        type="button"
                        className={cx('ail-device-item', isSelected && 'ail-device-item--selected')}
                        onClick={() => handleSwitchAudio(d.deviceId, d.label || `Microphone ${i + 1}`)}
                      >
                        <span className="ail-device-check">
                          {isSelected && <CheckIcon size={16} />}
                        </span>
                        <span className="ail-device-name">{d.label || `Microphone ${i + 1}`}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="ail-device-divider" />

              <div className="ail-device-section-title">SPEAKERS</div>
              <div className="ail-device-list">
                {speakerDevices.length === 0 ? (
                  <div className="ail-device-empty">Default system speaker</div>
                ) : (
                  speakerDevices.map((d, i) => {
                    const isSelected = activeSpeakerId ? activeSpeakerId === d.deviceId : i === 0;
                    return (
                      <button
                        key={d.deviceId || i}
                        type="button"
                        className={cx('ail-device-item', isSelected && 'ail-device-item--selected')}
                        onClick={() => handleSwitchSpeaker(d.deviceId, d.label || `Speaker ${i + 1}`)}
                      >
                        <span className="ail-device-check">
                          {isSelected && <CheckIcon size={16} />}
                        </span>
                        <span className="ail-device-name">{d.label || `Speaker ${i + 1}`}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="ail-device-divider" />

              <button
                type="button"
                className="ail-device-test-btn"
                onClick={playTestSound}
                disabled={testSoundPlaying}
              >
                <VolumeIcon size={15} />
                <span>{testSoundPlaying ? 'Playing test tone…' : 'Test speakers'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Google Meet Split Camera Button */}
        <div className="ail-split-btn-wrapper" ref={cameraMenuRef}>
          <div className={cx('ail-split-btn', !camera.enabled && 'ail-split-btn--muted')}>
            <button
              type="button"
              className="ail-split-btn-action"
              onClick={() => camera.toggle()}
              disabled={camera.pending}
              title={camera.enabled ? 'Turn off camera' : 'Turn on camera'}
              aria-label={camera.enabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {camera.enabled ? <CameraIcon size={20} /> : <CameraOffIcon size={20} />}
            </button>
            <span className="ail-split-btn-divider" />
            <button
              type="button"
              className={cx('ail-split-btn-chevron', cameraMenuOpen && 'ail-split-btn-chevron--active')}
              onClick={() => {
                setCameraMenuOpen((v) => !v);
                setMicMenuOpen(false);
                setMoreOpen(false);
              }}
              title="Camera settings"
              aria-label="Select camera device"
              aria-expanded={cameraMenuOpen}
            >
              <ChevronUpIcon size={14} />
            </button>
          </div>

          {/* Upward Camera Popover Menu */}
          {cameraMenuOpen && (
            <div className="ail-device-popover" role="menu">
              <div className="ail-device-section-title">CAMERA</div>
              <div className="ail-device-list">
                {videoDevices.length === 0 ? (
                  <div className="ail-device-empty">No cameras found</div>
                ) : (
                  videoDevices.map((d, i) => {
                    const isSelected = activeVideoId ? activeVideoId === d.deviceId : i === 0;
                    return (
                      <button
                        key={d.deviceId || i}
                        type="button"
                        className={cx('ail-device-item', isSelected && 'ail-device-item--selected')}
                        onClick={() => handleSwitchVideo(d.deviceId, d.label || `Camera ${i + 1}`)}
                      >
                        <span className="ail-device-check">
                          {isSelected && <CheckIcon size={16} />}
                        </span>
                        <span className="ail-device-name">{d.label || `Camera ${i + 1}`}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Raise hand toggle (folded into More on mobile) */}
        <button
          type="button"
          className={cx(
            'ail-circle-btn',
            'ail-dock-more-btn',
            handRaised && 'ail-circle-btn--active',
          )}
          onClick={() => {
            setHandRaised((v) => !v);
            toast(handRaised ? 'Lowered hand' : 'You raised your hand');
          }}
          title={handRaised ? 'Lower hand' : 'Raise hand'}
          aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
        >
          <HandIcon size={20} />
        </button>

        {/* Screen share toggle (folded into More on mobile) */}
        <button
          type="button"
          className={cx(
            'ail-circle-btn',
            'ail-dock-more-btn',
            screenShare.enabled && 'ail-circle-btn--active',
          )}
          onClick={() => screenShare.toggle()}
          disabled={screenShare.pending}
          title={screenShare.enabled ? 'Stop presenting' : 'Present now (share screen)'}
          aria-label={screenShare.enabled ? 'Stop presenting' : 'Present now'}
        >
          <ScreenShareIcon size={20} />
        </button>

        {/* AI Noise Cancellation (Krisp) Toggle — folded into More on mobile */}
        <button
          type="button"
          className={cx(
            'ail-circle-btn',
            'ail-dock-more-btn',
            noiseCancellation.enabled && 'ail-circle-btn--active',
          )}
          onClick={noiseCancellation.toggle}
          disabled={noiseCancellation.pending}
          title={noiseCancellation.enabled ? 'Noise Suppression: ON (click to disable)' : 'Noise Suppression: OFF (click to enable)'}
          aria-label={noiseCancellation.enabled ? 'Disable noise suppression' : 'Enable noise suppression'}
          style={noiseCancellation.enabled ? { color: '#81c995', borderColor: 'rgba(129,201,149,0.3)', background: 'rgba(129,201,149,0.12)' } : undefined}
        >
          <ShieldCheckIcon size={20} />
        </button>


        <div className="ail-menu" ref={moreRef}>
          <button
            type="button"
            className={cx('ail-circle-btn', moreOpen && 'ail-circle-btn--active')}
            onClick={() => setMoreOpen((v) => !v)}
            title="More options"
            aria-label="More options"
          >
            <MoreIcon size={20} />
          </button>
          {moreOpen && (
            <div className="ail-menu-popover ail-menu-popover--up" role="menu">
              {/* Mobile-only overflow controls (hidden on desktop inline) */}
              <button
                type="button"
                className="ail-menu-item ail-menu-item--mobile"
                onClick={() => {
                  setHandRaised((v) => !v);
                  setMoreOpen(false);
                  toast(handRaised ? 'Lowered hand' : 'You raised your hand');
                }}
              >
                <HandIcon size={16} />
                {handRaised ? 'Lower hand' : 'Raise hand'}
              </button>
              <button
                type="button"
                className="ail-menu-item ail-menu-item--mobile"
                onClick={() => {
                  screenShare.toggle();
                  setMoreOpen(false);
                }}
              >
                <ScreenShareIcon size={16} />
                {screenShare.enabled ? 'Stop presenting' : 'Present now'}
              </button>
              <button
                type="button"
                className="ail-menu-item ail-menu-item--mobile"
                onClick={() => {
                  noiseCancellation.toggle();
                  setMoreOpen(false);
                }}
              >
                <ShieldCheckIcon size={16} />
                <span>Noise Suppression</span>
                <span className="ail-check">
                  {noiseCancellation.enabled && <CheckIcon size={14} />}
                </span>
              </button>
              <div className="ail-mobile-menu-divider" />
              {!recordingEnforced && (
              <button
                type="button"
                className="ail-menu-item"
                onClick={() => {
                  recording.toggle();
                  setMoreOpen(false);
                }}
              >
                <RecordIcon size={16} />
                {recording.isRecording ? 'Stop recording' : 'Start recording'}
              </button>
              )}
              <button
                type="button"
                className="ail-menu-item"
                onClick={() => {
                  onFullscreen();
                  setMoreOpen(false);
                }}
              >
                {fullscreen ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
                {fullscreen ? 'Exit full screen' : 'Full screen'}
              </button>
              <button
                type="button"
                className="ail-menu-item"
                onClick={() => {
                  onPanel('settings');
                  setMoreOpen(false);
                }}
              >
                <SettingsIcon size={16} />
                Settings
              </button>
              <button
                type="button"
                className="ail-menu-item"
                onClick={() => {
                  copyInvite();
                  setMoreOpen(false);
                }}
              >
                <CopyIcon size={16} />
                Copy meeting link
              </button>
            </div>
          )}
        </div>

        {/* Signature Red Leave / End Call Pill */}
        <button
          type="button"
          className="ail-end-call-btn"
          onClick={onLeave}
          title="Leave call"
          aria-label="Leave call"
        >
          <PhoneOffIcon size={20} />
          <span className="ail-end-call-label">Leave</span>
        </button>
      </div>

      {/* Right section: Info, Participants, Chat, Settings */}
      <div className="ail-dock-right">
        <button
          type="button"
          className={cx('ail-dock-action-btn', panel === 'info' && 'ail-dock-action-btn--active')}
          onClick={() => onPanel(panel === 'info' ? null : 'info')}
          title="Meeting details"
          aria-label="Meeting details"
        >
          <InfoIcon size={20} />
        </button>

        <button
          type="button"
          className={cx('ail-dock-action-btn', panel === 'participants' && 'ail-dock-action-btn--active')}
          onClick={() => onPanel(panel === 'participants' ? null : 'participants')}
          title="People"
          aria-label="Participants"
        >
          <UsersIcon size={20} />
          <span className="ail-badge">{Math.max(participantsCount, 1)}</span>
        </button>

        <button
          type="button"
          className={cx('ail-dock-action-btn', panel === 'chat' && 'ail-dock-action-btn--active')}
          onClick={() => onPanel(panel === 'chat' ? null : 'chat')}
          title="In-call messages"
          aria-label="Chat messages"
        >
          <ChatIcon size={20} />
        </button>

        <button
          type="button"
          className={cx('ail-dock-action-btn', panel === 'settings' && 'ail-dock-action-btn--active')}
          onClick={() => onPanel(panel === 'settings' ? null : 'settings')}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </footer>
  );
}

export function AILinkRoom({
  chatMessageFormatter,
  SettingsComponent,
  label,
  museTalkEnabled = false,
  recordingEnabled = false,
  onLeaveRequest,
}: AILinkRoomProps) {
  const room = useRoomContext();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [panel, setPanel] = React.useState<PanelId>(null);
  const [layout, setLayout] = React.useState<LayoutMode>('grid');
  const [fullscreen, setFullscreen] = React.useState(false);
  const recording = useRecording();
  // The REC pill/announcement reflect REAL recorded state (room.isRecording via
  // useRecording) and — for interviews where the server armed Egress but the
  // room metadata hasn't flipped yet — the armed flag itself.
  const recordingUI = React.useMemo(
    () => ({ ...recording, isRecording: recording.isRecording || recordingEnabled }),
    [recording, recordingEnabled],
  );
  const participantsCount = useParticipants().length;
  const [announcement, setAnnouncement] = React.useState('');

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  // LiveKit's own local-video source of truth — NOT a permission/flag cache.
  // This mirrors how livekit's official meet app renders self-view
  // (ParticipantTile -> useParticipantTracks -> track attached to <video>):
  // the track object published to the room, read fresh every render.
  // Previous revisions gated on useIsTrackMuted / publication.isMuted, which
  // can wedge when mute events fire before listeners attach — tile says
  // "Camera off" while the server receives frames. Reading the live track
  // reference directly makes that class of desync impossible.
  const { cameraTrack: liveCameraPublication, localParticipant } = useLocalParticipant();
  const localVideoTrack = (liveCameraPublication as unknown as { track?: unknown } | undefined)?.track as
    | { mediaStreamTrack?: MediaStreamTrack; isMuted?: boolean }
    | undefined;
  const localVideoMst = localVideoTrack?.mediaStreamTrack;
  const localVideoLive = !!localVideoMst && localVideoMst.readyState === 'live' && localVideoTrack?.isMuted !== true;

  // "Turn camera back on" rescue: drives the real publication (unmute, or
  // restart a dead MediaStreamTrack, or re-enable when unpublished).
  const [camRescuePending, setCamRescuePending] = React.useState(false);
  const rescueCamera = React.useCallback(async () => {
    const lp = room.localParticipant;
    if (!lp) return;
    setCamRescuePending(true);
    try {
      const pub = lp.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as import('livekit-client').LocalVideoTrack | undefined;
      const mst = track?.mediaStreamTrack;
      if (pub && track && mst && mst.readyState !== 'live') {
        await track.restartTrack().catch(() => undefined);
        await track.unmute().catch(() => undefined);
      } else if (pub && track) {
        // Publication muted but track alive (or vice versa) — sync via unmute.
        await track.unmute().catch(() => undefined);
      } else if (!pub) {
        await lp.setCameraEnabled(true).catch(() => undefined);
      }
    } finally {
      setCamRescuePending(false);
    }
  }, [room]);

  // ─── Browser-Native Noise Suppression ────────────────────────────────────────
  // Krisp requires LiveKit Cloud (not available on self-hosted servers).
  // Instead, we use the browser's built-in WebRTC noiseSuppression + echoCancellation
  // via applyConstraints() — supported in Chrome, Edge, Firefox & Safari.
  // It uses Chromium's audio processing pipeline and is immediately audible.
  const [isNoiseFilterEnabled, setIsNoiseFilterEnabled] = React.useState(true);
  const [isNoiseFilterPending, setIsNoiseFilterPending] = React.useState(false);
  const noiseProcessorRef = React.useRef<LiveKitVoiceNoiseProcessor | null>(null);

  const applyNoiseSuppression = React.useCallback(async (enable: boolean) => {
    setIsNoiseFilterPending(true);
    try {
      const micPub = room.localParticipant?.getTrackPublication(Track.Source.Microphone);
      const localTrack = micPub?.track as LocalAudioTrack | undefined;
      const mediaTrack = localTrack?.mediaStreamTrack;

      if (localTrack && mediaTrack) {
        // Ensure an AudioContext is attached to LocalAudioTrack for LiveKit processor support
        let audioCtx = (localTrack as unknown as { audioContext?: AudioContext }).audioContext;
        if (!audioCtx && typeof window !== 'undefined') {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            try {
              audioCtx = new AudioContextClass();
              if (audioCtx.state === 'suspended') {
                await audioCtx.resume().catch(() => undefined);
              }
              localTrack.setAudioContext(audioCtx);
            } catch (ctxErr) {
              console.warn('[NoiseSuppression] AudioContext creation warning:', ctxErr);
            }
          }
        }

        if (enable) {
          if (!noiseProcessorRef.current) {
            noiseProcessorRef.current = new LiveKitVoiceNoiseProcessor(true);
          } else {
            noiseProcessorRef.current.setEnabled(true);
          }
          try {
            await localTrack.setProcessor(noiseProcessorRef.current);
            console.log('[NoiseSuppression] ✅ LiveKit DSP Voice Isolation processor active on mic track');
          } catch (procErr) {
            console.warn('[NoiseSuppression] setProcessor error, falling back to constraints:', procErr);
          }
        } else {
          if (noiseProcessorRef.current) {
            noiseProcessorRef.current.setEnabled(false);
          }
          try {
            await localTrack.stopProcessor();
            console.log('[NoiseSuppression] 🔇 Processor stopped — raw microphone audio active');
          } catch (stopErr) {
            console.warn('[NoiseSuppression] stopProcessor error:', stopErr);
          }
        }

        // Also update baseline WebRTC constraints
        await mediaTrack
          .applyConstraints({
            noiseSuppression: enable,
            echoCancellation: true,
            autoGainControl: enable,
            // @ts-ignore - Apple / Chromium Voice Isolation
            voiceIsolation: enable,
          })
          .catch(() => undefined);
      } else {
        console.warn('[NoiseSuppression] No mic track yet — preference saved for when track publishes');
      }
      setIsNoiseFilterEnabled(enable);
    } catch (err) {
      console.error('[NoiseSuppression] Failed:', err);
      setIsNoiseFilterEnabled(enable); // still update UI
    } finally {
      setIsNoiseFilterPending(false);
    }
  }, [room]);


  // Apply saved preference on mount and whenever mic track is published
  React.useEffect(() => {
    const saved = localStorage.getItem('hx_meet_krisp_enabled');
    const shouldEnable = saved !== null ? saved === 'true' : true;
    setIsNoiseFilterEnabled(shouldEnable);

    const onTrackPublished = () => {
      // Small delay to ensure mediaStreamTrack is ready
      setTimeout(() => applyNoiseSuppression(shouldEnable), 300);
    };

    room.on('localTrackPublished' as any, onTrackPublished);

    // If mic track is already live (reconnect scenario), apply immediately
    const existing = room.localParticipant?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (existing) {
      applyNoiseSuppression(shouldEnable);
    }

    return () => {
      room.off('localTrackPublished' as any, onTrackPublished);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const toggleNoiseCancellation = React.useCallback(async () => {
    const next = !isNoiseFilterEnabled;
    localStorage.setItem('hx_meet_krisp_enabled', String(next));
    await applyNoiseSuppression(next);
    toast.success(next ? 'Noise Suppression: ON' : 'Noise Suppression: OFF', { duration: 2000 });
  }, [isNoiseFilterEnabled, applyNoiseSuppression]);
  // ────────────────────────────────────────────────────────────────────────────


  React.useEffect(() => {
    if (participantsCount > 0) {
      setAnnouncement(
        `In meeting. ${participantsCount} participant${participantsCount === 1 ? '' : 's'}.`,
      );
    }
  }, [participantsCount]);

  React.useEffect(() => {
    if (recording.isRecording || recordingEnabled) {
      setAnnouncement('Meeting is being recorded.');
    }
  }, [recording.isRecording, recordingEnabled]);

  React.useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen unavailable', error);
    }
  }, []);

  const handlePanel = React.useCallback((next: PanelId) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const handleLeave = React.useCallback(() => {
    if (onLeaveRequest) {
      onLeaveRequest();
      return;
    }
    if (room.state !== ConnectionState.Disconnected) {
      room.disconnect().catch((error) => console.warn('disconnect failed', error));
    }
  }, [room, onLeaveRequest]);

  return (
    <div className="ail-root" ref={rootRef}>
      <TopNav
        label={label ?? 'meeXt'}
        layout={layout}
        recording={recordingUI}
        fullscreen={fullscreen}
        onLayout={setLayout}
        onFullscreen={toggleFullscreen}
      />

      <main className="ail-stage-wrap">
        {/* Self-view, Google-Meet style: the LIVE local track attached
            directly — no mute-flag gating. This is how livekit's own meet app
            renders it (their ParticipantTile attaches the track object). If the
            track is alive the user sees themselves, period. */}
        {localVideoLive && localVideoMst && (
          <div className="ail-selfview" data-testid="local-selfview">
            <LocalSelfView mst={localVideoMst} name={displayName(localParticipant)} />
          </div>
        )}
        <VideoStage
          layout={layout}
          museTalkEnabled={museTalkEnabled}
          onRescueCamera={rescueCamera}
          camRescuePending={camRescuePending}
        />
      </main>

      {/* Google Meet signature bottom bar */}
      <GoogleMeetDock
        roomName={room.name || label || 'meeXt'}
        mic={mic}
        camera={camera}
        screenShare={screenShare}
        recording={recordingUI}
        recordingEnforced={recordingEnabled}
        panel={panel}
        participantsCount={participantsCount}
        onPanel={handlePanel}
        onLeave={handleLeave}
        onFullscreen={toggleFullscreen}
        fullscreen={fullscreen}
        noiseCancellation={{
          enabled: isNoiseFilterEnabled,
          pending: isNoiseFilterPending,
          toggle: toggleNoiseCancellation,
        }}
      />

      {/* Side Drawers */}
      {/* 1. Chat Panel */}
      <aside
        className={cx('ail-panel', panel === 'chat' && 'ail-panel--open')}
        aria-hidden={panel !== 'chat'}
      >
        <div className="ail-panel-header">
          <span>In-call messages</span>
          <button
            type="button"
            className="ail-icon-btn"
            onClick={() => handlePanel(null)}
            title="Close messages"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-chat-body">
          <Chat messageFormatter={chatMessageFormatter} className="ail-chat" />
        </div>
      </aside>

      {/* 2. Participants Panel */}
      <aside
        className={cx('ail-panel', panel === 'participants' && 'ail-panel--open')}
        aria-hidden={panel !== 'participants'}
      >
        <div className="ail-panel-header">
          <span>
            People
            <span className="ail-panel-count">{Math.max(participantsCount, 1)}</span>
          </span>
          <button
            type="button"
            className="ail-icon-btn"
            onClick={() => handlePanel(null)}
            title="Close people"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-panel-body">
          <ParticipantsList />
        </div>
      </aside>

      {/* 3. Meeting Info Panel */}
      <aside
        className={cx('ail-panel', panel === 'info' && 'ail-panel--open')}
        aria-hidden={panel !== 'info'}
      >
        <div className="ail-panel-header">
          <span>Meeting details</span>
          <button
            type="button"
            className="ail-icon-btn"
            onClick={() => handlePanel(null)}
            title="Close details"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-panel-body" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#202124', marginBottom: 6 }}>
            Joining info
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#5f6368', marginBottom: 16, wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? window.location.href : ''}
          </p>
          <button
            type="button"
            className="ail-gate-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={() => {
              navigator.clipboard
                .writeText(window.location.href)
                .then(() => toast.success('Joining info copied!'))
                .catch(() => toast.error('Failed to copy info'));
            }}
          >
            <CopyIcon size={16} />
            Copy joining info
          </button>

          <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e8eaed' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#3c4043', fontSize: '0.9rem' }}>
            <ShieldCheckIcon size={18} style={{ color: '#34a853' }} />
            <span>
              {room.isE2EEEnabled ? 'End-to-end encrypted' : 'Encrypted connection'}
            </span>
          </div>
        </div>
      </aside>

      {/* 4. Settings Panel */}
      <aside
        className={cx('ail-panel', panel === 'settings' && 'ail-panel--open')}
        aria-hidden={panel !== 'settings'}
      >
        <div className="ail-panel-header">
          <span>Settings</span>
          <button
            type="button"
            className="ail-icon-btn"
            onClick={() => handlePanel(null)}
            title="Close settings"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-panel-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {SettingsComponent ? (
            <SettingsComponent onClose={() => handlePanel(null)} recordingEnabled={recordingEnabled} />
          ) : null}

          {/* AI Noise Cancellation Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0a6', margin: 0 }}>
              Audio Enhancement
            </h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheckIcon size={16} style={{ color: isNoiseFilterEnabled ? '#81c995' : '#9aa0a6' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e8eaed' }}>
                    Noise Suppression
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: isNoiseFilterEnabled ? 'rgba(129,201,149,0.2)' : 'rgba(154,160,166,0.15)',
                      color: isNoiseFilterEnabled ? '#81c995' : '#9aa0a6',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {isNoiseFilterEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#9aa0a6', margin: 0, lineHeight: 1.4 }}>
                  Removes keyboard, fan, and background noise using your browser&apos;s built-in audio processing.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isNoiseFilterEnabled}
                className={`gm-switch-btn ${isNoiseFilterEnabled ? 'gm-switch-btn--on' : ''}`}
                onClick={toggleNoiseCancellation}
                disabled={isNoiseFilterPending}
                style={{ flexShrink: 0, marginTop: 2 }}
                title={isNoiseFilterEnabled ? 'Disable noise cancellation' : 'Enable noise cancellation'}
              >
                <span className="gm-switch-handle" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <RoomAudioRenderer />
      <StartAudio label="Click to enable audio" className="ail-start-audio" />
      <div role="status" aria-live="polite" className="ail-sr-only">
        {announcement}
      </div>
    </div>
  );
}

function ParticipantsList() {
  const participants = useParticipants();
  const [search, setSearch] = React.useState('');

  const filtered = participants.filter((p) =>
    displayName(p).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f3f4' }}>
        <input
          type="text"
          placeholder="Search for people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ail-gate-input"
          style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
        />
      </div>
      <ul className="ail-people" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((p) => (
          <ParticipantRow key={p.identity} participant={p} />
        ))}
      </ul>
    </div>
  );
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const micMuted = useIsTrackMuted(participant, Track.Source.Microphone);
  const camMuted = useIsTrackMuted(participant, Track.Source.Camera);
  const isSpeaking = useIsSpeaking(participant);

  return (
    <li className="ail-person">
      <div className={cx('ail-person-avatar-wrap', isSpeaking && !micMuted && 'ail-person-avatar-wrap--speaking')}>
        <Avatar name={displayName(participant)} size={36} />
      </div>
      <span className="ail-person-name">
        {displayName(participant)}
        {participant.isLocal && <span className="ail-you-tag">You</span>}
      </span>
      <span
        className={cx('ail-person-state', micMuted && 'ail-person-state--off')}
        title={micMuted ? 'Mic muted' : 'Mic on'}
      >
        {micMuted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
      </span>
      <span
        className={cx('ail-person-state', camMuted && 'ail-person-state--off')}
        title={camMuted ? 'Camera off' : 'Camera on'}
      >
        {camMuted ? <CameraOffIcon size={16} /> : <CameraIcon size={16} />}
      </span>
    </li>
  );
}

function VideoStage({
  layout,
  museTalkEnabled,
  onRescueCamera,
  camRescuePending,
}: {
  layout: LayoutMode;
  museTalkEnabled: boolean;
  onRescueCamera: () => void;
  camRescuePending: boolean;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);
  const screenTracks = tracks.filter((t) => t.source === Track.Source.ScreenShare);

  // useTracks with a placeholder can briefly (and sometimes fully) miss the
  // LOCAL camera right after joining — the hardware light comes on before
  // LiveKit exposes the publication. Rebuild the local camera TrackReference
  // directly from the local participant so the self video shows up in the grid
  // as soon as the camera is live instead of rendering an avatar/empty viewport.
  const { localParticipant } = useLocalParticipant();
  const localHasRealCamera = cameraTracks.some(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera && isTrackReference(t),
  );
  const cameraTracksResolved = React.useMemo(() => {
    const localCameraPub = localParticipant?.getTrackPublication(Track.Source.Camera);
    if (!localHasRealCamera && localCameraPub) {
      return [
        {
          participant: localParticipant,
          source: Track.Source.Camera,
          publication: localCameraPub,
        },
        ...cameraTracks.filter((t) => !(t.participant.isLocal && t.source === Track.Source.Camera)),
      ];
    }
    return cameraTracks;
  }, [cameraTracks, localParticipant, localHasRealCamera]);

  const avatarTrack = cameraTracksResolved.find((t) =>
    ['monika-avatar', 'rosie', 'avatar'].some(
      (k) =>
        t.participant.identity.toLowerCase().includes(k) ||
        t.participant.name?.toLowerCase().includes(k),
    ),
  );

  return (
    <div className="ail-stage">
      <div className="ail-stage-top">
        <ConnectionChip />
      </div>

      {museTalkEnabled ? (
        <MuseTalkStage
          avatarTrack={avatarTrack}
          candidateTracks={cameraTracksResolved.filter((t) => t !== avatarTrack)}
          onRescueCamera={onRescueCamera}
          camRescuePending={camRescuePending}
        />
      ) : screenTracks.length > 0 || layout === 'spotlight' ? (
        <SpotlightStage
          screenTracks={screenTracks}
          cameraTracks={cameraTracksResolved}
          onRescueCamera={onRescueCamera}
          camRescuePending={camRescuePending}
        />
      ) : (
        <GoogleGridStage
          tracks={cameraTracksResolved}
          onRescueCamera={onRescueCamera}
          camRescuePending={camRescuePending}
        />
      )}
    </div>
  );
}

/** Standard responsive grid for Google Meet */
function GoogleGridStage({
  tracks,
  onRescueCamera,
  camRescuePending,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  onRescueCamera: () => void;
  camRescuePending: boolean;
}) {
  const count = tracks.length;

  return (
    <div className="ail-grid-container" data-count={Math.min(count, 9)}>
      {tracks.map((ref) => (
        <div className="ail-grid-cell" key={trackKey(ref)}>
          <Tile trackRef={ref} onRescueCamera={onRescueCamera} camRescuePending={camRescuePending} />
        </div>
      ))}
    </div>
  );
}

/** Spotlight / Screen share view with filmstrip */
function SpotlightStage({
  screenTracks,
  cameraTracks,
  onRescueCamera,
  camRescuePending,
}: {
  screenTracks: TrackReferenceOrPlaceholder[];
  cameraTracks: TrackReferenceOrPlaceholder[];
  onRescueCamera: () => void;
  camRescuePending: boolean;
}) {
  // If there's screen share, it takes the main stage, otherwise the first camera track
  const mainTrack = screenTracks.length > 0 ? screenTracks[0] : cameraTracks[0];
  const sideTracks = screenTracks.length > 0
    ? cameraTracks
    : cameraTracks.slice(1);

  return (
    <div className="ail-spotlight-wrap">
      <div className="ail-spotlight-main">
        {mainTrack && (
          <Tile trackRef={mainTrack} isSpotlight onRescueCamera={onRescueCamera} camRescuePending={camRescuePending} />
        )}
      </div>
      {sideTracks.length > 0 && (
        <div className="ail-filmstrip">
          {sideTracks.map((ref) => (
            <div className="ail-filmstrip-item" key={trackKey(ref)}>
              <Tile trackRef={ref} onRescueCamera={onRescueCamera} camRescuePending={camRescuePending} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MuseTalkStage({
  avatarTrack,
  candidateTracks,
  onRescueCamera,
  camRescuePending,
}: {
  avatarTrack: TrackReferenceOrPlaceholder | undefined;
  candidateTracks: TrackReferenceOrPlaceholder[];
  onRescueCamera: () => void;
  camRescuePending: boolean;
}) {
  const avatarReady =
    !!avatarTrack &&
    isTrackReference(avatarTrack) &&
    !!avatarTrack.publication &&
    !avatarTrack.publication.isMuted &&
    !!avatarTrack.publication.track;

  const connState = useConnectionState();
  const ended = connState === ConnectionState.Disconnected;
  const { localParticipant } = useLocalParticipant();

  // Build a local camera TrackReference directly from the local participant's
  // publication. useTracks (withPlaceholder) can miss the local camera on the
  // first render after joining, leaving localTracks empty and the self-video
  // PIP hidden even though the hardware camera is active.
  const localCameraPub = localParticipant?.getTrackPublication(Track.Source.Camera);
  const localCameraRef = localCameraPub
    ? { participant: localParticipant, source: Track.Source.Camera, publication: localCameraPub }
    : undefined;

  // Merge: prefer real track references from useTracks, but always include the
  // local camera so the PIP renders as soon as the publication exists.
  const mergedCandidateTracks = [...candidateTracks];
  if (localCameraRef && !mergedCandidateTracks.some((t) => t.participant.isLocal && t.source === Track.Source.Camera)) {
    mergedCandidateTracks.push(localCameraRef as TrackReferenceOrPlaceholder);
  }
  const localTracks = mergedCandidateTracks.filter((t) => t.participant.isLocal && t.source === Track.Source.Camera);

  return (
    <>
      <div
        className="ail-muse-stage"
        data-has-avatar={avatarReady}
        data-camera-off={localTracks.length === 0 || undefined}
      >
        {avatarReady ? (
          <VideoTrack
            trackRef={avatarTrack as any}
            className="ail-muse-video"
            style={{ objectFit: 'cover' }}
          />
        ) : ended ? (
          <div className="ail-muse-connecting">
            <p>You have left the interview.</p>
          </div>
        ) : (
          <div className="ail-muse-connecting">
            <span className="ail-spinner" />
            <p>
              {connState === ConnectionState.Reconnecting
                ? 'Reconnecting…'
                : 'Connecting to your AI interviewer…'}
            </p>
          </div>
        )}
      </div>
      {localTracks.length > 0 && (
        <div className="ail-candidate-pip">
          {localTracks.map((ref) => (
            <Tile key={trackKey(ref)} trackRef={ref} onRescueCamera={onRescueCamera} camRescuePending={camRescuePending} />
          ))}
        </div>
      )}
    </>
  );
}
