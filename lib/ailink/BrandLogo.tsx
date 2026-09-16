'use client';

import * as React from 'react';
import { GoogleMeetLogo } from './icons';

export interface BrandLogoProps {
  size?: number;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

/**
 * Standardized, unified HireXt Meet brand logo and typography.
 * Ensures consistent font family, size, weights, and Google Meet styling across all pages.
 */
export function BrandLogo({
  size = 36,
  theme = 'auto',
  className = '',
}: BrandLogoProps) {
  return (
    <span className={`ail-brand-container ail-brand-theme--${theme} ${className}`.trim()}>
      <GoogleMeetLogo size={size} />
      <span className="ail-brand-text">
        mee<span className="ail-brand-highlight">X</span>t
      </span>
    </span>
  );
}
