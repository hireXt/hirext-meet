# HireXt Meet — Production Readiness Audit

**Location:** `web/deps/hirext-meet`

**Stack:** Next.js 15.5.21 + React 18.3.1 (client) · LiveKit 2.22.1 (client SDK) · `@livekit/components-react` 2.9.24 · TypeScript 5.9.3 · pnpm 10.18.2

**Room connection path:** `app/page.tsx` (home) → `/rooms/[roomName]` (standard) **OR** `/custom/` (self-hosted) → `app/api/connection-details/route.ts` (token mint) → `Room.connect()`

**UI layer:** hand-rolled `AILinkRoom` (not LKC's stock `Room` component), rendered inside `app/layout.tsx`'s `<ThemeProvider>` + `<Toaster>`.

**Date of review:** Sep 2026 · **Status: not production-ready** (blockers in §G, P0).

---

## A. Architecture & Logic Issues

### A.1 — Two near-duplicate conference implementations

`app/rooms/[roomName]/PageClientImpl.tsx` and `app/custom/VideoConferenceClientImpl.tsx` implement the same meeting shell with divergences:

| Concern | Standard (`[roomName]`) | Custom (`/custom/`) |
|---|---|---|
| Pre-join | `MediaDeviceGuard` + `PreJoin` (name, cam/mic toggles, continue-without-media form) | None — `enableCameraAndMicrophone()` immediately on connect |
| E2EE bootstrap | `useSetupE2EE()` + `setKey(...)` with `DeviceUnsupportedError` → `alert()` | same pattern, no alert, no device-support branch |
| Error UX | `alert()` for connection + encryption errors | `console.error` only (silent to user) |
| Post-disconnect | `router.push('/')` instantly | `ended=true` → `MeetingEndedScreen` |
| `RoomOptions` | richer (capture defaults, publish `dtx`, adaptive, dynacast, e2ee, singlePC) | thinner (publish, adaptive `pixelDensity:'screen'`, dynacast, e2ee, singlePC) |

Every fix must be applied twice. The continue-without-media flow (broken-camera candidates) exists only on standard; custom-server rooms — the more important interview path — have no pre-join at all.

**Fix:** extract one `<ConferenceShell>` both pages render. Pre-join decision (with/without media) lives in the shell; custom passes `defaultChoices` so both paths behave identically.

### A.2 — E2EE worker created eagerly for *any* hashed URL

`useSetupE2EE()` spins a SHA-256 WebWorker on mount whenever the URL has *any* non-empty `#` fragment — `decodePassphrase` is just `decodeURIComponent`, so `#hello` counts as a "passphrase" and triggers worker creation + `setKey()`. The worker is **never terminated** (leak per tab). `setKey()` on a non-E2EE room is a no-op at best, throws on garbage input at worst. The `DeviceUnsupportedError` branch fires a hard-blocking native `alert()`.

**Fix:** (1) create worker + `setKey` only when token metadata asserts E2EE; (2) terminate worker in `useEffect` cleanup; (3) replace `alert()` with in-UI toasts (`react-hot-toast` is already a dep — use it).

### A.3 — Token mint is stateless, 5-min TTL, no auth/rate controls

`app/api/connection-details/route.ts` accepts `roomName` + `participantName` as plain query params from **any caller**, mints `AccessToken` with `ttl='5m'`, `canPublish/canPublishData/canSubscribe: true`, and stores a random 4-char postfix in a 2h cookie — not bound to a real identity. No rate limiting, no auth, no join gating, no participant limits. `region` rewrites hostname for `livekit.cloud` only (silently ignored self-hosted).

**Impact:** anyone reaching the endpoint mints tokens for any room; >5 min load-to-join = stale token with **no client re-mint** on 401/403; every role (even watch-only) gets `canPublish: true`.

**Fix:** gate behind HireXt session; bind identity to authenticated `userId`/profile; per-room/per-user rate limits; client re-mint path with "rejoining…" UX; `canPublish:false` for watch-only roles.

### A.4 — `PreJoin` + `MediaDeviceGuard` composition is fragile

`PageClientImpl` renders `continueWithoutMedia ? (inline form) : (<MediaDeviceGuard><PreJoin/></MediaDeviceGuard>)`. The outer ternary offers "join without camera/mic" *before* the guard runs, so the user can click it mid-check, or the guard's block can override the explicit choice. No single source of truth for "media required or not".

**Fix:** one state machine — `checking → hasMedia | noMedia | denied` — with "continue without media" always an explicit choice; guard never overrides the user.

### A.5 — Recording `available` flag is misleading; no health check

`useRecording()` returns `available: !!endpoint`. Env-var presence says nothing about service health, room-backend support, or token grants. Users get `toast.error('Failed to update recording. Check server logs.')`.

**Fix:** bless capability at mint time (token metadata) or via capability endpoint; gate the button on real capability; friendly error with fallback.

### A.6 — `Room` memoized with empty deps; `hq`/`codec` ignored after mount

`const room = React.useMemo(() => new Room(roomOptions), [])` — options re-compute on `hq`/`codec` change but the live `Room` is created once. Post-join setting changes silently do nothing.

**Fix:** either document+surface `hq`/`codec` as pre-join-only, or reconnect/re-publish on change.

### A.7 — Mismatched post-disconnect behavior; drop vs. leave identical

Standard: `handleOnLeave → router.push('/')` — network drop and intentional leave both dump you home context-free. Custom (better): `RoomEvent.Disconnected` → `ended=true` → `MeetingEndedScreen`.

**Fix:** standard room adopts the ended-screen pattern; differentiate "Leave" (friendly ended + optional summary) from "unexpected disconnect" (diagnosis + rejoin).

"unexpected disconnect" (diagnosis + rejoin).

## B. UI / UX Issues

### B.1 — Hard-blocking `alert()` dialogs

E2EE `DeviceUnsupportedError`, connection error, encryption error → native `alert(...)`. Unstyleable, focus-trapping, main-thread blocking.

**Fix:** in-app toasts/banners with recovery actions (retry / rejoin / continue-without-media) via existing `react-hot-toast`.

### B.2 — No loading/error state while minting token

Home **Start Meeting**/**Connect** push a route immediately; mint happens only after room-page load via `/api/connection-details` fetch. On mint failure `connectionDetails` stays `undefined` and pre-join stalls silently; `handlePreJoinError` is `console.error` only.

**Fix:** loading skeleton on room page for the mint fetch; explicit error + retry ("Couldn't start the meeting — try again").

### B.3 — Pre-join copy is generic, not interview-first

"Join without camera/mic — watch, share screen, chat." Primary case is: candidate joins, cam+mic on, AI interviewer asks questions.

**Fix:** "Check your camera and microphone, then start the interview." Keep watch/audio-only fallback with interview-context caveats.

### B.4 — No meeting metadata in-room beyond room name

Nav shows `room.name || label` ("Meeting code") + "Secure" chip. No session title, role indicator, job/session metadata — despite an interview-specific product (`museTalkEnabled`, "You ended the interview").

**Fix:** pass interview metadata (token metadata or parallel fetch); render header chip e.g. "Software Engineer Interview · Acme · 30 min". Grounds recording + post-meeting summary.

### B.5 — "Copy invite link" copies full URL incl. hash

`copyInvite` writes `window.location.href` — E2EE rooms include the passphrase hash (`#<passphrase>`).

**Fix:** warn the link may contain an encrypted-room passphrase; offer "copy room code only" alongside "copy invite link".

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

### B.10 — No actionable reconnect UX

Chip cycles Good/Connecting…/Weak/Reconnecting…/Disconnected with no action. Gap between "weak" warning and "dropped".

**Fix:** reconnect banner on Connecting/Reconnecting ("Reconnecting automatically…"); "Connection lost" screen on Disconnected with rejoin button (reuse cookie or re-mint).

on Disconnected with rejoin button (reuse cookie or re-mint).

## C. Design & Branding Inconsistency

### C.1 — Two competing design systems

- **Home** (`app/page.tsx` + `Home.module.css` + `globals.css`): dark glassmorphic, translucent dark cards, accent on dark, blur flakes.
- **In-room** (`ailink.css`): light minimal indigo/violet, `--ail-bg:#f7f8fb`, white surfaces, different type scale/spacing.

Users travel dark-glass → bright-white with no transition. Accent matches (`#5b5bd6`) but voice differs (landing tone vs. product-tool tone).

**Fix:** pick one language — light `ailink.css` is the better base — and carry its tokens (surface, type scale, radius, shadow) to the home page.

### C.2 — LiveKit `LogoMark` co-branded as the product mark

Home header, `AILinkRoom` brand link, `MeetingEndedScreen` all render LiveKit's `LogoMark` next to "HireXt Meet" as one combined logo. Third-party OSS mark + your brand reads "LiveKit demo" and is a trademark/brand risk.

**Fix:** HireXt-owned meeting mark; optional separate "Powered by LiveKit" line (footer/About), never fused with the logo.

### C.3 — Stock Unsplash virtual backgrounds, no fallbacks

`CameraSettings` offers only "Desk" (samantha-gades) and "Nature" (ali-kazal). Generic stock; no `onError` fallback on load failure.

**Fix:** blur-only default + neutral/branded scenes; blur fallback on failure.

### C.4 — "Demo project" language

"Try HireXt Meet for free with our live demo project" undercuts trust for a production interview surface.

**Fix:** "Start a test meeting" / "Try a sample meeting".

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

### D.5 — Continue-without-media form uses inline hardcoded palette

Inlines `background: var(--lk-bg2,#fff)`, `color: var(--lk-fg,#12142b)` etc. Renders atop `ail-root` light shell; diverges on theme change.

**Fix:** move onto the same `ail-*` tokens as the rest of the room.

### D.6 — `ThemeProvider` is a no-op; `.themeSwitcher` CSS un-wired

Hard-codes light (`data-lk-theme='light'`), ignores `prefers-color-scheme`, never persists; `setTheme`/`toggleTheme` no-ops; `useTheme()` unused. `Home.module.css` ships orphan `.themeSwitcher`.

**Fix:** make the provider real (preference → persist → document attr + LiveKit theme) or delete it + switcher CSS.

or delete it + switcher CSS.

## E. Production-readiness Gaps

### E.1 — No auth gate on entry points

Home, room, custom pages publicly reachable; participation anonymous. Interviews need: host rooms tied to staff sessions; candidate one-time links bound to their session with name pre-filled; optional watch-only observers.

**Fix:** tie identity in at the mint endpoint (§A.3).

### E.2 — Error telemetry is Debug-only

`DebugMode` (Shift+D tracks/permissions panel) + Datadog init in `useDebugMode` — Datadog only when both public token + site set, else console. No structured reporting for connection/E2EE/recording/connect failures with user/room context.

**Fix:** error boundary around room + reporting hook on `handleError`/`handleEncryptionError`/`Disconnected` (room, identity, state, error). Keep Debug panel strictly dev-only (`NODE_ENV` gate).

### E.3 — Unhandled connection-details fetch failure (§B.2)

Mint failure → `connectionDetails` stays `undefined` → pre-join blocked forever.

**Fix:** explicit error state + retry.

### E.4 — Large, partly-public env surface

Client-visible: `NEXT_PUBLIC_CONN_DETAILS_ENDPOINT`, `NEXT_PUBLIC_SHOW_SETTINGS_MENU`, `NEXT_PUBLIC_LK_RECORD_ENDPOINT`, `NEXT_PUBLIC_DATADOG_*`. Secrets (`LIVEKIT_API_KEY/SECRET`) server-only (good). But a public recording URL means anyone can hit record start/stop if they guess a room name.

**Fix:** authenticate the recording endpoint (LiveKit token or admin session); never trust room name alone.

### E.5 — Custom path: no pre-join, silent failure, immediate mic+cam — FIXED

Was: requested camera+mic on landing (no name, no preview, no continue-without-media); denial was `console.error` only — black room, no guidance.

Now: `/custom` renders a mandatory `CustomMediaGate` (`lib/ailink/CustomMediaGate.tsx`) before any `Room` connection: (1) device inventory via `enumerateDevices` with a fail-fast "no camera/mic" screen + Retry; (2) live camera/mic preview + device pickers via LiveKit `PreJoin` (name required); (3) on "Check devices & join" click — the user gesture Chrome/Safari require for `getUserMedia` — `createLocalTracks` acquires publishable tracks, `VideoConferenceClientImpl` connects and publishes them immediately. Denial → toast + retry; connect failure → toast + tracks released. No continue-without-media path: cam+mic are mandatory on custom.

### E.6 — E2EE passphrase in URL hash, URI-decoded, unvalidated

`encode/decodePassphrase` are just URI-encode/decode — any escaped string is "valid"; no length/entropy requirement. Hash fragments persist in history, can leak into analytics/referrers.

**Fix:** E2EE opt-in via dedicated copy-from-UI shared secret (not URL), or — if keeping hash passphrases — document limits and don't imply strong security. Keep signed-JWT `museTalkEnabled` decode clearly separated from passphrase handling.

### E.7 — Room IDs from `Math.random`

`randomString` is non-CSPRNG; 8 lowercase-alnum chars. OK over a trusted channel; shaky if the ID is the *only* access control.

**Fix:** `crypto.getRandomValues` or server-generated IDs.

### E.8 — Recording timer edge cases

Interval clears on `isRecording=false`; verify no leak when unmounting mid-recording with `pendingRef` in flight.

### E.9 — `isMeetStaging()` hardcoded, possibly unused

Hardcodes `meet.staging.livekit.io`; not consumed in reviewed code. Verify purpose; ensure no staging assumption leaks to production.

### E.10 — No i18n / RTL / a11y readiness

English-only (`lang="en"` set — good). Missing `aria-live` for connection state, recording, join/leave — screen-reader users get no feedback. Contrast risks: home secondary `--lk-fg5:#6f7390` on translucent dark; in-room small text `--ail-fg-3:#878ca7` on white — both need AA verification.

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
| `lib/CameraSettings.tsx` / `lib/MicrophoneSettings.tsx` | Inline styles + `lk-button` mix; no image `onError`; Krisp `low` on low-power (good) |
| `lib/ThemeProvider.tsx` | No-op (§D.6) |
| `lib/client-utils.ts` | `isMeetStaging` hardcoded/unused (§E.9); non-CSPRNG IDs (§E.7) |
| `lib/getLiveKitURL.ts` | Region rewrite `livekit.cloud`-only — fine for demo, no-op self-hosted |
| `lib/Debug.tsx` | Dev panel + Datadog init — not prod reporting (§E.2) |
| `lib/useSetupE2EE.ts` | Eager worker, no cleanup, any-hash-passphrase (§A.2) |
| `lib/usePerfomanceOptimiser.ts` | Solid hook; **typo**: rename → `usePerformanceOptimizer.ts` |
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
16. Branded/neutral backgrounds + load fallbacks (§C.3).
17. CSPRNG or server-generated room IDs (§E.7).
18. Home wide-screen layout pass (§D.1).
19. Backend-backed recording capability (§A.5).
20. Rename `usePerfomanceOptimiser.ts` → `usePerformanceOptimizer.ts`.
21. On-device contrast + dock-wrap verification (§D.3, §E.10).

## H. Proposed Implementation Sequence (next step)

- [ ] Unified conference shell + pre-join for both paths
- [ ] In-app error toasts (no more `alert`), incl. custom-path error UX
- [ ] E2EE worker lazy-init + cleanup + only-when-needed
- [ ] Auth-gated token mint with real participant identity + reconnect/re-mint UX
- [ ] Branding pass: HireXt mark, design-system unification, copy
