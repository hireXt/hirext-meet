import React from 'react';

/**
 * Lazy E2EE setup. The worker is created ONLY when the caller passes an
 * explicit non-empty passphrase — never auto-read from location.hash in here.
 * The passphrase is used as-is (callers read location.hash themselves);
 * worker creation is lazy and the worker terminates in effect cleanup.
 * Worker-creation failure is surfaced via e2eeError.
 */
export function useSetupE2EE(passphrase?: string): {
  worker: Worker | undefined;
  e2eePassphrase: string | undefined;
  e2eeError: Error | null;
} {
  const activePassphrase = passphrase ? passphrase : undefined;
  const { worker, e2eeError } = React.useMemo(() => {
    if (!activePassphrase || typeof window === 'undefined') {
      return { worker: undefined as Worker | undefined, e2eeError: null as Error | null };
    }
    try {
      const created = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
      return { worker: created as Worker | undefined, e2eeError: null as Error | null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to create E2EE worker', error);
      return { worker: undefined as Worker | undefined, e2eeError: error as Error | null };
    }
  }, [activePassphrase]);

  React.useEffect(() => {
    return () => {
      worker?.terminate();
    };
  }, [worker]);

  return { worker, e2eePassphrase: activePassphrase, e2eeError };
}

