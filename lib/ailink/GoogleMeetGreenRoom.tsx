'use client';

import * as React from 'react';
import { LocalUserChoices, usePreviewTracks } from '@livekit/components-react';
import { LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client';
import toast from 'react-hot-toast';
import {
  CameraIcon,
  CameraOffIcon,
  CopyIcon,
  HeadphonesIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  VolumeIcon,
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
  const [username, setUsername] = React.useState(() => {
    if (defaultUsername) return defaultUsername;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hx_meet_username') || '';
    }
    return '';
  });

  const [videoEnabled, setVideoEnabled] = React.useState(defaultVideoEnabled);
  const [audioEnabled, setAudioEnabled] = React.useState(defaultAudioEnabled);
  const [selectedVideoId, setSelectedVideoId] = React.useState<string | undefined>(undefined);
  const [selectedAudioId, setSelectedAudioId] = React.useState<string | undefined>(undefined);
  const [selectedSpeakerId, setSelectedSpeakerId] = React.useState<string | undefined>(undefined);
  const [blurEnabled, setBlurEnabled] = React.useState(false);

  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [testSoundPlaying, setTestSoundPlaying] = React.useState(false);

  const videoEl = React.useRef<HTMLVideoElement | null>(null);
  const settingsRef = React.useRef<HTMLDivElement>(null);

  // Device enumeration: pure reader, ZERO mutations to deviceId state to prevent re-trigger loops
  const refreshDevices = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
      setSpeakerDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn('Device enumeration error', err);
    }
  }, []);

  React.useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  // Stable preview options for usePreviewTracks:
  // ONLY pass deviceId when the user has explicitly selected one from the dropdown!
  // Otherwise pass boolean true so getUserMedia() is called ONCE without loop resets.
  const previewOptions = React.useMemo(() => {
    return {
      audio: audioEnabled ? (selectedAudioId ? { deviceId: selectedAudioId } : true) : false,
      video: videoEnabled ? (selectedVideoId ? { deviceId: selectedVideoId } : true) : false,
    };
  }, [audioEnabled, videoEnabled, selectedAudioId, selectedVideoId]);

  const tracks = usePreviewTracks(previewOptions, (error) => {
    console.warn('Track preview error', error);
  });

  // Once tracks are first acquired and browser permission is granted, refresh device labels once
  const initialRefreshDone = React.useRef(false);
  React.useEffect(() => {
    if (tracks && tracks.length > 0 && !initialRefreshDone.current) {
      initialRefreshDone.current = true;
      refreshDevices();
    }
  }, [tracks, refreshDevices]);

  const videoTrack = React.useMemo(
    () => tracks?.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
    [tracks],
  );

  const audioTrack = React.useMemo(
    () => tracks?.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined,
    [tracks],
  );

  // Callback ref: Attaches video track the moment <video> DOM element mounts
  const setVideoRef = React.useCallback(
    (el: HTMLVideoElement | null) => {
      videoEl.current = el;
      if (el && videoTrack && videoEnabled) {
        try {
          videoTrack.unmute();
          videoTrack.attach(el);
        } catch (e) {
          console.warn('Video attach error', e);
        }
      }
    },
    [videoTrack, videoEnabled],
  );

  // Ensure track is attached if videoTrack updates while element is mounted
  React.useEffect(() => {
    const el = videoEl.current;
    if (el && videoTrack && videoEnabled) {
      try {
        videoTrack.unmute();
        videoTrack.attach(el);
      } catch (e) {
        console.warn('Video attach error', e);
      }
    }
    return () => {
      if (el && videoTrack) {
        try {
          videoTrack.detach(el);
        } catch {}
      }
    };
  }, [videoTrack, videoEnabled]);

  // Background blur processor toggle
  React.useEffect(() => {
    if (!videoTrack) return;
    let cancelled = false;

    async function applyBlur() {
      try {
        if (blurEnabled && videoTrack) {
          const { BackgroundBlur } = await import('@livekit/track-processors');
          if (!cancelled && videoTrack.getProcessor()?.name !== 'background-blur') {
            await videoTrack.setProcessor(BackgroundBlur());
          }
        } else if (!blurEnabled && videoTrack) {
          await videoTrack.stopProcessor();
        }
      } catch (err) {
        console.warn('Could not toggle blur processor', err);
      }
    }

    applyBlur();
    return () => {
      cancelled = true;
    };
  }, [videoTrack, blurEnabled]);

  // Real-time audio level visualizer using Web Audio API
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
          setAudioLevel(Math.min(100, Math.round(avg * 1.8)));
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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = username.trim();
    if (!cleanName) {
      toast.error('Please enter your name to join');
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('hx_meet_username', cleanName);
    }
    onSubmit({
      username: cleanName,
      videoEnabled,
      audioEnabled,
      videoDeviceId: selectedVideoId || '',
      audioDeviceId: selectedAudioId || '',
    });
  };

  const handlePresentJoin = () => {
    const cleanName = username.trim();
    if (!cleanName) {
      toast.error('Please enter your name to present');
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('hx_meet_username', cleanName);
    }
    onSubmit({
      username: cleanName,
      videoEnabled: false,
      audioEnabled,
      videoDeviceId: selectedVideoId || '',
      audioDeviceId: selectedAudioId || '',
    });
  };

  const copyRoomLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Meeting link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  const playTestSound = () => {
    try {
      setTestSoundPlaying(true);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => {
        setTestSoundPlaying(false);
        ctx.close().catch(() => undefined);
      }, 400);
    } catch {
      setTestSoundPlaying(false);
    }
  };

  // Human readable active device labels
  const activeVideoName = React.useMemo(() => {
    if (!videoEnabled) return 'Camera is off';
    if (videoTrack?.mediaStreamTrack?.label) return videoTrack.mediaStreamTrack.label;
    const match = videoDevices.find((d) => d.deviceId === selectedVideoId);
    return match?.label || videoDevices[0]?.label || 'Default Camera';
  }, [videoEnabled, videoTrack, videoDevices, selectedVideoId]);

  const activeAudioName = React.useMemo(() => {
    if (!audioEnabled) return 'Microphone muted';
    if (audioTrack?.mediaStreamTrack?.label) return audioTrack.mediaStreamTrack.label;
    const match = audioDevices.find((d) => d.deviceId === selectedAudioId);
    return match?.label || audioDevices[0]?.label || 'Default Microphone';
  }, [audioEnabled, audioTrack, audioDevices, selectedAudioId]);

  return (
    <div className="gm-greenroom-container">
      {/* 2-Column Wide Desktop Layout */}
      <div className="gm-greenroom-grid">
        {/* LEFT: Spacious 16:9 Video Preview */}
        <div className="gm-preview-col">
          <div className="gm-preview-card">
            {videoEnabled ? (
              <video
                ref={setVideoRef}
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

            {/* Audio wave indicator (top-left of video preview) */}
            {audioEnabled && (
              <div className="gm-audio-indicator" title="Microphone activity">
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(4, audioLevel * 0.22)}px` }}
                />
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(6, audioLevel * 0.32)}px` }}
                />
                <div
                  className="gm-audio-wave-bar"
                  style={{ height: `${Math.max(4, audioLevel * 0.2)}px` }}
                />
              </div>
            )}

            {/* Floating circular control bar at bottom of video preview */}
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

              {/* Visual effects (Blur) toggle */}
              <button
                type="button"
                className={`gm-dock-btn ${blurEnabled ? 'gm-dock-btn--active' : ''}`}
                onClick={() => {
                  if (!videoEnabled) {
                    toast('Turn on camera to use visual effects');
                    return;
                  }
                  setBlurEnabled((v) => !v);
                  toast(blurEnabled ? 'Background blur disabled' : 'Background blur enabled');
                }}
                title={blurEnabled ? 'Remove background blur' : 'Apply background blur'}
                aria-label="Apply visual effects"
              >
                <SparklesIcon size={20} />
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
                        value={selectedVideoId || (videoDevices[0]?.deviceId ?? '')}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                        disabled={!videoEnabled}
                      >
                        {videoDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="gm-settings-group">
                      <label className="gm-settings-label">Microphone</label>
                      <select
                        className="gm-settings-select"
                        value={selectedAudioId || (audioDevices[0]?.deviceId ?? '')}
                        onChange={(e) => setSelectedAudioId(e.target.value)}
                        disabled={!audioEnabled}
                      >
                        {audioDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {speakerDevices.length > 0 && (
                      <div className="gm-settings-group">
                        <label className="gm-settings-label">Speakers</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            className="gm-settings-select"
                            value={selectedSpeakerId || (speakerDevices[0]?.deviceId ?? '')}
                            onChange={(e) => setSelectedSpeakerId(e.target.value)}
                            style={{ flex: 1 }}
                          >
                            {speakerDevices.map((d, i) => (
                              <option key={d.deviceId || i} value={d.deviceId}>
                                {d.label || `Speaker ${i + 1}`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="gm-test-speaker-btn"
                            onClick={playTestSound}
                            disabled={testSoundPlaying}
                            title="Test speakers"
                          >
                            <VolumeIcon size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Check Audio & Video Action Button */}
          <div className="gm-preview-sub-bar">
            <button
              type="button"
              className="gm-check-media-btn"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <HeadphonesIcon size={16} />
              <span>Check your audio and video</span>
            </button>
            <div className="gm-preview-device-status">
              <span>{activeVideoName}</span>
              <span className="gm-device-bullet">•</span>
              <span>{activeAudioName}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Join Action Panel */}
        <div className="gm-action-col">
          <div className="gm-action-card">
            <h1 className="gm-action-heading">Ready to join?</h1>
            <p className="gm-action-sub">
              No one else is here yet. Share this meeting link to invite others.
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

              {/* Action Buttons Row: Join now + Present */}
              <div className="gm-action-buttons-row">
                <button type="submit" className="gm-join-btn">
                  Join now
                </button>
                <button
                  type="button"
                  className="gm-present-btn"
                  onClick={handlePresentJoin}
                  title="Join and immediately present screen"
                >
                  <ScreenShareIcon size={18} />
                  <span>Present</span>
                </button>
              </div>
            </form>

            {/* Secondary Option: Join without Camera/Mic */}
            {onContinueWithoutMedia && (
              <button
                type="button"
                className="gm-secondary-btn"
                onClick={onContinueWithoutMedia}
              >
                Other options: Join without camera &amp; microphone
              </button>
            )}

            <div className="gm-security-notice">
              <ShieldCheckIcon size={16} style={{ color: '#188038' }} />
              <span>Real-time encryption active for this meeting</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
