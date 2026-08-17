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

The container health cycle also scans for newly added incompatible media once per minute and queues it automatically. The Media Compatibility page remains available for queue monitoring and manual scans.

The DS223 has limited CPU resources, so full-length conversions can take many hours. Keep the NAS powered on and monitor the persistent queue on the Media Compatibility page. Configure the native public login before exposing administrative mutation routes.

Conversions use one FFmpeg video thread to leave capacity for simultaneous playback. The Media Compatibility page provides persistent Pause and Resume controls, per-job and overall progress bars, and safe cleanup for completed or failed history. Pausing suspends the active FFmpeg process without stopping Constant’s Hub or discarding the queue.

Smart conversion copies compatible H.264/AAC streams directly into MP4, converts only audio when the video is already compatible, and uses full H.264 encoding only when required. By default conversions run from midnight until 7 a.m. and automatically suspend while a stream is active. Configure the window with `CONVERSION_SCHEDULE_ENABLED`, `CONVERSION_START_HOUR`, and `CONVERSION_END_HOUR`.

## Kids & Family and Synology artwork

TMDB Family titles are classified as Kids & Family unless their US certification is PG-13/R/NC-17/TV-14/TV-MA. G titles qualify automatically, and Animation qualifies with a child-friendly certification. The TV home screen always places matching titles in a dedicated Kids & Family row. Newly organized matching movies are physically placed under `/media/Kids` after the normal confirmation step.

The organizer writes both `poster.jpg` and `folder.jpg`. System Settings also includes **Sync Missing Posters** for existing movies. Synology Media Server owns the separate DLNA database used by Samsung's built-in media browser; because Docker moves and writes do not reliably trigger DSM indexing, use **Control Panel → Indexing Service → Media Indexing → Re-index** after organizing or syncing artwork.

## TV show organization

Inbox filenames containing `S01E01` or `1x01` are recognized as television episodes. The organizer uses TMDB television metadata and groups them as:

```text
/media/TV Shows/Series Name/Season 01/Series Name - S01E01.mp4
```

Episodes appear in the **TV Shows** row on the TV interface. Files without a recognized episode marker continue through the existing movie organizer.

The home screen intentionally limits each rail to a short preview so large libraries remain easy to navigate. The responsive sidebar opens dedicated searchable Movies, TV Shows, Kids & Family, and Recently Added grids. Each television series appears once; selecting it opens its seasons and episodes together.

Playback shows an Up Next prompt during the final minute and automatically advances to the following episode. Watched and Continue indicators are stored independently per household profile. The player exposes AirPlay or Remote Playback controls when the browser supports them.

## Collections, maintenance, and backups

The home screen creates collection rows from TMDB franchises and recognized titles such as Star Wars, Marvel, James Bond, Middle-earth, and holiday movies. Owners can build additional household collections at `/settings/collections`. Surprise Me chooses an unwatched title for the current profile, while recommendations use genres from that profile's completed titles.

Daily maintenance defaults to 4 a.m. and scans the library, queues incompatible media, repairs missing posters when TMDB is configured, and prunes conversion history older than 30 days. Configure it with `MAINTENANCE_ENABLED` and `MAINTENANCE_HOUR`. The System Status dashboard reports media counts, storage, missing artwork, conversion health, streaming activity, and recent additions.

The Owner can export or restore profiles, password hashes, progress, watchlists, custom collections, a library snapshot, and non-secret automation settings from System Status. Backups never contain media bytes, TMDB tokens, tunnel tokens, `AUTH_PASSWORD`, or `AUTH_SECRET`.

## Public username and password

Constant’s Hub can require a signed login session only on its public hostname while leaving private LAN addresses passwordless. Add these values to the uncommitted Synology `.env` file before rebuilding:

```dotenv
AUTH_USERNAME=choose-a-username
AUTH_PASSWORD=choose-a-long-unique-password
AUTH_SECRET=generate-at-least-32-random-characters
```

Generate a strong session secret with `openssl rand -hex 32`. The Compose file passes these values into the application container. Never commit the real values or share them in screenshots.

When all three credential values are configured, every request arriving through Cloudflare requires the login cookie, even if the tunnel presents a private origin host header. Public requests fail closed with status 503 when any credential is missing. Only genuinely direct requests to loopback, `.local`, and RFC 1918 private addresses—including `http://192.168.0.15:3000`—remain available for trusted home TVs. The session lasts 30 days, uses an HTTP-only secure cookie, and login attempts are limited per source address. `/api/auth/status` reports only whether each required setting is present, never its value.

Deploy and test the native login before removing the Cloudflare Access application; otherwise the Cloudflare login screen will continue to appear in front of Constant’s Hub.
