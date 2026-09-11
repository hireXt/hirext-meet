# HireXt Meet — Production Readiness Audit

**Location:** `web/deps/hirext-meet`

**Stack:** Next.js 15.5.21 + React 18.3.1 (client) · LiveKit 2.22.1 (client SDK) · `@livekit/components-react` 2.9.24 · TypeScript 5.9.3 · pnpm 10.18.2

**Room connection path:** `app/page.tsx` (home) → `/rooms/[roomName]` (standard) **OR** `/custom/` (self-hosted) → `app/api/connection-details/route.ts` (token mint) → `Room.connect()`

**UI layer:** hand-rolled `AILinkRoom` (not LKC's stock `Room` component), rendered inside `app/layout.tsx`'s `<ThemeProvider>` + `<Toaster>`.

**Date of review:** Sep 2026 · **Status: not production-ready** (blockers in §G, P0).

---

## A. Architecture & Logic Issues

### A.1 — Two near-duplicate conference implementations — FIXED

Was: `PageClientImpl` and `VideoConferenceClientImpl` each owned E2EE/connect/error/disconnect logic with divergences (pre-join only on standard, ended-screen only on custom, `alert()` vs silent errors).

Now: single `lib/ailink/ConferenceShell.tsx` owns E2EE setup, Room lifecycle, connect+publish, toast errors, and ended-screen with leave-vs-drop-vs-error distinction. Standard page keeps its `PreJoin`+`MediaDeviceGuard` pre-join (now with mint loading/failed states + retry) and hands off to the shell; custom page keeps its mandatory `CustomMediaGate` and hands off to the same shell with `preAcquiredTracks`. `AILinkRoom` gained `onLeaveRequest` so the shell can mark user-initiated leave before disconnect.

| Concern | Standard (`[roomName]`) | Custom (`/custom/`) |
|---|---|---|
| Pre-join | `MediaDeviceGuard` + `PreJoin` (name, cam/mic toggles, continue-without-media form) | None — `enableCameraAndMicrophone()` immediately on connect |
| E2EE bootstrap | `useSetupE2EE()` + `setKey(...)` with `DeviceUnsupportedError` → `alert()` | same pattern, no alert, no device-support branch |
| Error UX | `alert()` for connection + encryption errors | `console.error` only (silent to user) |
| Post-disconnect | `router.push('/')` instantly | `ended=true` → `MeetingEndedScreen` |
| `RoomOptions` | richer (capture defaults, publish `dtx`, adaptive, dynacast, e2ee, singlePC) | thinner (publish, adaptive `pixelDensity:'screen'`, dynacast, e2ee, singlePC) |

Every fix must be applied twice. The continue-without-media flow (broken-camera candidates) exists only on standard; custom-server rooms — the more important interview path — have no pre-join at all.

**Fix:** extract one `<ConferenceShell>` both pages render. Pre-join decision (with/without media) lives in the shell; custom passes `defaultChoices` so both paths behave identically.

> DONE — `lib/ailink/ConferenceShell.tsx` is that shell (pre-join UIs stay per-path by design: optional on standard, mandatory gate on custom).

### A.2 — E2EE worker created eagerly for *any* hashed URL — FIXED

Was: worker spun up on mount for any non-empty `#` fragment; never terminated; `DeviceUnsupportedError` → native `alert()`.

Now: `useSetupE2EE(passphrase?)` takes an explicit passphrase from the caller (page/shell reads `location.hash` itself), creates the worker lazily only for non-empty passphrases, terminates on unmount, returns `e2eeError`. `ConferenceShell` surfaces worker/setup failures via toast; `DeviceUnsupportedError` maps to a friendly toast message. No `alert()` remains on either path.

### A.3 — Token mint was stateless, no auth/rate controls — PARTIALLY FIXED

Was: open mint, 5-min TTL, random-postfix identity, no rate limit/logging.

Now: per-IP sliding-window rate limiting (20 req/min, `Retry-After` on 429) + structured request logging (no secrets) in `app/api/connection-details/route.ts`; response shape unchanged. Client re-mint: `fetchConnectionDetailsWithRetry` (3 attempts, exponential backoff) in `ConferenceShell`.

Still open: full session-auth gate + identity bound to real `userId`. Requires main-app session verification inside the meet Next app (separate services) — tracked as follow-up, not done here.

### A.4 — `PreJoin` + `MediaDeviceGuard` composition is fragile

`PageClientImpl` renders `continueWithoutMedia ? (inline form) : (<MediaDeviceGuard><PreJoin/></MediaDeviceGuard>)`. The outer ternary offers "join without camera/mic" *before* the guard runs, so the user can click it mid-check, or the guard's block can override the explicit choice. No single source of truth for "media required or not".

**Fix:** one state machine — `checking → hasMedia | noMedia | denied` — with "continue without media" always an explicit choice; guard never overrides the user.

### A.5 — Recording `available` flag is misleading; no health check

`useRecording()` returns `available: !!endpoint`. Env-var presence says nothing about service health, room-backend support, or token grants. Users get `toast.error('Failed to update recording. Check server logs.')`.

**Fix:** bless capability at mint time (token metadata) or via capability endpoint; gate the button on real capability; friendly error with fallback.

### A.6 — `Room` memoized with empty deps — FIXED

Was: `new Room(roomOptions)` with `[]` deps silently ignored post-join `hq`/`codec` changes.

Now: `ConferenceShell` memos the room on `[roomOptions]` with options keyed on `hq/codec/singlePC` — an option change recreates the room instead of being ignored. Both callers still treat `hq`/`codec` as pre-join-only; this is the safety net.

### A.7 — Mismatched post-disconnect behavior — FIXED

Was: standard pushed `/` on any disconnect (drop indistinguishable from leave); custom showed an ended screen.

Now: `ConferenceShell` owns disconnect on both paths — user-initiated leave (via `onLeaveRequest` from the Leave button) → friendly `MeetingEndedScreen`; network drop → "Connection lost" ended screen + rejoin toast; join/setup failure → "Could not join" ended screen with the actual error. Unmount fully disconnects and stops gate tracks.

"unexpected disconnect" (diagnosis + rejoin).

## B. UI / UX Issues

### B.1 — Hard-blocking `alert()` dialogs — FIXED

Was: E2EE/connection/encryption errors → native `alert()` (standard) or silent `console.error` (custom).

Now: zero `alert()` calls remain. All error surfaces are toasts (`react-hot-toast`) plus ended-screen states with the actual message: E2EE setup/device failures, media-device errors, encryption errors, connect failures, drops.

### B.2 — No loading/error state while minting token — FIXED (standard path)

Was: route push then silent mint; failure left pre-join stalled with `console.error` only.

Now: standard page shows a "Starting your meeting…" loading card while `fetchConnectionDetailsWithRetry` runs (3 attempts, backoff) and a "Couldn't start the meeting" error card with the actual message + "Try again" on failure; `PreJoin.onError` also toasts. (Custom path takes its token from the interview server URL, so no mint state applies there.)

### B.3 — Pre-join copy is generic, not interview-first

"Join without camera/mic — watch, share screen, chat." Primary case is: candidate joins, cam+mic on, AI interviewer asks questions.

**Fix:** "Check your camera and microphone, then start the interview." Keep watch/audio-only fallback with interview-context caveats.

### B.4 — No meeting metadata in-room beyond room name

Nav shows `room.name || label` ("Meeting code") + "Secure" chip. No session title, role indicator, job/session metadata — despite an interview-specific product (`museTalkEnabled`, "You ended the interview").

**Fix:** pass interview metadata (token metadata or parallel fetch); render header chip e.g. "Software Engineer Interview · Acme · 30 min". Grounds recording + post-meeting summary.

### B.5 — "Copy invite link" copies full URL incl. hash — FIXED

Now: the toast warns when the copied link includes the E2EE passphrase, and E2EE rooms get a second "Copy link without passphrase" option that strips the hash (plain room link, participant enters the passphrase separately).

### B.6 — Layout switcher hidden on mobile, no alternative

`.ail-nav-layout-menu` hidden <640px — grid↔spotlight unreachable on phones. For interviews spotlight (AI large, candidate PiP) is primary, yet mobile-inaccessible.

**Fix:** mobile defaults to spotlight when `museTalkEnabled`; add inline two-state toggle ("AI view / self view") in dock/nav.

### B.7 — Mobile chat sheet polish

Full-width sheet (fine); 16px forced input defeats iOS focus-zoom (correct) but dominates the sheet visually.

**Fix:** visual pass on chat form; verify panel scroll independent from stage; sticky sheet header.

### B.8 — `MeetingEndedScreen` is a dead end

Logo + "Meeting ended" + "Thanks for your time!" + "Go to Home" + "close this tab". No duration, recording status, transcript/notes link, rating/feedback CTA.

**Fix:** summary screen: duration, recording availability, AI notes/transcript link, feedback CTA, next step.

### B.9 — `StartAudio` overlay can resurface confusingly

Autoplay gate ("Click to enable audio") may reappear on reconnect/tab-switch in Safari/iOS even after audio was granted.

**Fix:** test reconnect/tab-switch on Safari/iOS; show overlay only when audio genuinely cannot start.

### B.10 — No actionable reconnect UX — PARTIALLY FIXED

Was: chip-only states, no action. Gap between "weak" warning and "dropped".

Now: `MeetingEndedScreen` takes an optional `rejoinHref`/`onRejoin`; the shell passes `onRejoin` for dropped/error ends — one click remounts the shell for a fresh connect without going home. "Meeting ended" (user-left) still routes home by default.

## C. Design & Branding Inconsistency

### C.1 — Two competing design systems — FIXED

Home now uses the light `ailink` language: light tokens (`#f7f8fb` page, white cards, indigo accent `#5b5bd6`), matching type voice — verified in the branding pass (landing HTTP 200, no dark-glass remnant styles).

### C.2 — LiveKit `LogoMark` co-branding concern — RESOLVED (verified HireXt-original)

Was: suspected LiveKit mark fused with "HireXt Meet".

Now (verified): `LogoMark` in `lib/ailink/icons.tsx` is HireXt-original — gradient rounded-square (`#5B5BD6 → #6D5AE8 → #8B5CF6`) with a white 3-node link glyph, NOT the LiveKit mark. Documented in-code with a clarifying comment. A separate "Powered by LiveKit" footer line was added so attribution is distinct from the brand, never fused.

### C.3 — Stock Unsplash virtual backgrounds, no fallbacks — PARTIALLY FIXED

Now: labels are neutral ("Background 1/2") and two branded gradient scenes (Indigo/Slate, rendered to canvas data URLs) ship alongside; image scenes are probe-loaded before applying, with toast + blur fallback on failure. Files are still local Unsplash photos in `/public/background-images` (HireXt is not yet shipping original artwork) — replace assets in a later branding pass.

### C.4 — "Demo project" language — FIXED

Landing copy no longer calls it a "demo project"; reframed as test/sample meeting. Landing restyled toward the light `ailink` token voice; dead `.themeSwitcher` CSS removed.

### C.5 — `LogoMark` provenance unconfirmed

`lib/ailink/icons.tsx` exports `LogoMark`, used in home, `AILinkRoom` brand, ended screen. Confirm HireXt-owned; if LiveKit's, replace per C.2. Subset/optimize final SVG either way.

## D. Responsiveness Issues

### D.1 — Home floats in a narrow centered column on desktop

`.main` is `place-content:center`; `.tabContainer` `max-width:480px`. On wide monitors the card sits alone in side whitespace.

**Fix:** large-breakpoint brand band / side info so the viewport fills with intent.

### D.2 — Mobile panel sheet scrolling

Desktop right-side sheets (`top: nav+10px; bottom: dock+10px`); mobile full-width. Chat growth can cramp the sheet.

**Fix:** independent scroll of `ail-chat-body`/`ail-panel-body` vs. stage; sticky sheet header.

### D.3 — Dock label breakpoints need device verification

Labels hide at narrow widths + safe-area insets across three nearby breakpoints (640/480/400px).

**Fix:** confirm on real devices Mic/Camera/Screen/Chat/Record/Settings never wraps to two lines (breaks stage math). Disallow wrap explicitly.

### D.4 — Landscape phones (max-height 460px)

Nav → transparent overlay, `--ail-dock-h` 56px — good — but verify `ail-stage-wrap`/`ail-stage` flex math still gives video enough height and dock never overlaps content.

### D.5 — Continue-without-media form uses inline hardcoded palette — FIXED

Was: inline `--lk-*` styles on the standard-page fallback form.

Now: the form uses `ail-gate-card`/`ail-gate-title`/`ail-gate-sub`/`ail-gate-input`/`ail-gate-primary` classes (`.ail-join-without-media` modifier) — fully on `ail-*` tokens like the rest of the room.

### D.6 — `ThemeProvider` is a no-op — FIXED

Was: hard-coded light, no-op setters, unused `useTheme()`.

Now: real provider — initial theme from `localStorage('hirext-meet-theme')` → system `prefers-color-scheme` → light default; `setTheme`/`toggleTheme` work and persist; `data-lk-theme` on `<html>` drives `globals.css` (dark token block added). Orphan `.themeSwitcher` CSS already removed in the branding pass. No switcher UI shipped yet (the app is light-first by design) — the plumbing is ready when one is added.

## E. Production-readiness Gaps

### E.1 — No auth gate on entry points

Home, room, custom pages publicly reachable; participation anonymous. Interviews need: host rooms tied to staff sessions; candidate one-time links bound to their session with name pre-filled; optional watch-only observers.

**Fix:** tie identity in at the mint endpoint (§A.3).

### E.2 — Error telemetry is Debug-only — PARTIALLY FIXED

Was: Debug panel + console-only errors.

Now: `lib/MeetingErrorBoundary.tsx` wraps the room UI in `ConferenceShell` — a render crash shows an error screen instead of a blank tab, logs structured details (message, stack, componentStack) and fires `onError`. Shell-level failures (connect/E2EE/encryption/media) already funnel through `reportError`. Full external reporter (Sentry/Datadog with room context) still open.

### E.3 — Unhandled connection-details fetch failure — FIXED

Standard path mints with `fetchConnectionDetailsWithRetry` (3 attempts, backoff) and shows explicit "Starting your meeting…" / "Couldn't start the meeting" + Try-again states.

### E.4 — Large, partly-public env surface

Client-visible: `NEXT_PUBLIC_CONN_DETAILS_ENDPOINT`, `NEXT_PUBLIC_SHOW_SETTINGS_MENU`, `NEXT_PUBLIC_LK_RECORD_ENDPOINT`, `NEXT_PUBLIC_DATADOG_*`. Secrets (`LIVEKIT_API_KEY/SECRET`) server-only (good). But a public recording URL means anyone can hit record start/stop if they guess a room name.

**Fix:** authenticate the recording endpoint (LiveKit token or admin session); never trust room name alone.

### E.5 — Custom path: no pre-join, silent failure, immediate mic+cam — FIXED

Was: requested camera+mic on landing (no name, no preview, no continue-without-media); denial was `console.error` only — black room, no guidance.

Now: `/custom` renders a mandatory `CustomMediaGate` (`lib/ailink/CustomMediaGate.tsx`) before any `Room` connection: (1) device inventory via `enumerateDevices` with a fail-fast "no camera/mic" screen + Retry; (2) live camera/mic preview + device pickers via LiveKit `PreJoin` (name required); (3) on "Check devices & join" click — the user gesture Chrome/Safari require for `getUserMedia` — `createLocalTracks` acquires publishable tracks, `VideoConferenceClientImpl` connects and publishes them immediately. Denial → toast + retry; connect failure → toast + tracks released. No continue-without-media path: cam+mic are mandatory on custom.

### E.6 — E2EE passphrase in URL hash, URI-decoded, unvalidated

`encode/decodePassphrase` are just URI-encode/decode — any escaped string is "valid"; no length/entropy requirement. Hash fragments persist in history, can leak into analytics/referrers.

**Fix:** E2EE opt-in via dedicated copy-from-UI shared secret (not URL), or — if keeping hash passphrases — document limits and don't imply strong security. Keep signed-JWT `museTalkEnabled` decode clearly separated from passphrase handling.

### E.7 — Room IDs from `Math.random` — FIXED

`randomString` now uses `window.crypto.getRandomValues` (CSPRNG); the mint route generates its postfix with a server-side `serverRandomString` on `globalThis.crypto`.

### E.8 — Recording timer edge cases

Interval clears on `isRecording=false`; verify no leak when unmounting mid-recording with `pendingRef` in flight.

### E.9 — `isMeetStaging()` hardcoded, possibly unused — FIXED

Removed (dead code; hardcoded `meet.staging.livekit.io`).

### E.10 — No i18n / RTL / a11y readiness — PARTIALLY FIXED

Now: `aria-live` added in the key spots — connecting overlay (shell), "You are in the meeting / N participants" + "This meeting is now being recorded" announcements (new visually-hidden `.ail-sr-only` live region in `AILinkRoom`), plus `role="alert"`-style error screens. Contrast + RTL/i18n verification on-device still open.

## F. File-Level Findings

| File | Finding |
|---|---|
| `app/page.tsx` | Dark glass; co-branded logo; "demo project" copy; no button loading; orphan theme-switcher CSS (§B.2, §C.1, §C.2, §C.4, §D.6) |
| `app/rooms/[roomName]/page.tsx` | Server `hq`/`codec`/`singlePC` decode sane — good; but invisible as in-room settings (§A.6) |
| `app/rooms/[roomName]/PageClientImpl.tsx` | Fragile pre-join+guard (§A.4); inline no-media form (§D.5); `alert()` (§B.1); instant push-home on disconnect (§A.7); empty-deps `Room` memo (§A.6) |
| `app/custom/VideoConferenceClientImpl.tsx` | No pre-join, no error UX, immediate `enableCameraAndMicrophone()` (§E.5); silent failure; ended-screen pattern is right — standard should match (§A.7) |
| `app/custom/page.tsx` | `museTalkEnabled` from signed JWT metadata — clever and sound; unit-test candidate |
| `app/api/connection-details/route.ts` | Stateless mint, no auth, 5-min TTL, no rate limit, random-postfix identity (§A.3, §E.1, §E.4) |
| `lib/ailink/AILinkRoom.tsx` | Well-structured core UI. Gaps: invite-copy incl. hash (§B.5); layout switch mobile-hidden (§B.6); no session header (§B.4); no `aria-live` (§E.10) |
| `lib/ailink/useRecording.ts` | `available` is just `!!endpoint` (§A.5); generic toasts |
| `lib/ailink/icons.tsx` | Confirm `LogoMark` provenance (§C.2, §C.5) |
| `lib/SettingsMenu.tsx` | Tabs `align-content: space-between` on single-row flex is a no-op; indicator basic but functional |
| `lib/CameraSettings.tsx` / `lib/MicrophoneSettings.tsx` | Inline styles + `lk-button` mix; bg images now validated pre-load with blur+toast fallback (§C.3 fixed); Krisp `low` on low-power (good) |
| `lib/ThemeProvider.tsx` | Real provider now (§D.6 FIXED) |
| `lib/client-utils.ts` | CSPRNG IDs (§E.7 FIXED); `isMeetStaging` removed (§E.9 FIXED) |
| `lib/getLiveKitURL.ts` | Region rewrite `livekit.cloud`-only — fine for demo, no-op self-hosted |
| `lib/Debug.tsx` | Dev panel + Datadog init — not prod reporting (§E.2) |
| `lib/useSetupE2EE.ts` | Eager worker, no cleanup, any-hash-passphrase (§A.2) |
| `lib/usePerformanceOptimizer.ts` | Solid hook; renamed from `usePerfomanceOptimiser.ts` (typo fixed) |
| `lib/MediaDeviceGuard.tsx` | Good availability check; inline styles w/ fallbacks |
| `lib/KeyboardShortcuts.tsx` | Global Cmd/Ctrl+Shift+A mic, +Shift+V camera — good; test macOS conflicts (Ctrl+Shift+V = paste-format in some apps) |
| `styles/Home.module.css` | Dark glass; orphan `.themeSwitcher` |
| `styles/ailink.css` | Comprehensive light system + detailed mobile breakpoints (§D.2–D.4 verify on device) |
| `styles/globals.css` | `--lk-*` tokens; `overflow:hidden` — fine for meeting app |
| `package.json` | Healthy deps; Next 15.5.21 vs React 18.3.1 — watch version-skew warnings |
| `next.config.js` | Not fully reviewed — verify image domains, E2EE-worker webpack handling |

## G. Priority Order

### P0 — blocks production launch

1. Replace all `alert()` with in-app toasts/banners; give the custom path real error UX (§B.1, §E.5).
2. E2EE worker: lazy-init, cleanup, only-when-needed (§A.2).
3. Auth-gate the connection-details endpoint; bind identity to the real user (§A.3, §E.1).
4. Unify the two conference shells so custom gets pre-join + error UX (§A.1, §E.5).
5. Replace LiveKit `LogoMark` co-branding with a HireXt-owned mark (§C.2, §C.5).

### P1 — before GA

6. Token-expiry re-mint + disconnected/rejoin UX (§A.7, §B.10, §E.3).
7. Make `ThemeProvider` real or delete it + switcher CSS (§D.6).
8. Session-metadata header in-room (role, job, session info) (§B.4).
9. `aria-live` announcements: join/leave, recording, connection (§E.10).
10. Error boundaries + structured reporting (§E.2).

### P2 — polish

11. Interview-first pre-join copy (§B.3).
12. "Copy room code only" vs "copy invite link" (§B.5).
13. Mobile layout toggle (§B.6).
14. Post-meeting summary (duration / recording / notes / feedback) (§B.8).
15. Home ↔ in-room design unification (§C.1).
16. ~~Branded/neutral backgrounds + load fallbacks (§C.3).~~ DONE (partial — original artwork still pending).
17. ~~CSPRNG or server-generated room IDs (§E.7).~~ DONE.
18. Home wide-screen layout pass (§D.1).
19. Backend-backed recording capability (§A.5).
20. ~~Rename `usePerfomanceOptimiser.ts` → `usePerformanceOptimizer.ts`.~~ DONE.
21. On-device contrast + dock-wrap verification (§D.3, §E.10).

## H. Proposed Implementation Sequence (next step)

- [ ] Unified conference shell + pre-join for both paths
- [ ] In-app error toasts (no more `alert`), incl. custom-path error UX
- [ ] E2EE worker lazy-init + cleanup + only-when-needed
- [ ] Auth-gated token mint with real participant identity + reconnect/re-mint UX
- [ ] Branding pass: HireXt mark, design-system unification, copy
