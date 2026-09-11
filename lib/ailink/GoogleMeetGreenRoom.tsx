'use client';

import * as React from 'react';
import { LocalUserChoices, usePreviewTracks } from '@livekit/components-react';
import { LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client';
import toast from 'react-hot-toast';
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from './icons';

export interface GoogleMeetGreenRoomProps {
  roomName: string;
  defaultUsername?: string;
  defaultVideoEnabled?: boolean;
  defaultAudioEnabled?: boolean;
  onSubmit: (choices: LocalUserChoices) => void;
  onContinueWithoutMedia?: () => void;
}

export function GoogleMeetGreenRoom({
  roomName,
  defaultUsername = '',
  defaultVideoEnabled = true,
  defaultAudioEnabled = true,
  onSubmit,
  onContinueWithoutMedia,
}: GoogleMeetGreenRoomProps) {
  const [username, setUsername] = React.useState(defaultUsername);
  const [videoEnabled, setVideoEnabled] = React.useState(defaultVideoEnabled);
  const [audioEnabled, setAudioEnabled] = React.useState(defaultAudioEnabled);
  const [videoDeviceId, setVideoDeviceId] = React.useState('');
  const [audioDeviceId, setAudioDeviceId] = React.useState('');

  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const videoEl = React.useRef<HTMLVideoElement>(null);
  const settingsRef = React.useRef<HTMLDivElement>(null);

  // Enumerate devices for selector dropdown
  React.useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const v = devices.filter((d) => d.kind === 'videoinput');
      const a = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(v);
      setAudioDevices(a);
      if (v[0] && !videoDeviceId) setVideoDeviceId(v[0].deviceId);
      if (a[0] && !audioDeviceId) setAudioDeviceId(a[0].deviceId);
    }).catch((err) => {
      console.warn('enumerateDevices error', err);
    });
  }, [videoDeviceId, audioDeviceId]);

  // Preview tracks hook from LiveKit
  const tracks = usePreviewTracks(
    {
      audio: audioEnabled ? { deviceId: audioDeviceId || undefined } : false,
      video: videoEnabled ? { deviceId: videoDeviceId || undefined } : false,
    },
    (error) => {
      console.warn('Track preview error', error);
    },
  );

  const videoTrack = React.useMemo(
    () => tracks?.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
    [tracks],
  );

  const audioTrack = React.useMemo(
    () => tracks?.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined,
    [tracks],
  );

  // Attach video track to video element
  React.useEffect(() => {
    if (videoEl.current && videoTrack) {
      videoTrack.unmute();
      videoTrack.attach(videoEl.current);
    }
    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  // Simple mic volume visualizer using Web Audio API
  React.useEffect(() => {
    if (!audioTrack || !audioEnabled) {
      setAudioLevel(0);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let animId: number;

    try {
      const mediaStreamTrack = audioTrack.mediaStreamTrack;
      if (mediaStreamTrack) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]!;
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round(avg * 1.6)));
          animId = requestAnimationFrame(checkVolume);
        };
        animId = requestAnimationFrame(checkVolume);
      }
    } catch (e) {
      console.warn('Volume meter error', e);
    }

    return () => {
      cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => undefined);
      }
    };
  }, [audioTrack, audioEnabled]);

  // Close settings popup when clicking outside
  React.useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = username.trim();
    if (!cleanName) {
      toast.error('Please enter your name to join');
      return;
    }
    onSubmit({
      username: cleanName,
      videoEnabled,
      audioEnabled,
      videoDeviceId,
      audioDeviceId,
    });
  };

  const copyRoomLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Meeting link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  const activeVideoName = videoDevices.find((d) => d.deviceId === videoDeviceId)?.label || 'Default Camera';
  const activeAudioName = audioDevices.find((d) => d.deviceId === audioDeviceId)?.label || 'Default Microphone';

  return (
    <div className="gm-greenroom-container">
      {/* 2-Column Wide Desktop Layout */}
      <div className="gm-greenroom-grid">
        {/* LEFT: Spacious 16:9 Video Preview */}
        <div className="gm-preview-col">
          <div className="gm-preview-card">
            {videoEnabled ? (
              <video
                ref={videoEl}
                className="gm-preview-video"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <div className="gm-preview-camera-off">
                <div className="gm-preview-avatar">
                  {username.trim() ? username.trim()[0]!.toUpperCase() : 'HX'}
                </div>
                <span className="gm-preview-off-text">Camera is off</span>
              </div>
            )}

            {/* Audio wave indicator (top-left of video) */}
            {audioEnabled && (
              <div className="gm-audio-indicator" title="Microphone activity">
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(4, audioLevel * 0.2)}px` }}
                />
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(6, audioLevel * 0.28)}px` }}
                />
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(4, audioLevel * 0.18)}px` }}
                />
              </div>
            )}

            {/* Floating circular control bar at bottom of video */}
            <div className="gm-preview-dock">
              {/* Mic Toggle Button */}
              <button
                type="button"
                className={`gm-dock-btn ${!audioEnabled ? 'gm-dock-btn--muted' : ''}`}
                onClick={() => setAudioEnabled((prev) => !prev)}
                title={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                aria-label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
              >
                {audioEnabled ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
              </button>

              {/* Camera Toggle Button */}
              <button
                type="button"
                className={`gm-dock-btn ${!videoEnabled ? 'gm-dock-btn--muted' : ''}`}
                onClick={() => setVideoEnabled((prev) => !prev)}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
              </button>

              {/* Device Settings Toggle Button */}
              <div className="gm-settings-wrapper" ref={settingsRef}>
                <button
                  type="button"
                  className={`gm-dock-btn ${settingsOpen ? 'gm-dock-btn--active' : ''}`}
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  title="Audio and video settings"
                  aria-label="Audio and video settings"
                >
                  <SettingsIcon size={20} />
                </button>

                {settingsOpen && (
                  <div className="gm-settings-dropdown" role="dialog" aria-label="Device settings">
                    <div className="gm-settings-header">
                      <span>Audio &amp; Video Devices</span>
                    </div>

                    <div className="gm-settings-group">
                      <label className="gm-settings-label">Camera</label>
                      <select
                        className="gm-settings-select"
                        value={videoDeviceId}
                        onChange={(e) => setVideoDeviceId(e.target.value)}
                        disabled={!videoEnabled}
                      >
                        {videoDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera (${d.deviceId.slice(0, 5)})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="gm-settings-group">
                      <label className="gm-settings-label">Microphone</label>
                      <select
                        className="gm-settings-select"
                        value={audioDeviceId}
                        onChange={(e) => setAudioDeviceId(e.target.value)}
                        disabled={!audioEnabled}
                      >
                        {audioDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone (${d.deviceId.slice(0, 5)})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick status line below camera */}
          <div className="gm-preview-device-status">
            <span>{videoEnabled ? activeVideoName : 'Camera off'}</span>
            <span className="gm-device-bullet">•</span>
            <span>{audioEnabled ? activeAudioName : 'Microphone muted'}</span>
          </div>
        </div>

        {/* RIGHT: Join Action Panel */}
        <div className="gm-action-col">
          <div className="gm-action-card">
            <h1 className="gm-action-heading">Ready to join?</h1>
            <p className="gm-action-sub">
              No one else is here yet. Share the code to invite others.
            </p>

            {/* Room code pill with 1-click copy */}
            <div className="gm-room-badge" onClick={copyRoomLink} title="Click to copy meeting link">
              <span className="gm-room-code-text">{roomName}</span>
              <button type="button" className="gm-room-copy-btn" aria-label="Copy meeting link">
                <CopyIcon size={14} />
                <span>Copy link</span>
              </button>
            </div>

            {/* Join Form */}
            <form onSubmit={handleSubmit} className="gm-join-form">
              <div className="gm-input-wrapper">
                <label htmlFor="gm-name-input" className="gm-input-label">
                  Your name
                </label>
                <input
                  id="gm-name-input"
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="gm-join-input"
                  autoFocus
                />
              </div>

              <button type="submit" className="gm-join-btn">
                Join now
              </button>
            </form>

            {/* Secondary Option: Join without Camera/Mic */}
            {onContinueWithoutMedia && (
              <button
                type="button"
                className="gm-secondary-btn"
                onClick={onContinueWithoutMedia}
              >
                Join without camera &amp; microphone
              </button>
            )}

            <div className="gm-security-notice">
              <ShieldCheckIcon size={16} />
              <span>Real-time encryption active for this meeting</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
