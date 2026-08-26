'use client';

import * as React from 'react';
import {
  Chat,
  isTrackReference,
  RoomAudioRenderer,
  StartAudio,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useSpeakingParticipants,
  useTrackToggle,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { MessageFormatter, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { ConnectionState, Participant, ParticipantEvent, Track } from 'livekit-client';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRecording } from './useRecording';
import {
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  LayoutGridIcon,
  LogoMark,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneOffIcon,
  RecordIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShrinkIcon,
  SpotlightIcon,
  ShieldCheckIcon,
  UsersIcon,
} from './icons';

type PanelId = 'chat' | 'participants' | 'settings' | null;
type LayoutMode = 'grid' | 'spotlight';

export interface AILinkRoomProps {
  chatMessageFormatter?: MessageFormatter;
  SettingsComponent?: React.ComponentType<{ onClose?: () => void }>;
  label?: string;
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
  const [muted, setMuted] = React.useState(
    () => participant.getTrackPublication(source)?.isMuted ?? true,
  );
  React.useEffect(() => {
    const update = () => setMuted(participant.getTrackPublication(source)?.isMuted ?? true);
    update();
    participant.on(ParticipantEvent.TrackMuted, update);
    participant.on(ParticipantEvent.TrackUnmuted, update);
    participant.on(ParticipantEvent.TrackPublished, update);
    participant.on(ParticipantEvent.TrackUnpublished, update);
    return () => {
      participant.off(ParticipantEvent.TrackMuted, update);
      participant.off(ParticipantEvent.TrackUnmuted, update);
      participant.off(ParticipantEvent.TrackPublished, update);
      participant.off(ParticipantEvent.TrackUnpublished, update);
    };
  }, [participant, source]);
  return muted;
}

function trackKey(ref: TrackReferenceOrPlaceholder): string {
  return `${ref.participant.identity}:${ref.source}`;
}

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  return (
    <div className="ail-avatar" style={{ width: size, height: size, fontSize: size * 0.34 }}>
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
  let label = 'Good connection';

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
    label = 'Weak connection';
  }

  return (
    <div className={cx('ail-chip', 'ail-conn', `ail-conn--${tone}`)}>
      <span className={cx('ail-dot', pulse && 'ail-dot--pulse')} />
      <span>{label}</span>
    </div>
  );
}

function Tile({
  trackRef,
  speaking,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  speaking: boolean;
}) {
  const { participant, source } = trackRef;
  const isScreen = source === Track.Source.ScreenShare;
  const camMuted = useIsTrackMuted(participant, Track.Source.Camera);
  const micMuted = useIsTrackMuted(participant, Track.Source.Microphone);
  const hasVideo =
    isTrackReference(trackRef) && !!trackRef.publication && !trackRef.publication.isMuted;
  const showVideo = isScreen ? hasVideo : hasVideo && !camMuted;
  const name = displayName(participant);

  return (
    <div
      className={cx('ail-tile', speaking && 'ail-tile--speaking', isScreen && 'ail-tile--screen')}
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
          <Avatar name={name} />
          {!isScreen && camMuted && <span className="ail-tile-hint">Camera off</span>}
        </div>
      )}
      <div className="ail-chip ail-name-pill">
        {isScreen ? `${name}'s screen` : `${name}${participant.isLocal ? ' (You)' : ''}`}
      </div>
      {micMuted && !isScreen && (
        <div className="ail-chip ail-mic-badge" title="Microphone muted">
          <MicOffIcon size={13} />
        </div>
      )}
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

interface NavProps {
  label: string;
  panel: PanelId;
  layout: LayoutMode;
  recording: ReturnType<typeof useRecording>;
  fullscreen: boolean;
  participantsCount: number;
  onLayout: (mode: LayoutMode) => void;
  onPanel: (id: PanelId) => void;
  onFullscreen: () => void;
  onLeave: () => void;
}

function TopNav(props: NavProps) {
  const room = useRoomContext();
  const [roomMenuOpen, setRoomMenuOpen] = React.useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const roomMenuRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(roomMenuRef, roomMenuOpen, () => setRoomMenuOpen(false));
  useClickOutside(menuRef, moreMenuOpen, () => setMoreMenuOpen(false));

  const copyInvite = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Invite link copied'))
      .catch(() => toast.error('Could not copy link'));
    setMoreMenuOpen(false);
    setRoomMenuOpen(false);
  };

  const secure = room.isE2EEEnabled;

  return (
    <header className="ail-nav">
      <div className="ail-nav-left">
        <Link className="ail-brand" href="/" title="HireXt Meet home">
          <LogoMark size={28} />
          <span className="ail-brand-name">HireXt Meet</span>
        </Link>
        <span className="ail-v-divider" aria-hidden="true" />
        <div className="ail-room" ref={roomMenuRef}>
          <button
            type="button"
            className="ail-room-trigger"
            onClick={() => setRoomMenuOpen((v) => !v)}
            aria-expanded={roomMenuOpen}
            aria-haspopup="menu"
          >
            <span className="ail-room-name">{props.label}</span>
            <ChevronDownIcon size={14} className="ail-caret" />
          </button>
          {roomMenuOpen && (
            <div className="ail-menu-popover ail-menu-popover--left ail-room-card" role="menu">
              <div className="ail-room-card-title">{props.label}</div>
              <div className="ail-room-card-id">{room.name || '—'}</div>
              {secure ? (
                <div className="ail-room-card-row ail-room-card-row--secure">
                  <ShieldCheckIcon size={15} />
                  End-to-end encrypted
                </div>
              ) : (
                <div className="ail-room-card-row">
                  <ShieldCheckIcon size={15} />
                  Encrypted connection
                </div>
              )}
              <button type="button" className="ail-menu-item" onClick={copyInvite}>
                <CopyIcon size={15} />
                Copy invite link
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
            Grid
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
            Spotlight
            {props.layout === 'spotlight' && <CheckIcon size={14} className="ail-check" />}
          </button>
        </Menu>

        <button
          type="button"
          className={cx('ail-icon-btn', props.panel === 'participants' && 'ail-icon-btn--active')}
          onClick={() => props.onPanel(props.panel === 'participants' ? null : 'participants')}
          title="Participants"
        >
          <UsersIcon size={18} />
          <span className="ail-count-badge">{Math.max(props.participantsCount, 1)}</span>
        </button>

        <div className="ail-menu" ref={menuRef}>
          <button
            type="button"
            className={cx('ail-icon-btn', moreMenuOpen && 'ail-icon-btn--active')}
            onClick={() => setMoreMenuOpen((v) => !v)}
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            title="More options"
          >
            <MoreIcon size={18} />
          </button>
          {moreMenuOpen && (
            <div className="ail-menu-popover ail-menu-popover--right" role="menu">
              <button type="button" className="ail-menu-item" onClick={copyInvite}>
                <CopyIcon size={16} />
                Copy invite link
              </button>
              <button
                type="button"
                className="ail-menu-item"
                onClick={() => {
                  props.onFullscreen();
                  setMoreMenuOpen(false);
                }}
              >
                {props.fullscreen ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
                {props.fullscreen ? 'Exit full screen' : 'Full screen'}
              </button>
            </div>
          )}
        </div>

        <button type="button" className="ail-leave" onClick={props.onLeave}>
          <PhoneOffIcon size={17} />
          <span>Leave</span>
        </button>
      </div>
    </header>
  );
}

function ControlDockButton({
  icon,
  label,
  on,
  danger,
  processing,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  on?: boolean;
  danger?: boolean;
  processing?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(
        'ail-dock-btn',
        on && 'ail-dock-btn--on',
        danger && on && 'ail-dock-btn--danger',
        processing && 'ail-dock-btn--processing',
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!on}
      title={label}
    >
      <span className="ail-dock-btn-icon">
        {processing ? <span className="ail-spinner" /> : icon}
      </span>
      <span className="ail-dock-btn-label">{label}</span>
    </button>
  );
}

export function AILinkRoom({ chatMessageFormatter, SettingsComponent, label }: AILinkRoomProps) {
  const room = useRoomContext();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [panel, setPanel] = React.useState<PanelId>(null);
  const [layout, setLayout] = React.useState<LayoutMode>('grid');
  const [fullscreen, setFullscreen] = React.useState(false);
  const recording = useRecording();
  const participantsCount = useParticipants().length;

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

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
      console.warn('Fullscreen not available', error);
    }
  }, []);

  const handlePanel = React.useCallback((next: PanelId) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const handleLeave = React.useCallback(() => {
    room.disconnect();
  }, [room]);

  return (
    <div className="ail-root" ref={rootRef}>
      <TopNav
        label={label ?? 'HireXt Meet'}
        panel={panel}
        layout={layout}
        recording={recording}
        fullscreen={fullscreen}
        participantsCount={participantsCount}
        onLayout={setLayout}
        onPanel={handlePanel}
        onFullscreen={toggleFullscreen}
        onLeave={handleLeave}
      />

      <main className="ail-stage-wrap">
        <VideoStage layout={layout} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
      </main>

      {recording.isRecording && (
        <div className="ail-rec-float" title="This meeting is being recorded">
          <span className="ail-rec-dot" />
          <span className="ail-rec-label">REC</span>
          <span className="ail-rec-time">{recording.durationLabel}</span>
        </div>
      )}

      <footer className="ail-dock">
        <ControlDockButton
          icon={mic.enabled ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
          label={mic.enabled ? 'Mic on' : 'Mic off'}
          on={mic.enabled}
          danger={!mic.enabled}
          processing={mic.pending}
          onClick={() => mic.toggle()}
        />
        <ControlDockButton
          icon={camera.enabled ? <CameraIcon size={20} /> : <CameraOffIcon size={20} />}
          label={camera.enabled ? 'Camera on' : 'Camera off'}
          on={camera.enabled}
          danger={!camera.enabled}
          processing={camera.pending}
          onClick={() => camera.toggle()}
        />
        <ControlDockButton
          icon={<ScreenShareIcon size={20} />}
          label={screenShare.enabled ? 'Stop sharing' : 'Share screen'}
          on={screenShare.enabled}
          processing={screenShare.pending}
          onClick={() => screenShare.toggle()}
        />
        <span className="ail-h-divider" aria-hidden="true" />
        <ControlDockButton
          icon={<ChatIcon size={20} />}
          label="Chat"
          on={panel === 'chat'}
          onClick={() => handlePanel('chat')}
        />
        <ControlDockButton
          icon={<RecordIcon size={20} />}
          label={recording.isRecording ? 'Stop recording' : 'Record'}
          on={recording.isRecording}
          danger
          processing={recording.processing}
          onClick={() => recording.toggle()}
        />
        <ControlDockButton
          icon={<SettingsIcon size={20} />}
          label="Settings"
          on={panel === 'settings'}
          onClick={() => handlePanel('settings')}
        />
      </footer>

      <aside className={cx('ail-panel', panel === 'chat' && 'ail-panel--open')} aria-hidden={panel !== 'chat'}>
        <div className="ail-panel-header">
          <span>Messages</span>
          <button type="button" className="ail-icon-btn" onClick={() => handlePanel(null)} title="Close chat">
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-chat-body">
          <Chat messageFormatter={chatMessageFormatter} className="ail-chat" />
        </div>
      </aside>

      <aside
        className={cx('ail-panel', panel === 'participants' && 'ail-panel--open')}
        aria-hidden={panel !== 'participants'}
      >
        <div className="ail-panel-header">
          <span>
            Participants
            <span className="ail-panel-count">{Math.max(participantsCount, 1)}</span>
          </span>
          <button type="button" className="ail-icon-btn" onClick={() => handlePanel(null)} title="Close participants">
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-panel-body">
          <ParticipantsList />
        </div>
      </aside>

      <aside
        className={cx('ail-panel', panel === 'settings' && 'ail-panel--open')}
        aria-hidden={panel !== 'settings'}
      >
        <div className="ail-panel-header">
          <span>Settings</span>
          <button type="button" className="ail-icon-btn" onClick={() => handlePanel(null)} title="Close settings">
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="ail-panel-body">
          {SettingsComponent ? <SettingsComponent onClose={() => handlePanel(null)} /> : null}
        </div>
      </aside>

      <RoomAudioRenderer />
      <StartAudio label="Click to enable audio" className="ail-start-audio" />
    </div>
  );
}

function ParticipantsList() {
  const participants = useParticipants();
  return (
    <ul className="ail-people">
      {participants.map((p) => (
        <ParticipantRow key={p.identity} participant={p} />
      ))}
    </ul>
  );
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const micMuted = useIsTrackMuted(participant, Track.Source.Microphone);
  const camMuted = useIsTrackMuted(participant, Track.Source.Camera);
  return (
    <li className="ail-person">
      <Avatar name={displayName(participant)} size={32} />
      <span className="ail-person-name">
        {displayName(participant)}
        {participant.isLocal && <span className="ail-you-tag">You</span>}
      </span>
      <span className={cx('ail-person-state', micMuted && 'ail-person-state--off')} title={micMuted ? 'Mic muted' : 'Mic on'}>
        {micMuted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
      </span>
      <span className={cx('ail-person-state', camMuted && 'ail-person-state--off')} title={camMuted ? 'Camera off' : 'Camera on'}>
        {camMuted ? <CameraOffIcon size={15} /> : <CameraIcon size={15} />}
      </span>
    </li>
  );
}

function VideoStage({
  layout,
  fullscreen,
  onToggleFullscreen,
}: {
  layout: LayoutMode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const speakers = useSpeakingParticipants();
  const speakerIds = React.useMemo(() => new Set(speakers.map((s) => s.identity)), [speakers]);

  const screenTracks = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);
  const ordered = [...cameraTracks, ...screenTracks];

  const spotlight = React.useMemo(() => {
    if (screenTracks.length > 0) return screenTracks[0];
    for (const speaker of speakers) {
      const match = cameraTracks.find((t) => t.participant.identity === speaker.identity);
      if (match) return match;
    }
    return cameraTracks.find((t) => t.participant.isLocal) ?? cameraTracks[0];
  }, [screenTracks, speakers, cameraTracks]);

  return (
    <div className="ail-stage">
      <div className="ail-stage-top">
        <ConnectionChip />
      </div>
      <button
        type="button"
        className="ail-fullscreen-btn"
        onClick={onToggleFullscreen}
        title={fullscreen ? 'Exit full screen' : 'Enter full screen'}
      >
        {fullscreen ? <ShrinkIcon size={15} /> : <ExpandIcon size={15} />}
      </button>
      {layout === 'grid' || !spotlight ? (
        <div className="ail-grid">
          {ordered.map((ref) => (
            <Tile key={trackKey(ref)} trackRef={ref} speaking={speakerIds.has(ref.participant.identity)} />
          ))}
        </div>
      ) : (
        <>
          <div className="ail-focus">
            <Tile key={trackKey(spotlight)} trackRef={spotlight} speaking={speakerIds.has(spotlight.participant.identity)} />
          </div>
          {ordered.length > 1 && (
            <div className="ail-filmstrip">
              {ordered
                .filter((ref) => trackKey(ref) !== trackKey(spotlight))
                .map((ref) => (
                  <Tile key={trackKey(ref)} trackRef={ref} speaking={speakerIds.has(ref.participant.identity)} />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
