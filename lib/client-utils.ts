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
