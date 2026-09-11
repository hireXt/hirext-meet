'use client';

/**
 * Plays a pleasant Google Meet style audio tone through the specified speaker device.
 * Routes audio via HTMLMediaElement.setSinkId and AudioContext.setSinkId so the sound
 * plays through the user's selected speaker (e.g. headphones, Bluetooth, external output)
 * rather than strictly the system default speaker.
 */
export async function playSpeakerTestSound(speakerDeviceId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);

    // If a specific speaker device ID is specified, route via MediaStreamDestination + HTMLMediaElement
    // which has wide support across Chromium (Chrome, Edge, Brave) and modern WebKit for setSinkId
    if (speakerDeviceId && speakerDeviceId !== 'default') {
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);

      const audio = new Audio();
      audio.srcObject = dest.stream;

      if (typeof (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
        try {
          await (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(speakerDeviceId);
        } catch (sinkErr) {
          console.warn('HTMLMediaElement.setSinkId warning:', sinkErr);
        }
      }

      if (typeof (ctx as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
        try {
          await (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(speakerDeviceId);
        } catch {}
      }

      await audio.play();
      osc.start();
      osc.stop(ctx.currentTime + 0.35);

      setTimeout(() => {
        audio.pause();
        audio.srcObject = null;
        ctx.close().catch(() => undefined);
      }, 450);
    } else {
      // Default system output
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 400);
    }
  } catch (err) {
    console.warn('Audio test playback warning:', err);
  }
}
