'use client';

import * as React from 'react';

export type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M18.5 11.5a6.5 6.5 0 0 1-13 0" />
      <path d="M12 18v3" />
    </Svg>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 9.34V6a3 3 0 0 0-5.94-.6" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M19 10v2a7 7 0 0 1-.11 1.23" />
      <path d="M12 19v3" />
      <path d="m4 4 16 16" />
    </Svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="6.25" width="12.5" height="11.5" rx="2.75" />
      <path d="m15.25 10.6 4.3-2.6a.6.6 0 0 1 .95.5v7a.6.6 0 0 1-.95.5l-4.3-2.6" />
    </Svg>
  );
}

export function CameraOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 10.6l4.3-2.6a.6.6 0 0 1 .95.5v7a.6.6 0 0 1-.95.5L16 13.4" />
      <path d="M15.5 13.5v1.75A2.75 2.75 0 0 1 12.75 18h-7A2.75 2.75 0 0 1 3 15.25V8.75c0-.9.43-1.7 1.1-2.2" />
      <path d="M9.5 6h3.25A2.75 2.75 0 0 1 15.5 8.75v1.4" />
      <path d="m3.5 3.5 17 17" />
    </Svg>
  );
}

export function ScreenShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="4.25" width="18.5" height="12.5" rx="2.25" />
      <path d="M12 14V8" />
      <path d="m9.25 10.25 2.75-2.5 2.75 2.5" />
      <path d="M8.5 20.25h7" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.36-4.14-1L3 21l1.55-4.85A8.5 8.5 0 1 1 21 12Z" />
      <path d="M8.75 10.5h6.5" />
      <path d="M8.75 13.75h4" />
    </Svg>
  );
}

export function RecordIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="3.75" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.25h8" />
      <circle cx="16" cy="7.25" r="2.5" />
      <path d="M19.5 7.25H20" />
      <path d="M20 16.75h-8" />
      <circle cx="8" cy="16.75" r="2.5" />
      <path d="M4.5 16.75H4" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2.25}>
      <circle cx="5" cy="12" r="0.5" fill="currentColor" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      <circle cx="19" cy="12" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.25" cy="8" r="3.25" />
      <path d="M3.5 19.25c.6-3 2.9-4.75 5.75-4.75s5.15 1.75 5.75 4.75" />
      <path d="M15.5 5.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M17.5 14.9c1.7.7 2.75 2.2 3 4.35" />
    </Svg>
  );
}

export function LayoutGridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.75" y="3.75" width="7" height="7" rx="1.75" />
      <rect x="13.25" y="3.75" width="7" height="7" rx="1.75" />
      <rect x="3.75" y="13.25" width="7" height="7" rx="1.75" />
      <rect x="13.25" y="13.25" width="7" height="7" rx="1.75" />
    </Svg>
  );
}

export function SpotlightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="2.25" />
      <path d="M2.75 15.25 8 10.5l4 3.5 3.5-3 5.75 4.75" />
    </Svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 5.75v5.5c0 4.3 2.9 7.45 7 8.75 4.1-1.3 7-4.45 7-8.75v-5.5L12 3Z" />
      <path d="m9.25 11.75 2 2 3.5-4" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </Svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m17.5 14.5-5.5-5.5-5.5 5.5" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.5H4.5V9" />
      <path d="M15 4.5h4.5V9" />
      <path d="M9 19.5H4.5V15" />
      <path d="M15 19.5h4.5V15" />
    </Svg>
  );
}

export function ShrinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 9H9V4.5" />
      <path d="M19.5 9H15V4.5" />
      <path d="M4.5 15H9v4.5" />
      <path d="M19.5 15H15v4.5" />
    </Svg>
  );
}

export function PhoneOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 13.4c1.27 1.27 2.77 2.28 4.06 2.44.62.08 1.23-.14 1.68-.59l.83-.83c.47-.47 1.22-.54 1.77-.16l2.03 1.36c.72.48.86 1.47.32 2.13l-.94 1.14c-.6.73-1.53 1.11-2.47.97-3.34-.49-6.63-2.2-9.26-4.84C6 12.4 4.3 9.1 3.8 5.76c-.14-.94.24-1.87.97-2.47l1.14-.94c.66-.54 1.65-.4 2.13.32l1.36 2.03c.38.55.31 1.3-.16 1.77l-.83.83c-.45.45-.67 1.06-.59 1.68.16 1.29 1.17 2.79 2.44 4.06Z" />
      <path d="m3.5 3.5 17 17" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2.25" />
      <path d="M5.5 14.5A2.5 2.5 0 0 1 4 12.17V6.5A2.5 2.5 0 0 1 6.5 4h5.67A2.5 2.5 0 0 1 14.5 5.5" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 21 20H3L12 4.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4h.01" />
    </Svg>
  );
}

export function VideoPlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="6.25" width="12.5" height="11.5" rx="2.75" />
      <path d="m15.25 10.6 4.3-2.6a.6.6 0 0 1 .95.5v7a.6.6 0 0 1-.95.5l-4.3-2.6" />
      <path d="M9 9.5v5" />
      <path d="M6.5 12h5" />
    </Svg>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M6 10h.01" />
      <path d="M10 10h.01" />
      <path d="M14 10h.01" />
      <path d="M18 10h.01" />
      <path d="M6 14h.01" />
      <path d="M18 14h.01" />
      <path d="M10 14h4" />
    </Svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Svg>
  );
}

export function HelpCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

const LOGO_ID = 'ail-logo-gradient';

/**
 * Google Meet authentic multi-color camera mark.
 * Vibrant Google palette: Red (#ea4335), Blue (#2684fc), Green (#00ac47), Yellow (#ffba00).
 * Fully transparent background, scales gracefully to any size on light or dark canvas.
 */
export function GoogleMeetLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M29 17.5v-4.2c0-1.55-1.25-2.8-2.8-2.8H8.8C7.25 10.5 6 11.75 6 13.3v21.4C6 36.25 7.25 37.5 8.8 37.5h17.4c1.55 0 2.8-1.25 2.8-2.8V30.5"
        fill="#00ac47"
      />
      <path
        d="M29 30.5l11.2 7.47c1.49 1 3.8-.07 3.8-1.87V11.9c0-1.8-2.31-2.87-3.8-1.87L29 17.5v13z"
        fill="#00832d"
      />
      <path
        d="M29 17.5l11.2-7.47c.63-.42 1.36-.54 2.03-.39L29 24.16V17.5z"
        fill="#ea4335"
      />
      <path
        d="M6 13.3c0-1.55 1.25-2.8 2.8-2.8h9L6 23.9v-10.6z"
        fill="#ffba00"
      />
      <path
        d="M6 26.9v7.8c0 1.55 1.25 2.8 2.8 2.8h17.4c1.55 0 2.8-1.25 2.8-2.8V26.9H6z"
        fill="#2684fc"
      />
    </svg>
  );
}

/** Unified alias: LogoMark renders the consistent GoogleMeetLogo */
export const LogoMark = GoogleMeetLogo;

export function HandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v7" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.9-2.26L3.5 17.14a1.5 1.5 0 0 1 .22-2.22 1.5 1.5 0 0 1 2.08.22L8 17" />
    </Svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 1.91 5.09L19 10l-5.09 1.91L12 17l-1.91-5.09L5 10l5.09-1.91L12 3Z" />
      <path d="M19 16l.96 2.04L22 19l-2.04.96L19 22l-.96-2.04L16 19l2.04-.96L19 16Z" />
    </Svg>
  );
}

export function HeadphonesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </Svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Svg>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Svg>
  );
}

/** Clarified alias for the HireXt-original mark — prefer this in new code. */
export const HireXtLogoMark = LogoMark;
