'use client';

import * as React from 'react';
import { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import toast from 'react-hot-toast';
import { playSpeakerTestSound } from '../audioTest';
import { VoiceNoiseFilterEngine } from '../audioNoiseFilter';
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  CloseIcon,
  HeadphonesIcon,
  MicIcon,
  MicOffIcon,
  ShieldCheckIcon,
  SparklesIcon,
  VolumeIcon,
} from './icons';

export interface AudioVideoTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioTrack?: LocalAudioTrack;
  videoTrack?: LocalVideoTrack;
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  speakerDevices: MediaDeviceInfo[];
  selectedAudioId?: string;
  selectedVideoId?: string;
  selectedSpeakerId?: string;
  onSelectAudioId: (id: string) => void;
  onSelectVideoId: (id: string) => void;
  onSelectSpeakerId: (id: string) => void;
  blurEnabled: boolean;
  onToggleBlur: () => void;
  noiseCancellationEnabled: boolean;
  onToggleNoiseCancellation: (enabled: boolean) => void;
}

export function AudioVideoTestModal({
  isOpen,
  onClose,
  audioTrack,
  videoTrack,
  audioEnabled,
  videoEnabled,
  audioDevices,
  videoDevices,
  speakerDevices,
  selectedAudioId,
  selectedVideoId,
  selectedSpeakerId,
  onSelectAudioId,
  onSelectVideoId,
  onSelectSpeakerId,
  blurEnabled,
  onToggleBlur,
  noiseCancellationEnabled,
  onToggleNoiseCancellation,
}: AudioVideoTestModalProps) {
  const [activeTab, setActiveTab] = React.useState<'audio' | 'video'>('audio');
  const [isTestingMic, setIsTestingMic] = React.useState(false);
  const [volumeLevel, setVolumeLevel] = React.useState(0);
  const [testSpeakerPlaying, setTestSpeakerPlaying] = React.useState(false);
  const [krispPending, setKrispPending] = React.useState(false);

  // Audio testing refs
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);
  const animFrameRef = React.useRef<number | null>(null);
  const noiseEngineRef = React.useRef<VoiceNoiseFilterEngine | null>(null);
  const videoPreviewRef = React.useRef<HTMLVideoElement | null>(null);

  // Attach video track to modal thumbnail if in video tab
  React.useEffect(() => {
    if (activeTab === 'video' && videoPreviewRef.current && videoTrack && videoEnabled) {
      try {
        videoTrack.attach(videoPreviewRef.current);
      } catch (err) {
        console.warn('Error attaching video in test modal:', err);
      }
    }
  }, [activeTab, videoTrack, videoEnabled]);

  // Stop mic test loopback audio
  const stopMicTest = React.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (noiseEngineRef.current) {
      noiseEngineRef.current.dispose();
      noiseEngineRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setVolumeLevel(0);
    setIsTestingMic(false);
  }, []);

  // Ensure test is stopped when modal closes or audioTrack changes
  React.useEffect(() => {
    if (!isOpen) {
      stopMicTest();
    }
  }, [isOpen, stopMicTest]);

  React.useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, [stopMicTest]);

  // Start mic test loopback audio
  const startMicTest = React.useCallback(async () => {
    if (!audioTrack?.mediaStreamTrack) {
      toast.error('Microphone track not ready. Please check mic permissions.');
      return;
    }
    if (!audioEnabled) {
      toast.error('Microphone is muted. Turn on mic to test.');
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      // Ensure audioTrack has audioContext set
      if (typeof (audioTrack as unknown as { setAudioContext?: (c: AudioContext) => void }).setAudioContext === 'function') {
        try {
          (audioTrack as unknown as { setAudioContext: (c: AudioContext) => void }).setAudioContext(ctx);
        } catch {}
      }

      const stream = new MediaStream([audioTrack.mediaStreamTrack]);

      // Connect real-time VoiceNoiseFilterEngine (highpass, lowpass, dynamic voice gate)
      const engine = new VoiceNoiseFilterEngine(ctx, stream, noiseCancellationEnabled);
      noiseEngineRef.current = engine;

      // Route filtered/raw output to audio destination
      const dest = ctx.createMediaStreamDestination();
      engine.connect(dest);

      const audio = new Audio();
      audio.srcObject = dest.stream;
      audioElRef.current = audio;

      const sinkId = selectedSpeakerId || (speakerDevices[0]?.deviceId ?? '');
      if (
        typeof (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId ===
          'function' &&
        sinkId &&
        sinkId !== 'default'
      ) {
        try {
          await (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(
            sinkId,
          );
        } catch (sinkErr) {
          console.warn('Mic test setSinkId warning:', sinkErr);
        }
      }

      await audio.play();
      setIsTestingMic(true);

      // Real-time volume meter update loop from engine analyser
      const analyser = engine.getAnalyser();
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Non-linear visual scale for human voice
        const pct = Math.min(100, Math.round((avg / 75) * 100));
        setVolumeLevel(pct);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.error('Failed to start mic test:', err);
      toast.error('Could not start microphone loopback test');
      stopMicTest();
    }
  }, [audioTrack, audioEnabled, selectedSpeakerId, speakerDevices, noiseCancellationEnabled, stopMicTest]);

  // Handle Noise Cancellation toggle in the test modal
  // Note: This controls the DSP engine during the loopback test preview.
  // The actual Krisp AI filter on the live call is managed by useKrispNoiseFilter in AILinkRoom.
  const handleToggleNoiseCancellation = async (nextState: boolean) => {
    setKrispPending(true);
    try {
      // Toggle the real-time Web Audio DSP noise filter for the loopback preview
      if (noiseEngineRef.current) {
        noiseEngineRef.current.setEnabled(nextState);
      }

      // Apply browser-level WebRTC noiseSuppression constraints on the mic track
      if (audioTrack?.mediaStreamTrack) {
        await audioTrack.mediaStreamTrack
          .applyConstraints({
            noiseSuppression: nextState,
            echoCancellation: true,
          })
          .catch(() => undefined);
      }

      // Persist preference — AILinkRoom's useKrispNoiseFilter will read this on join
      if (typeof window !== 'undefined') {
        localStorage.setItem('hx_meet_krisp_enabled', String(nextState));
      }

      onToggleNoiseCancellation(nextState);
      toast.success(
        nextState
          ? 'Noise suppression ON'
          : 'Noise suppression OFF',
        { duration: 2500 },
      );
    } catch (e) {
      console.warn('Noise cancellation toggle warning:', e);
      onToggleNoiseCancellation(nextState);
    } finally {
      setKrispPending(false);
    }
  };

  // Speaker audio test chime
  const handleTestSpeaker = async () => {
    setTestSpeakerPlaying(true);
    const sinkId = selectedSpeakerId || (speakerDevices[0]?.deviceId ?? '');
    await playSpeakerTestSound(sinkId);
    setTestSpeakerPlaying(false);
  };

  if (!isOpen) return null;

  return (
    <div className="gm-modal-overlay" role="dialog" aria-modal="true" aria-label="Audio & Video Settings">
      <div className="gm-modal-card">
        {/* Modal Header */}
        <header className="gm-modal-header">
          <div className="gm-modal-title-row">
            <h2 className="gm-modal-title">Audio &amp; Video Settings</h2>
            <button
              type="button"
              className="gm-modal-close-btn"
              onClick={onClose}
              title="Close settings"
              aria-label="Close"
            >
              <CloseIcon size={20} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <nav className="gm-modal-tabs">
            <button
              type="button"
              className={`gm-modal-tab ${activeTab === 'audio' ? 'gm-modal-tab--active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <MicIcon size={16} />
              <span>Audio &amp; Mic Test</span>
            </button>
            <button
              type="button"
              className={`gm-modal-tab ${activeTab === 'video' ? 'gm-modal-tab--active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <CameraIcon size={16} />
              <span>Video &amp; Effects</span>
            </button>
          </nav>
        </header>

        {/* Modal Body */}
        <div className="gm-modal-body">
          {activeTab === 'audio' ? (
            <div className="gm-modal-section">
              {/* Input Device (Microphone) */}
              <div className="gm-form-group">
                <label className="gm-form-label" htmlFor="gm-select-mic">
                  Microphone
                </label>
                <select
                  id="gm-select-mic"
                  className="gm-form-select"
                  value={selectedAudioId || (audioDevices[0]?.deviceId ?? '')}
                  onChange={(e) => onSelectAudioId(e.target.value)}
                  disabled={!audioEnabled}
                >
                  {audioDevices.length === 0 ? (
                    <option value="">Default microphone</option>
                  ) : (
                    audioDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
                {!audioEnabled && (
                  <span className="gm-form-hint gm-form-hint--warning">
                    Microphone is currently turned off.
                  </span>
                )}
              </div>

              {/* Output Device (Speakers) */}
              {speakerDevices.length > 0 && (
                <div className="gm-form-group">
                  <label className="gm-form-label" htmlFor="gm-select-speaker">
                    Speakers / Output
                  </label>
                  <div className="gm-form-row">
                    <select
                      id="gm-select-speaker"
                      className="gm-form-select"
                      value={selectedSpeakerId || (speakerDevices[0]?.deviceId ?? '')}
                      onChange={(e) => onSelectSpeakerId(e.target.value)}
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
                      className="gm-modal-btn-secondary"
                      onClick={handleTestSpeaker}
                      disabled={testSpeakerPlaying}
                      title="Test output speaker"
                    >
                      <VolumeIcon size={16} />
                      <span>{testSpeakerPlaying ? 'Playing…' : 'Test sound'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Discord-Style Mic Test & Voice Loopback Card */}
              <div className="gm-discord-test-card">
                <div className="gm-discord-test-header">
                  <div className="gm-discord-test-title">
                    <HeadphonesIcon size={18} />
                    <span>Mic Test (Hear Yourself)</span>
                  </div>
                  {isTestingMic && (
                    <span className="gm-discord-live-badge">
                      <span className="gm-live-dot" /> Live Monitoring
                    </span>
                  )}
                </div>

                <p className="gm-discord-test-desc">
                  Say something into your microphone to hear how you sound to others. Flip Noise
                  Cancellation ON and OFF to hear the background noise filter in action.
                </p>

                {/* Let's Check Action Button */}
                <div className="gm-discord-btn-row">
                  <button
                    type="button"
                    className={`gm-discord-check-btn ${isTestingMic ? 'gm-discord-check-btn--active' : ''}`}
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                  >
                    {isTestingMic ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
                    <span>{isTestingMic ? 'Stop Testing' : "Let's check"}</span>
                  </button>
                  <span className="gm-discord-headphone-tip">
                    <HeadphonesIcon size={14} /> Use headphones to prevent echo while testing
                  </span>
                </div>

                {/* Animated Voice Visualizer Meter Bar */}
                <div className="gm-discord-meter-wrapper">
                  <div className="gm-discord-meter-track">
                    <div
                      className={`gm-discord-meter-fill ${isTestingMic ? 'gm-discord-meter-fill--active' : ''}`}
                      style={{ width: `${isTestingMic ? volumeLevel : 0}%` }}
                    />
                  </div>
                  <div className="gm-discord-meter-labels">
                    <span>-60 dB</span>
                    <span>-30 dB</span>
                    <span>-12 dB</span>
                    <span>0 dB</span>
                  </div>
                </div>

                {/* AI Noise Cancellation (Krisp) Toggle Switch */}
                <div className="gm-discord-noise-toggle-box">
                  <div className="gm-noise-info">
                    <div className="gm-noise-title-row">
                      <ShieldCheckIcon size={16} />
                      <span className="gm-noise-title">Noise Suppression</span>
                      <span
                        className={`gm-noise-badge ${noiseCancellationEnabled ? 'gm-noise-badge--on' : 'gm-noise-badge--off'}`}
                      >
                        {noiseCancellationEnabled ? 'Active (Clean)' : 'Off (Raw)'}
                      </span>
                    </div>
                    <p className="gm-noise-desc">
                      Removes room echo, fan hum, keyboard typing, and background chatter in real
                      time.
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noiseCancellationEnabled}
                    className={`gm-switch-btn ${noiseCancellationEnabled ? 'gm-switch-btn--on' : ''}`}
                    onClick={() => handleToggleNoiseCancellation(!noiseCancellationEnabled)}
                    disabled={krispPending}
                    title={noiseCancellationEnabled ? 'Disable noise cancellation' : 'Enable noise cancellation'}
                  >
                    <span className="gm-switch-handle" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="gm-modal-section">
              {/* Camera device selection */}
              <div className="gm-form-group">
                <label className="gm-form-label" htmlFor="gm-select-cam">
                  Camera
                </label>
                <select
                  id="gm-select-cam"
                  className="gm-form-select"
                  value={selectedVideoId || (videoDevices[0]?.deviceId ?? '')}
                  onChange={(e) => onSelectVideoId(e.target.value)}
                  disabled={!videoEnabled}
                >
                  {videoDevices.length === 0 ? (
                    <option value="">Default camera</option>
                  ) : (
                    videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
                {!videoEnabled && (
                  <span className="gm-form-hint gm-form-hint--warning">
                    Camera is currently turned off.
                  </span>
                )}
              </div>

              {/* Video Thumbnail Preview */}
              <div className="gm-modal-video-preview">
                {videoEnabled && videoTrack ? (
                  <video
                    ref={videoPreviewRef}
                    className="gm-modal-video-element"
                    autoPlay
                    playsInline
                    muted
                  />
                ) : (
                  <div className="gm-modal-video-off">
                    <CameraOffIcon size={32} />
                    <span>Camera preview is off</span>
                  </div>
                )}
              </div>

              {/* Background Visual Effects Toggle */}
              <div className="gm-discord-noise-toggle-box">
                <div className="gm-noise-info">
                  <div className="gm-noise-title-row">
                    <SparklesIcon size={16} />
                    <span className="gm-noise-title">Background Blur</span>
                    <span
                      className={`gm-noise-badge ${blurEnabled ? 'gm-noise-badge--on' : 'gm-noise-badge--off'}`}
                    >
                      {blurEnabled ? 'Blur On' : 'Off'}
                    </span>
                  </div>
                  <p className="gm-noise-desc">
                    Softly blurs your physical background so you stand out clearly on camera.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={blurEnabled}
                  className={`gm-switch-btn ${blurEnabled ? 'gm-switch-btn--on' : ''}`}
                  onClick={onToggleBlur}
                  disabled={!videoEnabled}
                  title={blurEnabled ? 'Disable background blur' : 'Enable background blur'}
                >
                  <span className="gm-switch-handle" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="gm-modal-footer">
          <button type="button" className="gm-modal-btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
