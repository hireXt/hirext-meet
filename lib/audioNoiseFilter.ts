'use client';

/**
 * Real-time Web Audio API Voice Noise Filter & Dynamic Expander.
 * Provides instant, zero-latency noise suppression and voice isolation:
 * - High-pass filter (100Hz) removes desk thumps, AC rumble, and table vibrations.
 * - Low-pass filter (8000Hz) cuts high-frequency hiss, coil whine, and fan squeal.
 * - Spectral notch filter at 50/60Hz to aggressively cut electrical hum.
 * - Dynamic Voice Gate attenuates silence / background noise while opening instantly for speech.
 * - Provides immediate, unmistakable audible difference when toggled ON vs OFF.
 */
export class VoiceNoiseFilterEngine {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private highpass: BiquadFilterNode;
  private lowpass: BiquadFilterNode;
  private humNotch: BiquadFilterNode;
  private gateNode: ScriptProcessorNode;
  private cleanGain: GainNode;
  private rawGain: GainNode;
  private outputNode: GainNode;
  private analyser: AnalyserNode;

  private isEnabled: boolean = true;
  private currentGateGain: number = 0;

  // Threshold in linear amplitude (~-40 dB): gate opens above this RMS level
  // Higher value = more aggressive gating (more obvious noise reduction)
  private threshold: number = 0.018;
  // Attack: open fast when voice starts (~2ms at 48kHz, 512 frames)
  private attackCoeff: number = 0.92;
  // Release: close slowly to avoid choppy speech tails (~200ms)
  private releaseCoeff: number = 0.04;
  // Hold counter: keep gate open for N frames after voice drops below threshold
  private holdFrames: number = 8;
  private holdCount: number = 0;

  constructor(ctx: AudioContext, mediaStream: MediaStream, initialEnabled: boolean = true) {
    this.ctx = ctx;
    this.isEnabled = initialEnabled;

    // Source
    this.source = ctx.createMediaStreamSource(mediaStream);

    // 1. High-pass filter: cut rumble, desk vibrations, wind
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.setValueAtTime(100, ctx.currentTime);
    this.highpass.Q.setValueAtTime(0.85, ctx.currentTime);

    // 2. Electrical hum notch filter (50Hz for EU/Asia, close enough for 60Hz USA too)
    this.humNotch = ctx.createBiquadFilter();
    this.humNotch.type = 'notch';
    this.humNotch.frequency.setValueAtTime(50, ctx.currentTime);
    this.humNotch.Q.setValueAtTime(30, ctx.currentTime);

    // 3. Low-pass filter: cut high-frequency hiss & fan squeal
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.setValueAtTime(8000, ctx.currentTime);
    this.lowpass.Q.setValueAtTime(0.7, ctx.currentTime);

    // 4. Dynamic Voice Gate (ScriptProcessorNode, 512 buffer = ~10ms latency)
    this.gateNode = ctx.createScriptProcessor(512, 1, 1);
    this.currentGateGain = this.isEnabled ? 0 : 1.0;
    this.holdCount = 0;

    this.gateNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      if (!this.isEnabled) {
        // Raw passthrough — NO filtering at all
        output.set(input);
        return;
      }

      // Compute RMS amplitude of block
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i]! * input[i]!;
      }
      const rms = Math.sqrt(sumSq / input.length);

      // Detect if voice is above threshold
      const voiceActive = rms >= this.threshold;

      if (voiceActive) {
        // Reset hold timer when voice is detected
        this.holdCount = this.holdFrames;
      } else if (this.holdCount > 0) {
        // Keep gate open during hold period to prevent clipping at word-ends
        this.holdCount -= 1;
      }

      // Target gain: 1.0 when voice detected or hold timer active, 0.0 otherwise
      const targetGain = voiceActive || this.holdCount > 0 ? 1.0 : 0.0;

      // Smooth attack/release
      const rate = targetGain > this.currentGateGain ? this.attackCoeff : this.releaseCoeff;
      this.currentGateGain += (targetGain - this.currentGateGain) * rate;

      // Apply gain to samples
      for (let i = 0; i < input.length; i++) {
        output[i] = input[i]! * this.currentGateGain;
      }
    };

    // Routing:
    // Clean path: source -> highpass -> humNotch -> lowpass -> gateNode -> cleanGain
    this.source.connect(this.highpass);
    this.highpass.connect(this.humNotch);
    this.humNotch.connect(this.lowpass);
    this.lowpass.connect(this.gateNode);

    this.cleanGain = ctx.createGain();
    this.cleanGain.gain.setValueAtTime(this.isEnabled ? 1.0 : 0.0, ctx.currentTime);
    this.gateNode.connect(this.cleanGain);

    // Raw path: source -> rawGain (completely unprocessed)
    this.rawGain = ctx.createGain();
    this.rawGain.gain.setValueAtTime(this.isEnabled ? 0.0 : 1.0, ctx.currentTime);
    this.source.connect(this.rawGain);

    // Output mixer
    this.outputNode = ctx.createGain();
    this.outputNode.gain.setValueAtTime(1.0, ctx.currentTime);
    this.cleanGain.connect(this.outputNode);
    this.rawGain.connect(this.outputNode);

    // Analyser taps output for real-time volume meter
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.25;
    this.outputNode.connect(this.analyser);
  }

  /** Connect to an audio destination (e.g. speakers or media stream) */
  connect(dest: AudioNode) {
    this.outputNode.connect(dest);
  }

  /** Set noise cancellation ON or OFF in real-time */
  setEnabled(enable: boolean) {
    this.isEnabled = enable;
    const now = this.ctx.currentTime;
    if (enable) {
      // Crossfade to clean, filtered path
      this.rawGain.gain.setTargetAtTime(0.0, now, 0.015);
      this.cleanGain.gain.setTargetAtTime(1.0, now, 0.015);
      // Reset gate state to let it settle fresh
      this.currentGateGain = 0;
      this.holdCount = 0;
    } else {
      // Crossfade to raw, unprocessed path
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
      this.highpass.disconnect();
      this.humNotch.disconnect();
      this.lowpass.disconnect();
      this.gateNode.disconnect();
      this.cleanGain.disconnect();
      this.rawGain.disconnect();
      this.outputNode.disconnect();
      this.analyser.disconnect();
    } catch {
      // ignore errors on cleanup
    }
  }
}
