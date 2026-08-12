# Caz Media Vault

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
