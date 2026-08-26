'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher(props: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className={props.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '3px',
        borderRadius: '999px',
        background: 'var(--lk-control-bg, rgba(0,0,0,0.4))',
        border: '1px solid var(--lk-border-color, rgba(255,255,255,0.15))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
        title="Dark theme"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: theme === 'dark' ? 'var(--lk-accent-bg, #1f8cf9)' : 'transparent',
          color: theme === 'dark' ? 'var(--lk-accent-fg, #fff)' : 'var(--lk-fg, #fff)',
          transition: 'background 0.2s ease, color 0.2s ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </button>
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
        title="Light theme"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: theme === 'light' ? 'var(--lk-accent-bg, #1f8cf9)' : 'transparent',
          color: theme === 'light' ? 'var(--lk-accent-fg, #fff)' : 'var(--lk-fg, #fff)',
          transition: 'background 0.2s ease, color 0.2s ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </button>
    </div>
  );
}