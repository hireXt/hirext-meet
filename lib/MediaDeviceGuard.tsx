'use client';

import React from 'react';

export type MediaAvailability = {
  checking: boolean;
  hasCamera: boolean;
  hasMicrophone: boolean;
  permissionDenied: boolean;
};

function checkAvailability(): Promise<MediaAvailability> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return Promise.resolve({
      checking: false,
      hasCamera: true,
      hasMicrophone: true,
      permissionDenied: false,
    });
  }

  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) => {
      const hasCamera = devices.some((d) => d.kind === 'videoinput');
      const hasMicrophone = devices.some((d) => d.kind === 'audioinput');
      return {
        checking: false,
        hasCamera,
        hasMicrophone,
        permissionDenied: false,
      };
    })
    .catch((err: unknown) => {
      const name =
        err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      return {
        checking: false,
        hasCamera: false,
        hasMicrophone: false,
        permissionDenied: name === 'NotAllowedError' || name === 'PermissionDeniedError',
      };
    });
}

const style: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--lk-bg, #111)',
    padding: '1.5rem',
  },
  card: {
    maxWidth: '460px',
    width: '100%',
    textAlign: 'center',
    background: 'var(--lk-bg2, #1c1c1c)',
    border: '1px solid var(--lk-border-color, rgba(255,255,255,0.12))',
    borderRadius: '20px',
    padding: '2rem',
    boxShadow: 'var(--lk-box-shadow, 0 8px 32px rgba(0,0,0,0.3))',
  },
  icon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 1rem',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--lk-bg3, rgba(255,255,255,0.08))',
    fontSize: '28px',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem',
    color: 'var(--lk-fg, #fff)',
  },
  body: {
    fontSize: '0.95rem',
    lineHeight: 1.5,
    color: 'var(--lk-fg5, rgba(255,255,255,0.7))',
    margin: '0 0 1.25rem',
  },
  list: {
    textAlign: 'left',
    margin: '0 0 1.5rem',
    paddingLeft: '1.25rem',
    fontSize: '0.9rem',
    lineHeight: 1.7,
    color: 'var(--lk-fg5, rgba(255,255,255,0.7))',
  },
  row: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '0.6rem 1.25rem',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--lk-accent-bg, #0090ff)',
    color: 'var(--lk-accent-fg, #fff)',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '0.6rem 1.25rem',
    borderRadius: '10px',
    border: '1px solid var(--lk-border-color, rgba(255,255,255,0.25))',
    background: 'transparent',
    color: 'var(--lk-fg, #fff)',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

export function MediaDeviceGuard(props: {
  children: React.ReactNode;
  onContinueWithoutMedia: () => void;
}) {
  const [availability, setAvailability] = React.useState<MediaAvailability>({
    checking: true,
    hasCamera: true,
    hasMicrophone: true,
    permissionDenied: false,
  });

  const refresh = React.useCallback(() => {
    setAvailability((prev) => ({ ...prev, checking: true }));
    checkAvailability().then(setAvailability);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (availability.checking) {
    return (
      <div style={style.overlay}>
        <div style={style.card}>
          <div style={style.icon}>🎥</div>
          <h1 style={style.title}>Checking media devices…</h1>
          <p style={style.body}>Looking for your camera and microphone.</p>
        </div>
      </div>
    );
  }

  const missingCamera = !availability.hasCamera;
  const missingMicrophone = !availability.hasMicrophone;
  const showNotice = missingCamera || missingMicrophone;

  if (!showNotice) {
    return <>{props.children}</>;
  }

  return (
    <div style={style.overlay}>
      <div style={style.card}>
        <div style={style.icon}>🎥</div>
        <h1 style={style.title}>
          {missingCamera && missingMicrophone
            ? 'No camera or microphone found'
            : missingCamera
              ? 'No camera found'
              : 'No microphone found'}
        </h1>
        <p style={style.body}>
          {availability.permissionDenied
            ? 'Your browser has blocked access to your camera and/or microphone. Allow access in your browser settings and try again.'
            : `We couldn't detect ${missingCamera && missingMicrophone ? 'a camera or microphone' : missingCamera ? 'a camera' : 'a microphone'} on this device. You can still join to watch, share your screen, and chat.`}
        </p>
        <ul style={style.list}>
          <li>Check that a camera/microphone is connected and turned on.</li>
          <li>Make sure your browser has permission to use media devices.</li>
          <li>On a Mac mini, a webcam with a built-in mic is required.</li>
        </ul>
        <div style={style.row}>
          <button style={style.ghostBtn} onClick={refresh} disabled={availability.checking}>
            {availability.checking ? 'Checking…' : 'Retry'}
          </button>
          <button style={style.primaryBtn} onClick={props.onContinueWithoutMedia}>
            Continue without camera/mic
          </button>
        </div>
      </div>
    </div>
  );
}
