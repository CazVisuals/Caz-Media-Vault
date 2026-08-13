# Constant’s Hub

Private, NAS-backed home cinema built with Next.js 16.

## Local setup

1. Mount the Synology video share on the host.
2. Copy `.env.example` to `.env.local`.
3. Set `MEDIA_ROOT` to the mounted library path. On the development Mac this is `/Volumes/video`.
4. Optionally set `TMDB_READ_ACCESS_TOKEN`; the library and playback still work without it.
5. Install and start the application:

```bash
npm install
npm run dev -- --hostname 0.0.0.0
```

Open `/tv` from the TV or another device on the LAN. `ALLOWED_DEV_ORIGINS` accepts a comma-separated list when Next.js development asset requests originate from another LAN host.

## Media behavior

- Video files are discovered recursively beneath `MEDIA_ROOT`.
- `Inbox` is excluded from the browse catalog.
- The browser receives opaque movie IDs and relative display paths, never absolute NAS paths.
- Local `poster.jpg` or `folder.jpg` files are preferred when found next to a movie or in a same-named metadata folder.
- `/api/media/stream/[id]` supports HTTP byte ranges for seeking and large files.
- Playback progress is stored in the current browser for Resume behavior.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

Do not commit `.env.local`, Cloudflare tunnel credentials, API tokens, or NAS credentials.

## Synology Container Manager

The included Compose file defaults to your confirmed DS223 shared folder, `/volume1/video`, and mounts it read/write at `/media` for the approved Inbox organizer and conversion queue:

```bash
docker compose up -d --build
```

The organizer still restricts moves to sources inside `/media/Inbox`, rejects paths outside the media root, blocks unsafe symlink destinations, and refuses overwrites.

The Cloudflare connector reads `TUNNEL_TOKEN` from a local uncommitted `.env` file. The token must never be added to Git.

## Media compatibility and conversion

Open `/settings/media` to inspect the real container, video codec, audio codec, resolution, and mobile compatibility of every movie. The Docker image includes FFprobe and FFmpeg.

`Convert incompatible` scans both the existing library and Inbox, then converts only incompatible files one at a time to H.264/AAC MP4. Each conversion is written to a temporary file and verified before replacement. The original is preserved under `/media/.constants-hub/originals` and is never deleted.

The DS223 has limited CPU resources, so full-length conversions can take many hours. Keep the NAS powered on and monitor the persistent queue on the Media Compatibility page. Protect the public application with Cloudflare Access before exposing administrative mutation routes.
