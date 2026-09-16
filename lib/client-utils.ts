export function encodePassphrase(passphrase: string) {
  return encodeURIComponent(passphrase);
}

export function decodePassphrase(base64String: string) {
  return decodeURIComponent(base64String);
}

export function generateRoomId(): string {
  return `${randomString(4)}-${randomString(4)}`;
}

export function randomString(length: number): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  // CSPRNG (E.7 fix) — Math.random is not cryptographically secure.
  // globalThis works in both browser and Node (SSR) runtimes.
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const bytes = new Uint32Array(length);
  cryptoObj.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(bytes[i] % charactersLength);
  }
  return result;
}

export function isLowPowerDevice() {
  return navigator.hardwareConcurrency < 6;
}

/**
 * Message the meet popup posts to its opener (the main web app) when an AI
 * interview finishes and the report should be shown in the main window instead
 * of the popup. The receiver validates the URL against its own origin.
 */
export const INTERVIEW_REPORT_MESSAGE = 'hxt-interview-concluded';

/**
 * Redirect to the post-interview report. When this meet runs in a popup
 * (opener present — the main app spawned it via window.open), the report opens
 * in the opener window and the popup closes itself; the two are cross-origin,
 * so navigation happens through a targeted postMessage. When there is no
 * opener (standalone tab), navigate this tab instead.
 */
export function redirectToInterviewReport(url: string) {
  const opener = typeof window !== 'undefined' ? window.opener : null;
  if (opener && !opener.closed) {
    try {
      opener.postMessage({ type: INTERVIEW_REPORT_MESSAGE, url }, '*');
      window.close();
      return;
    } catch {
      // Voided/cross-origin-opener failure — fall through to same-tab nav.
    }
  }
  window.location.replace(url);
}
