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
  HeadphonesIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  VolumeIcon,
} from './icons';
import { playSpeakerTestSound } from '@/lib/audioTest';
import { AudioVideoTestModal } from './AudioVideoTestModal';

export interface GoogleMeetGreenRoomProps {
  roomName: string;
  defaultUsername?: string;
  defaultVideoEnabled?: boolean;
  defaultAudioEnabled?: boolean;
  onSubmit: (choices: LocalUserChoices) => void;
  onContinueWithoutMedia?: () => void;
}

/** Isolated audio visualizer: directly animates DOM bar heights to avoid re-rendering parent components */
function AudioWaveIndicator({
  audioTrack,
  audioEnabled,
}: {
  audioTrack?: LocalAudioTrack;
  audioEnabled: boolean;
}) {
  const bar1 = React.useRef<HTMLDivElement>(null);
  const bar2 = React.useRef<HTMLDivElement>(null);
  const bar3 = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!audioTrack || !audioEnabled) return;

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
          const level = Math.min(100, Math.round(avg * 1.8));

          if (bar1.current) bar1.current.style.height = `${Math.max(4, level * 0.22)}px`;
          if (bar2.current) bar2.current.style.height = `${Math.max(6, level * 0.32)}px`;
          if (bar3.current) bar3.current.style.height = `${Math.max(4, level * 0.2)}px`;

          animId = requestAnimationFrame(checkVolume);
        };
        animId = requestAnimationFrame(checkVolume);
      }
    } catch (e) {
      console.warn('Volume meter error', e);
    }

    const b1 = bar1.current;
    const b2 = bar2.current;
    const b3 = bar3.current;

    return () => {
      cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => undefined);
      }
      if (b1) b1.style.height = '4px';
      if (b2) b2.style.height = '6px';
      if (b3) b3.style.height = '4px';
    };
  }, [audioTrack, audioEnabled]);

  if (!audioEnabled) return null;

  return (
    <div className="gm-audio-indicator" title="Microphone activity">
      <div ref={bar1} className="gm-audio-wave-bar" style={{ height: '4px' }} />
      <div ref={bar2} className="gm-audio-wave-bar" style={{ height: '6px' }} />
      <div ref={bar3} className="gm-audio-wave-bar" style={{ height: '4px' }} />
    </div>
  );
}

export function GoogleMeetGreenRoom({
  roomName,
  defaultUsername = '',
  defaultVideoEnabled = true,
  defaultAudioEnabled = true,
  onSubmit,
  onContinueWithoutMedia,
}: GoogleMeetGreenRoomProps) {
  // SSR-safe initial values — localStorage is loaded in useEffect after hydration
  const [username, setUsername] = React.useState(defaultUsername || '');
  const [videoEnabled, setVideoEnabled] = React.useState(defaultVideoEnabled);
  const [audioEnabled, setAudioEnabled] = React.useState(defaultAudioEnabled);
  const [selectedVideoId, setSelectedVideoId] = React.useState<string | undefined>(undefined);
  const [selectedAudioId, setSelectedAudioId] = React.useState<string | undefined>(undefined);
  const [selectedSpeakerId, setSelectedSpeakerId] = React.useState<string | undefined>(undefined);
  const [blurEnabled, setBlurEnabled] = React.useState(false);
  // Default to false for SSR; will be corrected to persisted value after mount
  const [noiseCancellationEnabled, setNoiseCancellationEnabled] = React.useState(false);

  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [micMenuOpen, setMicMenuOpen] = React.useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = React.useState(false);
  const [testSoundPlaying, setTestSoundPlaying] = React.useState(false);

  // Restore persisted state from localStorage after mount (avoids SSR/client hydration mismatch)
  React.useEffect(() => {
    const savedUsername = !defaultUsername ? (localStorage.getItem('hx_meet_username') || '') : defaultUsername;
    if (savedUsername) setUsername(savedUsername);

    const savedSpeaker = localStorage.getItem('hx_meet_speaker_id');
    if (savedSpeaker) setSelectedSpeakerId(savedSpeaker);

    const savedKrisp = localStorage.getItem('hx_meet_krisp_enabled');
    // Default to true (noise cancellation on) when no saved preference
    setNoiseCancellationEnabled(savedKrisp !== null ? savedKrisp === 'true' : true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoEl = React.useRef<HTMLVideoElement | null>(null);
  const settingsRef = React.useRef<HTMLDivElement>(null);
  const micMenuRef = React.useRef<HTMLDivElement>(null);
  const cameraMenuRef = React.useRef<HTMLDivElement>(null);

  const videoEnabledRef = React.useRef(videoEnabled);
  videoEnabledRef.current = videoEnabled;

  const audioEnabledRef = React.useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  const selectedVideoIdRef = React.useRef(selectedVideoId);
  selectedVideoIdRef.current = selectedVideoId;

  const selectedAudioIdRef = React.useRef(selectedAudioId);
  selectedAudioIdRef.current = selectedAudioId;

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
      audio: audioEnabled
        ? {
            ...(selectedAudioId ? { deviceId: selectedAudioId } : {}),
            noiseSuppression: noiseCancellationEnabled,
            echoCancellation: true,
            autoGainControl: true,
          }
        : false,
      video: videoEnabled ? (selectedVideoId ? { deviceId: selectedVideoId } : true) : false,
    };
  }, [audioEnabled, videoEnabled, selectedAudioId, selectedVideoId, noiseCancellationEnabled]);

  // Reference-stable error handler passed to usePreviewTracks.
  // Intercepts NotFoundError (missing webcam/mic), OverconstrainedError, and NotAllowedError,
  // preventing LiveKit from triggering unhandled console.error in Next.js dev overlay.
  const handleTrackError = React.useCallback((err: Error) => {
    const errName = err?.name || '';
    const errMsg = err?.message || '';
    const isNotFound =
      errName === 'NotFoundError' ||
      errName === 'DevicesNotFoundError' ||
      errMsg.toLowerCase().includes('device not found') ||
      errMsg.toLowerCase().includes('not found') ||
      errMsg.toLowerCase().includes('notfound');
    const isOverconstrained = errName === 'OverconstrainedError';
    const isNotAllowed =
      errName === 'NotAllowedError' ||
      errName === 'PermissionDeniedError' ||
      errMsg.toLowerCase().includes('permission');
    const isNotReadable =
      errName === 'NotReadableError' ||
      errName === 'TrackStartError' ||
      errMsg.toLowerCase().includes('could not start');

    // If an explicitly selected device failed/disconnected, clear the ID selection
    if (selectedVideoIdRef.current) {
      setSelectedVideoId(undefined);
    }
    if (selectedAudioIdRef.current) {
      setSelectedAudioId(undefined);
    }

    if (isNotFound || isOverconstrained) {
      if (videoEnabledRef.current && audioEnabledRef.current) {
        // Most commonly, the webcam is missing/unplugged. Fall back to audio-only.
        setVideoEnabled(false);
        toast('Camera not detected. You can join with microphone only.');
      } else if (videoEnabledRef.current) {
        setVideoEnabled(false);
        toast('Camera not detected. Video preview disabled.');
      } else if (audioEnabledRef.current) {
        setAudioEnabled(false);
        toast('Microphone not detected. You can join in listen-only mode.');
      }
    } else if (isNotAllowed) {
      setVideoEnabled(false);
      setAudioEnabled(false);
      toast.error('Permissions denied. Please allow camera and microphone access in browser settings.');
    } else if (isNotReadable) {
      if (videoEnabledRef.current) {
        setVideoEnabled(false);
        toast.error('Camera is currently in use by another application.');
      } else if (audioEnabledRef.current) {
        setAudioEnabled(false);
        toast.error('Microphone is currently in use by another application.');
      }
    } else {
      console.warn('Media preview error gracefully handled:', err);
    }
  }, []);

  // Pass handleTrackError so LiveKit delegates errors to our handler instead of console.error
  const tracks = usePreviewTracks(previewOptions, handleTrackError);

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
      if (el && videoTrack) {
        try {
          videoTrack.unmute();
          videoTrack.attach(el);
        } catch (e) {
          console.warn('Video attach error', e);
        }
      }
    },
    [videoTrack],
  );

  // Ensure track is attached if videoTrack updates while element is mounted
  React.useEffect(() => {
    const el = videoEl.current;
    if (el && videoTrack) {
      try {
        videoTrack.unmute();
        videoTrack.attach(el);
      } catch (e) {
        console.warn('Video attach error', e);
      }
    }
    return () => {
      if (videoTrack) {
        try {
          videoTrack.detach();
        } catch {}
      }
    };
  }, [videoTrack]);

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

  // Close popups when clicking outside
  React.useEffect(() => {
    if (!micMenuOpen && !cameraMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (micMenuOpen && micMenuRef.current && !micMenuRef.current.contains(target)) {
        setMicMenuOpen(false);
      }
      if (cameraMenuOpen && cameraMenuRef.current && !cameraMenuRef.current.contains(target)) {
        setCameraMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [micMenuOpen, cameraMenuOpen]);

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
      speakerDeviceId: selectedSpeakerId || '',
    } as unknown as LocalUserChoices);
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
      speakerDeviceId: selectedSpeakerId || '',
    } as unknown as LocalUserChoices);
  };

  const copyRoomLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Meeting link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  const playTestSound = () => {
    setTestSoundPlaying(true);
    playSpeakerTestSound(selectedSpeakerId).finally(() => {
      setTimeout(() => setTestSoundPlaying(false), 450);
    });
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
            {videoEnabled && videoTrack ? (
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
                <span className="gm-preview-off-text">
                  {videoEnabled ? 'Starting camera…' : 'Camera is off'}
                </span>
              </div>
            )}

            {/* Audio wave indicator (top-left of video preview) */}
            <AudioWaveIndicator audioTrack={audioTrack} audioEnabled={audioEnabled} />

            {/* Floating circular control bar at bottom of video preview */}
            <div className="gm-preview-dock">
              {/* Google Meet Split Mic Button */}
              <div className="gm-split-btn-wrapper" ref={micMenuRef}>
                <div className={`gm-split-btn ${!audioEnabled ? 'gm-split-btn--muted' : ''}`}>
                  <button
                    type="button"
                    className="gm-split-btn-action"
                    onClick={() => setAudioEnabled((prev) => !prev)}
                    title={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                    aria-label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                  >
                    {audioEnabled ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
                  </button>
                  <span className="gm-split-btn-divider" />
                  <button
                    type="button"
                    className={`gm-split-btn-chevron ${micMenuOpen ? 'gm-split-btn-chevron--active' : ''}`}
                    onClick={() => {
                      setMicMenuOpen((v) => !v);
                      setCameraMenuOpen(false);
                      setSettingsOpen(false);
                    }}
                    title="Audio settings (Microphone & Speaker)"
                    aria-label="Select audio devices"
                    aria-expanded={micMenuOpen}
                  >
                    <ChevronDownIcon size={14} />
                  </button>
                </div>

                {/* Upward Audio Popover Menu */}
                {micMenuOpen && (
                  <div className="gm-device-popover" role="menu">
                    <div className="gm-device-section-title">MICROPHONE</div>
                    <div className="gm-device-list">
                      {audioDevices.length === 0 ? (
                        <div className="gm-device-empty">No microphones found</div>
                      ) : (
                        audioDevices.map((d, i) => {
                          const isSelected = selectedAudioId ? selectedAudioId === d.deviceId : i === 0;
                          return (
                            <button
                              key={d.deviceId || i}
                              type="button"
                              className={`gm-device-item ${isSelected ? 'gm-device-item--selected' : ''}`}
                              onClick={() => {
                                setSelectedAudioId(d.deviceId);
                                setMicMenuOpen(false);
                                toast.success(`Microphone: ${d.label || `Microphone ${i + 1}`}`);
                              }}
                            >
                              <span className="gm-device-check">
                                {isSelected && <CheckIcon size={16} />}
                              </span>
                              <span className="gm-device-name">{d.label || `Microphone ${i + 1}`}</span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="gm-device-divider" />

                    <div className="gm-device-section-title">SPEAKERS</div>
                    <div className="gm-device-list">
                      {speakerDevices.length === 0 ? (
                        <div className="gm-device-empty">Default system speaker</div>
                      ) : (
                        speakerDevices.map((d, i) => {
                          const isSelected = selectedSpeakerId ? selectedSpeakerId === d.deviceId : i === 0;
                          return (
                            <button
                              key={d.deviceId || i}
                              type="button"
                              className={`gm-device-item ${isSelected ? 'gm-device-item--selected' : ''}`}
                              onClick={() => {
                                setSelectedSpeakerId(d.deviceId);
                                if (typeof window !== 'undefined') {
                                  localStorage.setItem('hx_meet_speaker_id', d.deviceId);
                                }
                                setMicMenuOpen(false);
                                toast.success(`Speaker: ${d.label || `Speaker ${i + 1}`}`);
                              }}
                            >
                              <span className="gm-device-check">
                                {isSelected && <CheckIcon size={16} />}
                              </span>
                              <span className="gm-device-name">{d.label || `Speaker ${i + 1}`}</span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="gm-device-divider" />

                    <button
                      type="button"
                      className="gm-device-test-btn"
                      onClick={playTestSound}
                      disabled={testSoundPlaying}
                    >
                      <VolumeIcon size={15} />
                      <span>{testSoundPlaying ? 'Playing test tone…' : 'Test speakers'}</span>
                    </button>

                    <div className="gm-device-divider" />

                    <button
                      type="button"
                      className="gm-device-test-btn"
                      onClick={() => {
                        setMicMenuOpen(false);
                        setSettingsOpen(true);
                      }}
                      title="Audio settings, mic test & noise cancellation"
                    >
                      <HeadphonesIcon size={15} />
                      <span>Noise cancellation &amp; mic test</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Google Meet Split Camera Button */}
              <div className="gm-split-btn-wrapper" ref={cameraMenuRef}>
                <div className={`gm-split-btn ${!videoEnabled ? 'gm-split-btn--muted' : ''}`}>
                  <button
                    type="button"
                    className="gm-split-btn-action"
                    onClick={() => setVideoEnabled((prev) => !prev)}
                    title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                    aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {videoEnabled ? <CameraIcon size={20} /> : <CameraOffIcon size={20} />}
                  </button>
                  <span className="gm-split-btn-divider" />
                  <button
                    type="button"
                    className={`gm-split-btn-chevron ${cameraMenuOpen ? 'gm-split-btn-chevron--active' : ''}`}
                    onClick={() => {
                      setCameraMenuOpen((v) => !v);
                      setMicMenuOpen(false);
                      setSettingsOpen(false);
                    }}
                    title="Camera settings"
                    aria-label="Select camera device"
                    aria-expanded={cameraMenuOpen}
                  >
                    <ChevronDownIcon size={14} />
                  </button>
                </div>

                {/* Upward Camera Popover Menu */}
                {cameraMenuOpen && (
                  <div className="gm-device-popover" role="menu">
                    <div className="gm-device-section-title">CAMERA</div>
                    <div className="gm-device-list">
                      {videoDevices.length === 0 ? (
                        <div className="gm-device-empty">No cameras found</div>
                      ) : (
                        videoDevices.map((d, i) => {
                          const isSelected = selectedVideoId ? selectedVideoId === d.deviceId : i === 0;
                          return (
                            <button
                              key={d.deviceId || i}
                              type="button"
                              className={`gm-device-item ${isSelected ? 'gm-device-item--selected' : ''}`}
                              onClick={() => {
                                setSelectedVideoId(d.deviceId);
                                setCameraMenuOpen(false);
                                toast.success(`Camera: ${d.label || `Camera ${i + 1}`}`);
                              }}
                            >
                              <span className="gm-device-check">
                                {isSelected && <CheckIcon size={16} />}
                              </span>
                              <span className="gm-device-name">{d.label || `Camera ${i + 1}`}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

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

              {/* Audio & Video Settings Button */}
              <div className="gm-settings-wrapper" ref={settingsRef}>
                <button
                  type="button"
                  className={`gm-dock-btn ${settingsOpen ? 'gm-dock-btn--active' : ''}`}
                  onClick={() => setSettingsOpen(true)}
                  title="Audio and video settings & noise cancellation test"
                  aria-label="Audio and video settings"
                >
                  <SettingsIcon size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Check Audio & Video Action Button */}
          <div className="gm-preview-sub-bar">
            <button
              type="button"
              className="gm-check-media-btn"
              onClick={() => setSettingsOpen(true)}
            >
              <HeadphonesIcon size={16} />
              <span>Check your audio and video</span>
            </button>
            <div className="gm-preview-device-status">
              <span>{activeVideoName}</span>
              <span className="gm-device-bullet">•</span>
              <span>{activeAudioName}</span>
              {noiseCancellationEnabled && (
                <>
                  <span className="gm-device-bullet">•</span>
                  <span style={{ color: '#81c995', fontWeight: 500 }}>Noise Suppression ON</span>
                </>
              )}
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
              <span className="gm-room-code-text">{roomName.toUpperCase()}</span>
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

      {/* Audio & Video Settings + Discord-Style Mic Loopback Test Modal */}
      <AudioVideoTestModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        audioTrack={audioTrack}
        videoTrack={videoTrack}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        audioDevices={audioDevices}
        videoDevices={videoDevices}
        speakerDevices={speakerDevices}
        selectedAudioId={selectedAudioId}
        selectedVideoId={selectedVideoId}
        selectedSpeakerId={selectedSpeakerId}
        onSelectAudioId={setSelectedAudioId}
        onSelectVideoId={setSelectedVideoId}
        onSelectSpeakerId={(id) => {
          setSelectedSpeakerId(id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('hx_meet_speaker_id', id);
          }
        }}
        blurEnabled={blurEnabled}
        onToggleBlur={() => {
          if (!videoEnabled) {
            toast('Turn on camera to use visual effects');
            return;
          }
          setBlurEnabled((v) => !v);
        }}
        noiseCancellationEnabled={noiseCancellationEnabled}
        onToggleNoiseCancellation={(enabled) => {
          setNoiseCancellationEnabled(enabled);
          if (typeof window !== 'undefined') {
            localStorage.setItem('hx_meet_krisp_enabled', String(enabled));
          }
          const audioTrack = tracks?.find((t) => t.kind === Track.Kind.Audio);
          if (audioTrack?.mediaStreamTrack) {
            audioTrack.mediaStreamTrack
              .applyConstraints({
                noiseSuppression: enabled,
                echoCancellation: true,
                autoGainControl: enabled,
                // @ts-ignore - Apple / Chromium Voice Isolation
                voiceIsolation: enabled,
              })
              .catch(() => undefined);
          }
        }}
      />
    </div>
  );
}
