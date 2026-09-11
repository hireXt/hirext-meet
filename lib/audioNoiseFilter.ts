'use client';

/**
 * Real-time Web Audio API Voice Noise Filter & Dynamic Expander.
 * Provides instant, zero-latency noise suppression and voice isolation:
 * - High-pass filter (85Hz) removes desk thumps, AC rumble, and table vibrations.
 * - Low-pass filter (7500Hz) cuts high-frequency hiss, coil whine, and fan squeal.
 * - Dynamic Voice Gate smoothly attenuates silence / background noise (fan hum, room hiss, keyboard clicks)
 *   while opening instantly for speech.
 * - Provides immediate, unmistakable audible difference when toggled ON vs OFF.
 */
export class VoiceNoiseFilterEngine {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private highpass: BiquadFilterNode;
  private lowpass: BiquadFilterNode;
  private gateNode: ScriptProcessorNode;
  private cleanGain: GainNode;
  private rawGain: GainNode;
  private outputNode: GainNode;
  private analyser: AnalyserNode;

  private isEnabled: boolean = true;
  private currentGateGain: number = 0;
  // Threshold in linear amplitude (~-38 dB)
  private threshold: number = 0.012;
  // Fast attack (~4ms), smooth release (~120ms)
  private attackCoeff: number = 0.85;
  private releaseCoeff: number = 0.08;

  constructor(ctx: AudioContext, mediaStream: MediaStream, initialEnabled: boolean = true) {
    this.ctx = ctx;
    this.isEnabled = initialEnabled;

    // Source
    this.source = ctx.createMediaStreamSource(mediaStream);

    // 1. High-pass filter for rumble & vibrations
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.setValueAtTime(85, ctx.currentTime);
    this.highpass.Q.setValueAtTime(0.7, ctx.currentTime);

    // 2. Low-pass filter for hiss & squeal
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.setValueAtTime(7500, ctx.currentTime);
    this.lowpass.Q.setValueAtTime(0.7, ctx.currentTime);

    // 3. Dynamic Voice Gate (ScriptProcessorNode, 512 buffer = ~10ms latency)
    this.gateNode = ctx.createScriptProcessor(512, 1, 1);
    this.currentGateGain = this.isEnabled ? 0 : 1.0;

    this.gateNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      if (!this.isEnabled) {
        // Raw passthrough
        output.set(input);
        return;
      }

      // Compute RMS amplitude of block
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSq / input.length);

      // Target gain: open (1.0) when above threshold, mute (0.0) when below
      const targetGain = rms >= this.threshold ? 1.0 : 0.0;

      // Smooth attack / release
      const rate = targetGain > this.currentGateGain ? this.attackCoeff : this.releaseCoeff;
      this.currentGateGain += (targetGain - this.currentGateGain) * rate;

      // Apply gain to samples
      for (let i = 0; i < input.length; i++) {
        output[i] = input[i] * this.currentGateGain;
      }
    };

    // Routing:
    // Clean path: source -> highpass -> lowpass -> gateNode -> cleanGain
    this.source.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.gateNode);

    this.cleanGain = ctx.createGain();
    this.cleanGain.gain.setValueAtTime(this.isEnabled ? 1.0 : 0.0, ctx.currentTime);
    this.gateNode.connect(this.cleanGain);

    // Raw path: source -> rawGain
    this.rawGain = ctx.createGain();
    this.rawGain.gain.setValueAtTime(this.isEnabled ? 0.0 : 1.0, ctx.currentTime);
    this.source.connect(this.rawGain);

    // Output node
    this.outputNode = ctx.createGain();
    this.outputNode.gain.setValueAtTime(1.0, ctx.currentTime);
    this.cleanGain.connect(this.outputNode);
    this.rawGain.connect(this.outputNode);

    // Analyser for real-time visual meter
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
      // Smooth crossfade to clean path
      this.rawGain.gain.setTargetAtTime(0.0, now, 0.02);
      this.cleanGain.gain.setTargetAtTime(1.0, now, 0.02);
    } else {
      // Smooth crossfade to raw path
      this.cleanGain.gain.setTargetAtTime(0.0, now, 0.02);
      this.rawGain.gain.setTargetAtTime(1.0, now, 0.02);
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
      this.lowpass.disconnect();
      this.gateNode.disconnect();
      this.cleanGain.disconnect();
      this.rawGain.disconnect();
      this.outputNode.disconnect();
      this.analyser.disconnect();
    } catch {}
  }
}
