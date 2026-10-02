'use client';

import * as React from 'react';

export interface BrandLogoProps {
  size?: number;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

/**
 * Standardized, unified HireXt Meet brand logo and typography.
 * Uses the signature colorful camera logo.
 */
export function BrandLogo({
  size = 32,
  theme = 'auto',
  className = '',
}: BrandLogoProps) {
  return (
    <span className={`ail-brand-container ail-brand-theme--${theme} ${className}`.trim()}>
      <img
        src="/logo.png"
        alt="HireXt Logo"
        style={{ height: size, width: 'auto' }}
        className="object-contain select-none shrink-0"
      />
      <span className="ail-brand-text">
        mee<span className="ail-brand-highlight">X</span>t
      </span>
    </span>
  );
}
