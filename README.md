<a href="https://livekit.io/">
  <img src="./.github/assets/livekit-mark.png" alt="LiveKit logo" width="100" height="100">
</a>

# LiveKit Meet

<p>
  <a href="https://meet.livekit.io"><strong>Try the demo</strong></a>
  •
  <a href="https://github.com/livekit/components-js">LiveKit Components</a>
  •
  <a href="https://docs.livekit.io/">LiveKit Docs</a>
  •
  <a href="https://livekit.io/cloud">LiveKit Cloud</a>
  •
  <a href="https://blog.livekit.io/">Blog</a>
</p>

<br>

LiveKit Meet is an open source video conferencing app built on [LiveKit Components](https://github.com/livekit/components-js), [LiveKit Cloud](https://cloud.livekit.io/), and Next.js. It's been completely redesigned from the ground up using our new components library.

![LiveKit Meet screenshot](./.github/assets/livekit-meet.jpg)

## Tech Stack

- This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).
- App is built with [@livekit/components-react](https://github.com/livekit/components-js/) library.

## Demo

Give it a try at https://meet.livekit.io.

## Dev Setup

Steps to get a local dev setup up and running:

1. Run `pnpm install` to install all dependencies.
2. Copy `.env.example` in the project root and rename it to `.env.local`.
3. Update the missing environment variables in the newly created `.env.local` file.
4. Run `pnpm dev` to start the development server and visit [http://localhost:3000](http://localhost:3000) to see the result.
5. Start development 🎉

## Local LiveKit via Docker

This repo ships a Docker setup for a local LiveKit SFU, so no LiveKit Cloud project is
needed for development:

```bash
docker compose up -d        # start the SFU (background)
docker compose ps           # status + health
docker compose logs -f      # server logs
docker compose down         # stop it again
```

The SFU is configured by [`livekit.yaml`](./livekit.yaml) and listens on:

| Port         | Purpose                                      |
| ------------ | -------------------------------------------- |
| `7880` (TCP) | Signalling — HTTP API + WebSocket            |
| `7881` (TCP) | ICE/TCP fallback when UDP is blocked         |
| `7882` (UDP) | RTC media — single UDP mux port for everyone |

### Credentials

`docker-compose.yml` starts the server with `LIVEKIT_KEYS` taken from the ambient
`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` values (the HireXt monorepo root `.env`
exports them), and falls back to LiveKit's well-known dev pair `devkey` / `secret`
when they are not exported. `.env.local` holds the same fallback pair, so a fresh
clone works out of the box.

### App configuration

The app must be pointed at the Docker SFU — `.env.local` already does this:

```bash
LIVEKIT_URL=ws://127.0.0.1:7880
```

> **Note:** Next.js gives already-exported process environment variables precedence
> over `.env.local`. This monorepo's root `.env` exports `LIVEKIT_URL=ws://127.0.0.1:3000`,
> which would send browsers to the Next dev server instead of the SFU. Either fix that
> value to `ws://127.0.0.1:7880` for the whole stack, or start this app with an explicit
> override:
>
> ```bash
> LIVEKIT_URL=ws://127.0.0.1:7880 pnpm dev
> ```

### Testing from another device (phone on the same LAN)

Docker Desktop cannot advertise the container's own IP, so `livekit.yaml` sets
`rtc.node_ip` to an address the browser can reach. For LAN testing, change it to this
machine's LAN IP and set `LIVEKIT_URL` accordingly:

```yaml
# livekit.yaml
rtc:
  node_ip: 192.168.0.10 # e.g. `ipconfig getifaddr en0`
```

```bash
LIVEKIT_URL=ws://192.168.0.10:7880
```

### Troubleshooting

- `docker compose logs livekit` — set `logging.level: debug` in `livekit.yaml` for
  per-transport ICE/DTLS detail, then `docker compose up -d --force-recreate`
  (compose does not track edits to the bind-mounted config).
- `curl http://127.0.0.1:7880/debug/rooms` — active rooms as JSON (`--dev` mode only).
- `enable_loopback_candidate` must stay disabled: with it, the SFU also binds its UDP
  mux to `127.0.0.1` inside the container, so media arriving on `eth0` (Docker NAT
  rewrites the destination to the container IP) is attributed to the wrong socket and
  ICE fails silently with `could not connect after timeout`.
