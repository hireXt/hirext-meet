'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const DEFAULT_THEME: Theme = 'light';
const STORAGE_KEY = 'hirext-meet-theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * Theme provider for the meeting app (D.6 fix — was a hard-coded light no-op).
 * Persists the choice in localStorage; falls back to the system preference;
 * applies `data-lk-theme` on <html> which globals.css keys off.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let initial: Theme = DEFAULT_THEME;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        initial = stored;
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initial = 'dark';
      }
    } catch {
      /* storage unavailable — keep default */
    }
    setThemeState(initial);
    document.documentElement.setAttribute('data-lk-theme', initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.setAttribute('data-lk-theme', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      document.documentElement.setAttribute('data-lk-theme', next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

