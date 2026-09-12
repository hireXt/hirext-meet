'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { encodePassphrase, generateRoomId, randomString } from '@/lib/client-utils';
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GoogleMeetLogo,
  HelpCircleIcon,
  KeyboardIcon,
  LinkIcon,
  LogoMark,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  VideoPlusIcon,
} from '@/lib/ailink/icons';
import { BrandLogo } from '@/lib/ailink/BrandLogo';
import styles from '../styles/Home.module.css';

const CAROUSEL_SLIDES = [
  {
    title: 'Get a link you can share',
    description:
      'Click New meeting to get a link you can send to people you want to meet with.',
    accentBg: 'radial-gradient(circle, rgba(26,115,232,0.15) 0%, rgba(232,240,254,0.6) 100%)',
    icon: (
      <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 24px rgba(26,115,232,0.35)' }}>
          <VideoPlusIcon size={42} />
        </div>
        <div style={{ position: 'absolute', bottom: -4, right: -4, width: 34, height: 34, borderRadius: '50%', background: '#34a853', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: '3px solid #fff' }}>
          <LinkIcon size={16} />
        </div>
      </div>
    ),
  },
  {
    title: 'See everyone together',
    description:
      'Enjoy crystal-clear HD audio and video, adaptive streaming, and background noise cancellation.',
    accentBg: 'radial-gradient(circle, rgba(26,115,232,0.12) 0%, rgba(232,240,254,0.6) 100%)',
    icon: (
      <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #1a73e8, #4285f4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 24px rgba(26,115,232,0.35)' }}>
          <UsersIcon size={44} />
        </div>
        <div style={{ position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: '50%', background: '#34a853', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: '3px solid #fff' }}>
          <CameraIcon size={16} />
        </div>
      </div>
    ),
  },
  {
    title: 'Your meeting is safe & encrypted',
    description:
      'Enterprise-grade security with optional end-to-end encryption. No uninvited guests.',
    accentBg: 'radial-gradient(circle, rgba(52,168,83,0.15) 0%, rgba(230,244,234,0.6) 100%)',
    icon: (
      <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: '#34a853', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 24px rgba(52,168,83,0.35)' }}>
          <ShieldCheckIcon size={44} />
        </div>
        <div style={{ position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: '50%', background: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: '3px solid #fff' }}>
          <CameraIcon size={16} />
        </div>
      </div>
    ),
  },
];

function HomeLandingContent() {
  const router = useRouter();
  const [meetingInput, setMeetingInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Live time ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      setCurrentTime(`${timeStr} • ${dateStr}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Start instant meeting
  const startInstantMeeting = (withEncryption = false) => {
    setMenuOpen(false);
    const roomId = generateRoomId();
    if (withEncryption || e2ee) {
      const pass = sharedPassphrase.trim() || randomString(64);
      router.push(`/rooms/${roomId}#${encodePassphrase(pass)}`);
    } else {
      router.push(`/rooms/${roomId}`);
    }
  };

  // Create meeting for later
  const createMeetingForLater = () => {
    setMenuOpen(false);
    const roomId = generateRoomId();
    let url = `${window.location.origin}/rooms/${roomId}`;
    if (e2ee) {
      const pass = sharedPassphrase.trim() || randomString(64);
      url += `#${encodePassphrase(pass)}`;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(`Meeting link copied to clipboard!\n${url}`, { duration: 6000 }))
      .catch(() => toast.error('Could not copy link to clipboard'));
  };

  // Join meeting from code or link
  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = meetingInput.trim();
    if (!trimmed) return;

    // Handle full URL or room path
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const parsed = new URL(trimmed);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const roomName = pathParts[pathParts.length - 1];
        if (roomName) {
          router.push(`/rooms/${roomName}${parsed.hash}`);
          return;
        }
      }
    } catch {
      // Not a valid full URL, treat as room code
    }

    // Clean room code
    const cleanCode = trimmed.replace(/^.*\/rooms\//, '').trim();
    if (cleanCode) {
      router.push(`/rooms/${cleanCode}`);
    }
  };

  const nextSlide = () => {
    setCarouselIndex((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
  };

  const prevSlide = () => {
    setCarouselIndex((prev) => (prev - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length);
  };

  const activeSlide = CAROUSEL_SLIDES[carouselIndex];
  const canJoin = meetingInput.trim().length > 0;

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <header className={styles.navbar}>
        <Link href="/" className={styles.navBrand} title="meetXt Home">
          <BrandLogo theme="light" size={36} />
        </Link>
        <div className={styles.navRight}>
          {currentTime && <div className={styles.liveClock}>{currentTime}</div>}
          <button
            type="button"
            className={styles.navIconBtn}
            title="Help & Feedback"
            onClick={() => toast('meetXt: Premium real-time video meetings')}
          >
            <HelpCircleIcon size={20} />
          </button>
          <button
            type="button"
            className={styles.navIconBtn}
            title="Settings"
            onClick={() => setE2ee((v) => !v)}
          >
            <SettingsIcon size={20} />
          </button>
          <div className={styles.avatarPill} title="User Profile">
            HX
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className={styles.hero}>
        <div className={styles.heroGrid}>
          {/* Left Column: Actions */}
          <div className={styles.leftCol}>
            <h1 className={styles.headline}>
              Your next video meetings{' '}
            </h1>
            <p className={styles.subtitle}>
              We re-engineered meetXt for secure, crystal-clear real-time video meetings.
              Share the link and start collaborating with anyone, anywhere.
            </p>

            <div className={styles.actionRow}>
              {/* New Meeting Button + Dropdown */}
              <div className={styles.newMeetingWrapper} ref={menuRef}>
                <button
                  type="button"
                  className={styles.newMeetingBtn}
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <VideoPlusIcon size={20} />
                  <span>New meeting</span>
                </button>

                {menuOpen && (
                  <div className={styles.dropdownMenu} role="menu">
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={createMeetingForLater}
                      role="menuitem"
                    >
                      <LinkIcon size={18} />
                      <span>Create a meeting for later</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => startInstantMeeting(false)}
                      role="menuitem"
                    >
                      <VideoPlusIcon size={18} />
                      <span>Start an instant meeting</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => startInstantMeeting(true)}
                      role="menuitem"
                    >
                      <ShieldCheckIcon size={18} />
                      <span>Start encrypted meeting (E2EE)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Enter a Code / Link + Join Button Row */}
              <div className={styles.joinRow}>
                <form onSubmit={handleJoin} className={styles.joinInputGroup}>
                  <KeyboardIcon size={20} className={styles.inputIcon} />
                  <input
                    type="text"
                    placeholder="Enter a code or link"
                    className={styles.joinInput}
                    value={meetingInput}
                    onChange={(e) => setMeetingInput(e.target.value)}
                    aria-label="Enter meeting code or link"
                  />
                </form>

                <button
                  type="button"
                  className={`${styles.joinBtn} ${canJoin ? styles.joinBtnActive : styles.joinBtnDisabled}`}
                  disabled={!canJoin}
                  onClick={() => handleJoin()}
                >
                  Join
                </button>
              </div>
            </div>

            {/* E2EE and Security options */}
            <div className={styles.securityRow}>
              <label className={styles.e2eeToggle}>
                <input
                  type="checkbox"
                  checked={e2ee}
                  onChange={(e) => setE2ee(e.target.checked)}
                />
                <span>Enable end-to-end encryption by default</span>
              </label>
            </div>

            {e2ee && (
              <div style={{ marginTop: '12px', maxWidth: '460px' }}>
                <input
                  type="text"
                  placeholder="Optional custom passphrase (auto-generated if blank)"
                  value={sharedPassphrase}
                  onChange={(e) => setSharedPassphrase(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #dadce0',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            <hr className={styles.divider} />

            <div className={styles.learnMoreText}>
              <ShieldCheckIcon size={16} />
              <span>
                Your meetings are protected with real-time encryption.{' '}
                <a
                  href="https://livekit.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.learnMoreLink}
                >
                  Learn more about meetXt
                </a>
              </span>
            </div>
          </div>

          {/* Right Column: Google Meet Feature Carousel */}
          <div className={styles.rightCol}>
            <div className={styles.carouselCard}>
              <div
                className={styles.illustrationCircle}
                style={{ background: activeSlide.accentBg }}
              >
                {activeSlide.icon}
              </div>
              <h2 className={styles.carouselHeading}>{activeSlide.title}</h2>
              <p className={styles.carouselDesc}>{activeSlide.description}</p>
              <div className={styles.carouselControls}>
                <button
                  type="button"
                  className={styles.carouselNavBtn}
                  onClick={prevSlide}
                  title="Previous slide"
                  aria-label="Previous slide"
                >
                  <ChevronLeftIcon size={20} />
                </button>
                <div className={styles.dotsRow}>
                  {CAROUSEL_SLIDES.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`${styles.dot} ${idx === carouselIndex ? styles.dotActive : ''}`}
                      onClick={() => setCarouselIndex(idx)}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.carouselNavBtn}
                  onClick={nextSlide}
                  title="Next slide"
                  aria-label="Next slide"
                >
                  <ChevronRightIcon size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div>meetXt — Premium, secure video meetings</div>
        <div>Powered by LiveKit</div>
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Loading meetXt…</div>}>
      <HomeLandingContent />
    </Suspense>
  );
}