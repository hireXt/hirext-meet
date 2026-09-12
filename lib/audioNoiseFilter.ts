'use client';

import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import { Track } from 'livekit-client';

/**
 * Real-time Intelligent Voice Isolation & Noise Suppression Engine.
 *
 * Implements a multi-stage DSP pipeline:
 * 1. 4th-Order High-Pass Filter (160 Hz):
 *    Completely wipes out desk thumps, mic handling, floor vibrations, and 50/60 Hz AC hum.
 * 2. 4th-Order Low-Pass Filter (3600 Hz):
 *    Aggressively cuts high-frequency keycap clicks, mechanical switch snaps, and fan hiss,
 *    while preserving 100% of human vocal speech range (300 Hz – 3.4 kHz standard telephony/VoIP).
 * 3. Vocal Formant Presence Boost (+3.5 dB at 1900 Hz):
 *    Compensates for the cutoff by boosting core vocal formants, giving speech a punchy broadcast clarity.
 * 4. Transient Impulse Suppressor (Anti-Clicker / Keyboard Squelch):
 *    Distinguishes sharp impulsive transients (keyboard typing, mouse clicks) using zero-crossing
 *    rate (ZCR) and peak slew-rate analysis. Squelches mechanical typing clicks before they reach output.
 * 5. Dynamic Voice Activity Expander (Noise Gate with Adaptive Floor):
 *    Tracks background ambient noise floor continuously. When speech is absent, attenuates audio
 *    by -46 dB (dead silence: no keyboard, no fan, no room reverb). Smooth 4ms attack, 190ms hold
 *    to preserve natural word endings without speech clipping.
 * 6. Real-time True Bypass:
 *    When OFF: 100% untouched raw microphone stream.
 *    When ON: Deep, clean voice isolation with keyboard clicks and room noise suppressed.
 */
export class VoiceNoiseFilterEngine {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private highpass1: BiquadFilterNode;
  private highpass2: BiquadFilterNode;
  private humNotch: BiquadFilterNode;
  private presenceEQ: BiquadFilterNode;
  private lowpass1: BiquadFilterNode;
  private lowpass2: BiquadFilterNode;
  private gateNode: ScriptProcessorNode;
  private cleanGain: GainNode;
  private rawGain: GainNode;
  private outputNode: GainNode;
  private analyser: AnalyserNode;

  private isEnabled: boolean = true;
  private currentGateGain: number = 0;
  private lastSample: number = 0;

  // Adaptive noise floor tracker
  private noiseFloor: number = 0.005;
  // Hold counter (in ~10.6ms blocks): keeps gate open during natural speech pauses
  private holdFrames: number = 18; // ~190ms
  private holdCount: number = 0;
  private wasVoiceActive: boolean = false;

  constructor(ctx: AudioContext, mediaStream: MediaStream, initialEnabled: boolean = true) {
    this.ctx = ctx;
    this.isEnabled = initialEnabled;

    // Source from microphone stream
    this.source = ctx.createMediaStreamSource(mediaStream);

    // ── Filter Stage 1: Cascaded High-pass (4th-order, 24 dB/octave) at 160 Hz
    this.highpass1 = ctx.createBiquadFilter();
    this.highpass1.type = 'highpass';
    this.highpass1.frequency.setValueAtTime(160, ctx.currentTime);
    this.highpass1.Q.setValueAtTime(0.707, ctx.currentTime);

    this.highpass2 = ctx.createBiquadFilter();
    this.highpass2.type = 'highpass';
    this.highpass2.frequency.setValueAtTime(160, ctx.currentTime);
    this.highpass2.Q.setValueAtTime(0.707, ctx.currentTime);

    // ── Filter Stage 2: Electrical mains hum notch filter (50 Hz)
    this.humNotch = ctx.createBiquadFilter();
    this.humNotch.type = 'notch';
    this.humNotch.frequency.setValueAtTime(50, ctx.currentTime);
    this.humNotch.Q.setValueAtTime(25, ctx.currentTime);

    // ── Filter Stage 3: Vocal formant presence boost (+3.5 dB at 1900 Hz)
    this.presenceEQ = ctx.createBiquadFilter();
    this.presenceEQ.type = 'peaking';
    this.presenceEQ.frequency.setValueAtTime(1900, ctx.currentTime);
    this.presenceEQ.gain.setValueAtTime(3.5, ctx.currentTime);
    this.presenceEQ.Q.setValueAtTime(1.2, ctx.currentTime);

    // ── Filter Stage 4: Cascaded Low-pass (4th-order, 24 dB/octave) at 3600 Hz
    this.lowpass1 = ctx.createBiquadFilter();
    this.lowpass1.type = 'lowpass';
    this.lowpass1.frequency.setValueAtTime(3600, ctx.currentTime);
    this.lowpass1.Q.setValueAtTime(0.707, ctx.currentTime);

    this.lowpass2 = ctx.createBiquadFilter();
    this.lowpass2.type = 'lowpass';
    this.lowpass2.frequency.setValueAtTime(3600, ctx.currentTime);
    this.lowpass2.Q.setValueAtTime(0.707, ctx.currentTime);

    // ── Dynamic Voice Activity Expander & Anti-Clicker (512 samples = ~10.6ms at 48kHz)
    this.gateNode = ctx.createScriptProcessor(512, 1, 1);
    this.currentGateGain = this.isEnabled ? 0.005 : 1.0;
    this.holdCount = 0;

    this.gateNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      if (!this.isEnabled) {
        // Raw passthrough
        output.set(input);
        return;
      }

      const len = input.length;
      let sumSq = 0;
      let maxAbs = 0;
      let zcr = 0;

      for (let i = 0; i < len; i++) {
        const s = input[i]!;
        const absVal = Math.abs(s);
        sumSq += s * s;
        if (absVal > maxAbs) maxAbs = absVal;
        if (i > 0) {
          const prev = input[i - 1]!;
          if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
            zcr++;
          }
        }
      }

      const rms = Math.sqrt(sumSq / len);

      // Adaptive noise floor tracking (tracks ambient background when signal is low)
      if (rms < this.noiseFloor) {
        this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
      } else {
        this.noiseFloor = this.noiseFloor * 0.998 + rms * 0.002;
      }
      this.noiseFloor = Math.max(0.0005, Math.min(0.035, this.noiseFloor));

      // Voice vs Typing/Transient Discrimination:
      // - Keyboard clicks are impulsive spikes with high crest factor and high zero crossings
      // - Human speech has sustained harmonic energy with lower zero-crossing rate (< 65 per 512 samples)
      const crestFactor = maxAbs / (rms + 1e-5);
      const isLoudImpulse = maxAbs > 0.05 && crestFactor > 4.2;
      const isHighFreqNoise = zcr > 72;
      const isKeyboardOrNoise = isLoudImpulse || (isHighFreqNoise && !this.wasVoiceActive);

      const hasVoiceEnergy = rms > this.noiseFloor * 2.2 && rms > 0.007;
      const isVoice = hasVoiceEnergy && !isKeyboardOrNoise && zcr < 70;

      if (isVoice) {
        this.holdCount = this.holdFrames;
        this.wasVoiceActive = true;
      } else if (this.holdCount > 0) {
        this.holdCount--;
      } else {
        this.wasVoiceActive = false;
      }

      // Target gain: 1.0 when speaking / holding, 0.005 (-46 dB near-silence) when quiet
      const targetGain = isVoice || this.holdCount > 0 ? 1.0 : 0.005;

      // Smooth attack (~3ms) and release (~60ms)
      const rate = targetGain > this.currentGateGain ? 0.85 : 0.06;
      this.currentGateGain += (targetGain - this.currentGateGain) * rate;

      // Sample-level processing with transient slew-rate limiter
      const maxSlew = 0.14;
      for (let i = 0; i < len; i++) {
        let sample = input[i]!;

        // Slew-rate limit sharp impulsive spikes (rounds off key clatter)
        const diff = sample - this.lastSample;
        if (Math.abs(diff) > maxSlew) {
          sample = this.lastSample + Math.sign(diff) * maxSlew;
        }
        this.lastSample = sample;

        // Soft saturation to tame peak bursts
        if (sample > 0.75) {
          sample = 0.75 + (sample - 0.75) * 0.25;
        } else if (sample < -0.75) {
          sample = -0.75 + (sample + 0.75) * 0.25;
        }

        output[i] = sample * this.currentGateGain;
      }
    };

    // ── Connect clean chain:
    // source -> highpass1 -> highpass2 -> humNotch -> presenceEQ -> lowpass1 -> lowpass2 -> gateNode -> cleanGain
    this.source.connect(this.highpass1);
    this.highpass1.connect(this.highpass2);
    this.highpass2.connect(this.humNotch);
    this.humNotch.connect(this.presenceEQ);
    this.presenceEQ.connect(this.lowpass1);
    this.lowpass1.connect(this.lowpass2);
    this.lowpass2.connect(this.gateNode);

    this.cleanGain = ctx.createGain();
    this.cleanGain.gain.setValueAtTime(this.isEnabled ? 1.0 : 0.0, ctx.currentTime);
    this.gateNode.connect(this.cleanGain);

    // ── Connect raw chain:
    // source -> rawGain (completely unfiltered passthrough)
    this.rawGain = ctx.createGain();
    this.rawGain.gain.setValueAtTime(this.isEnabled ? 0.0 : 1.0, ctx.currentTime);
    this.source.connect(this.rawGain);

    // ── Output mixer
    this.outputNode = ctx.createGain();
    this.outputNode.gain.setValueAtTime(1.0, ctx.currentTime);
    this.cleanGain.connect(this.outputNode);
    this.rawGain.connect(this.outputNode);

    // ── Analyser for volume level metering
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.25;
    this.outputNode.connect(this.analyser);
  }

  /** Connect to an audio destination (e.g. speakers or LiveKit destination stream) */
  connect(dest: AudioNode) {
    this.outputNode.connect(dest);
  }

  /** Switch noise cancellation ON or OFF in real-time */
  setEnabled(enable: boolean) {
    this.isEnabled = enable;
    const now = this.ctx.currentTime;
    if (enable) {
      // Crossfade to clean, filtered, gated path
      this.rawGain.gain.setTargetAtTime(0.0, now, 0.015);
      this.cleanGain.gain.setTargetAtTime(1.0, now, 0.015);
      this.currentGateGain = 0.005;
      this.holdCount = 0;
    } else {
      // Crossfade to raw, unfiltered path
      this.cleanGain.gain.setTargetAtTime(0.0, now, 0.015);
      this.rawGain.gain.setTargetAtTime(1.0, now, 0.015);
      this.currentGateGain = 1.0;
    }
  }

  getEnabled(): boolean {
    return this.isEnabled;
  }

  /** Get analyser for UI volume meter */
  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  /** Clean up and disconnect all nodes */
  dispose() {
    try {
      this.gateNode.onaudioprocess = null;
      this.source.disconnect();
      this.highpass1.disconnect();
      this.highpass2.disconnect();
      this.humNotch.disconnect();
      this.presenceEQ.disconnect();
      this.lowpass1.disconnect();
      this.lowpass2.disconnect();
      this.gateNode.disconnect();
      this.cleanGain.disconnect();
      this.rawGain.disconnect();
      this.outputNode.disconnect();
      this.analyser.disconnect();
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * LiveKit Audio TrackProcessor adapter.
 * Enables VoiceNoiseFilterEngine on the live meeting LocalAudioTrack.
 */
export class LiveKitVoiceNoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'hirext-voice-noise-suppression';
  processedTrack?: MediaStreamTrack;
  private engine?: VoiceNoiseFilterEngine;
  private dest?: MediaStreamAudioDestinationNode;
  private ctx?: AudioContext;
  private isEnabled: boolean = true;

  constructor(initialEnabled: boolean = true) {
    this.isEnabled = initialEnabled;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    this.ctx = opts.audioContext;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    const stream = new MediaStream([opts.track]);
    this.engine = new VoiceNoiseFilterEngine(this.ctx, stream, this.isEnabled);
    this.dest = this.ctx.createMediaStreamDestination();
    this.engine.connect(this.dest);
    this.processedTrack = this.dest.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    if (this.engine) {
      this.engine.dispose();
      this.engine = undefined;
    }
    if (this.processedTrack) {
      this.processedTrack.stop();
      this.processedTrack = undefined;
    }
  }

  setEnabled(enable: boolean) {
    this.isEnabled = enable;
    this.engine?.setEnabled(enable);
  }

  getEngine(): VoiceNoiseFilterEngine | undefined {
    return this.engine;
  }
}
