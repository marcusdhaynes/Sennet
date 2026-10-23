# SENNET

**Your tabletop. Your rules.** A GitHub-first, portable 2.5D tabletop simulator foundation built with TypeScript, React, Vite, PixiJS 8, Lua/Wasmoon and Tauri 2.

![Status: early alpha](https://img.shields.io/badge/status-early%20alpha-ccba87)

This repository is an **implemented early alpha**, not a finished Tabletop Simulator replacement. Its game engine and UI are real, but public-release-grade authentication, game-specific rule enforcement, scalable persistent matchmaking, safe moderation and app-store distributions are still future work. See [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for precise status.

## Quick start

Install Node 22.16+ and npm. Run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Pick Sandbox, Board Games, TCG, RPG, Wargame, Dice & Tiles, Party, or Custom. Drag pieces, switch among twelve seat perspectives, rotate/flip/clone, roll dice, shuffle/draw, and export action history.

### Multiplayer — invite, drop in, pick up later

Once a persistent relay is hosted, multiplayer is **one click to make a table, one link to join it**:

1. Choose **Play together → New table**. Sennet allocates an unguessable room code and a saved seat.
2. Choose **Invite friends**. The link includes both the room and relay address, so invitees join automatically without configuring a server.
3. Leave whenever you like. Reconnects happen automatically after network interruptions. Reopen **Play together → Pick up where you left off** to reclaim your saved seat and reload the authoritative room.
4. Everyone can come and go independently; shared cards, tokens, turns, player assignments and their online/away status live on the relay, not in the host's tab. User-specific playmat preferences remain local to each browser identity.

No user account or password is required for a trusted private playtest. Sennet generates a cryptographically random player secret and retains it in the browser, separate from the public player ID. Do not erase browser storage if you want to reclaim that identity; this is not a replacement for cross-device account login. **A room invitation grants access to the game; share it only with your intended players.**

#### Deploy the multiplayer relay on Render (persistent pickup games)

This repository now includes [render.yaml](render.yaml) for a single Node web service **with a persistent disk**, suitable for small, trusted private rooms. Render may charge for the configured compute service and disk.

1. In [Render's Blueprint setup](https://render.com/deploy?repo=https://github.com/marcusdhaynes/Sennet), connect this Sennet repository and review/authorize the plan and disk.
2. After deployment, open your service's `https://<service>.onrender.com/health` endpoint. It should respond with `{"ok":true,...}`.
3. In Sennet, open **Play Together → Set up online hosting once**, paste the **https://** service address, and choose **Save & test connection**. Sennet converts it to `wss://` and remembers it.
4. Choose **Create online table** and copy the invitation link. The other player needs only that link—**no setup**.
5. Optionally configure GitHub Actions repository variable `SENNET_RELAY_WSS_URL` to the matching `wss://` URL so new visitors can create rooms before receiving any invite.

**VPNs:** use TLS on port 443 (`wss://`), with automatic fallback to HTTPS room sync and commands if a VPN, proxy or browser blocks WebSocket upgrades. No inbound port forwarding or WebRTC peer-to-peer connection is required. Some VPNs block both protocols; those cannot be bypassed from browser code.

**Before hosting:** the app now explains when hosting is missing instead of treating it as an ordinary game disconnection. Without a deployed relay, a multiplayer room cannot truthfully be created. Offline tabletop play remains available.

#### One-time relay setup

GitHub Pages cannot host persistent WebSocket connections. The WebSocket server is `apps/server` and must run in an independent Node 22.16+ hosting service or VM that supports **long-lived WebSockets and persistent disk**.

```bash
npm install
SENNET_DATA_DIR=/persistent/sennet PORT=8787 npm run start -w @sennet/server
```

On the server, expose port 8787 through a TLS reverse proxy with a `wss://` endpoint, and provide a durable writable disk for `SENNET_DATA_DIR`. Room JSON is saved atomically after every command and seat change; it is not stored in GitHub Pages or the host browser. A server with ephemeral filesystem **will lose saved pickup games when restarted**. Keep backups, access controls and a retention policy for real deployments.

For one-time default configuration across all visitors, set GitHub repository **Settings → Secrets and variables → Actions → Variables** key `SENNET_RELAY_WSS_URL` to the public `wss://` relay URL, then redeploy Pages. Alternatively, enter the relay address once in the Multiplayer settings book: subsequent invites automatically carry it to guests.

The server currently targets **trusted private games**. Public hosting will additionally require room authorization/moderation, robust authentication for cross-device profiles, database-backed scalable room storage, automated backups and operational monitoring. Until a relay is actually deployed, the site remains fully playable offline and the public multiplayer buttons cannot establish online rooms.

#### Local two-player check

```bash
npm run dev:server
npm run dev
```

Point Sennet's one-time multiplayer relay setting to `ws://localhost:8787` on `http://localhost:5173`. Start a table, open the invitation link in another browser profile, move pieces, close either client, reopen, and verify the saved seats and shared state. Use `wss://` for the hosted HTTPS site.

### Tests and build

```bash
npm test
npm run check
npm run build
npm run preview
```

`npm run build` generates the static web app at `apps/web/dist/`. GitHub Pages can host this output, but **GitHub Pages cannot host the multiplayer WebSocket service**. The first `npm install` generates `package-lock.json`; commit the lockfile for repeatable deployment.

## Open Sennet on the web

Your project is hosted at [marcusdhaynes/Sennet](https://github.com/marcusdhaynes/Sennet). The playable URL is **https://marcusdhaynes.github.io/Sennet/**.

**One-time setup:** Open [Settings → Pages](https://github.com/marcusdhaynes/Sennet/settings/pages). Under **Build and deployment**, select **GitHub Actions** as the Source. Then open [Deploy Sennet Web](https://github.com/marcusdhaynes/Sennet/actions/workflows/pages.yml), choose **Run workflow** on `main`, and check the deployment result. Future pushes to `main` automatically rebuild and publish Sennet.

GitHub Pages hosts the playable local/offline web interface. Real-time multiplayer requires deploying `apps/server` to a separate HTTPS/WSS service; Pages does not run servers. The starter relay is only suitable for development/testing until its security checklist has been addressed.

## Universal TCG Studio (bottom-right gear)

Click the circular gear on the table to open **TCG Studio**. The studio combines a seven-game deck builder with TCG-specific settings for card snapping on merged zones, stack hold timing, merge hover timing, card image loading and compact browsing.

Features: multi-deck autosave in the local browser, complete game-specific catalogues, name/text/number search, set/type/rarity/color/cost filters, sorting, individual card details and ownership, saved notes/tags, Main/Extra/Commander/Leader/DON!!/Resource/Sideboard/Maybeboard sections as appropriate, deck counts, cost curve, indicative prices, format advisories, text import/export, full-fidelity JSON import/export and Load to table (replaces a local game only).

| Game | Provider and full-dataset strategy |
| --- | --- |
| Disney Lorcana | Lorcast: one set index, then all set cards, paced at 110ms between requests. |
| Gundam | GCG API: unmetered NDJSON bulk export, anonymous paginated fallback. |
| Magic: The Gathering | Scryfall: Default Cards gzip-compressed JSONL stream via jsonl_download_uri (all default-language printings and sets, not abusive pagination). |
| One Piece | OPTCG API: bulk expansion, starter, promo and DON!! endpoints. |
| Pokémon | TCGdex: one complete English card index with full details on demand. |
| Riftbound | Riot Games: requires app-specific key and official approval; no public browser key. |
| Yu-Gi-Oh! | YGOPRODeck: one complete cardinfo API response. |

IndexedDB caches successful catalogues for 24 hours; artwork is loaded lazily. The app respects providers' rate limits and exposes connection failures instead of inventing cards. Automated legality claims are deliberately avoided; format and banned-card checks are **advisory** and should be verified against official current rules.

### Riot Riftbound approval and setup

Riot's policies require an approved application to access official Riftbound card assets and impose additional constraints on digital game tools. Never put your Riot token into GitHub Pages or a public VITE variable. Sennet includes an optional secure endpoint in its Node relay.

1. Obtain Riot approval and an app-specific API key: https://developer.riotgames.com/docs/riftbound
2. Configure the separate Node relay's secret environment variable **SENNET_RIOT_API_KEY**.
3. Build the web app with **VITE_SENNET_RIFTBOUND_CATALOG_URL** pointing to https://your-relay.example/api/tcg/riftbound/catalog. This is an endpoint URL, NOT an API token.

The relay calls Riot's authorized Riftbound content endpoint server-side and caches the result for 24 hours. Until approval/key configuration, the Riftbound catalogue explicitly reports access unavailable. No unofficial mirror is substituted.

## Creator-owned asset storage (BYOS)

Sennet never requires creators to upload media into Sennet's own server:

- **External game packs:** Creators export a small JSON game manifest and host it anywhere (their own domain, GitHub Pages, R2/S3-compatible object storage with public GET, etc.). Players paste that HTTPS manifest URL into Workshop. Sennet fetches it directly in their browser.
- **External miniature images:** Creators host sprite frames and paste their HTTPS URLs into Workshop. Sennet dynamically selects the appropriate sprite angle for the player's seat. The heavy images are loaded from the creator's host.
- **Direct file upload:** Creators provide an HTTPS **presigned PUT URL** created by their own storage provider. Sennet's browser uploads the selected game pack, sprite, ZIP, or `.glb` **directly** to that host. The Sennet relay receives none of the file bytes. Do not paste permanent keys/secrets. Configure the owner's storage for CORS and browser-accessible downloads.
- **Offline converter:** `tools/model-to-sprites/convert.py` takes a GLB/glTF/OBJ/FBX model into 12/24/36/48 frame transparent PNGs via offline Blender. End users don't render 3D during play. After conversion, upload frames to your own hosting and point the workshop at the image URLs.
- **Portable formats:** JSON game packs, external asset URLs, and JSON command history, designed to avoid vendor lock-in. An expanded packaging system with metadata signatures, moderated discovery, and version compatibility is planned.

**Availability and cost caveat:** Creators bear hosting/storage/bandwidth responsibilities. Sennet still needs *small* infrastructure for account data, match metadata, event logs and indexes, plus ordinary web hosting and compute. Bad actors and abusive hotlinks need rate limiting/moderation. Player-supplied files cannot be trusted and must be vetted before running in a shared/public game.

## Apps and packaging

The playable browser build is shared across native targets via **Tauri 2**. A working starter Tauri configuration and icon set live at `apps/web/src-tauri/`.

```bash
# After installing Rust and system-specific Tauri prerequisites:
npm run tauri -- dev
npm run tauri -- build

# For mobile: install Android Studio/SDK or Xcode on a supported host.
cd apps/web
npx tauri android init
npx tauri android dev
npx tauri android build
# On macOS only:
npx tauri ios init
npx tauri ios dev
npx tauri ios build
```

`.github/workflows/native.yml` contains a manual desktop build matrix (Windows, Linux, macOS). **Android/iOS targets and store signing have not been tested**; Apple builds require macOS, appropriate tooling and provisioning. Windows `.exe`, Linux AppImage/DEB and macOS packages require platform-specific builder dependencies and may need signing. Test on each platform before distribution. A basic installable PWA manifest and same-origin shell cache are included. Creator-hosted images are intentionally not cached offline; availability of third-party assets is not guaranteed.

## Repository structure

```text
apps/web/         React/Vite application, Pixi tabletop, workshop, deck lab, Tauri
apps/server/      Small WebSocket relay + durable local command/state logs
packages/core/    Deterministic tabletop types, rules, game presets and replay protocol
packages/lua/     Lua 5.4 worker proof of concept with termination watchdog
tools/            Blender model-to-sprite offline converter
examples/packs/   Portable JSON game-pack example
docs/             Architecture and public-launch requirements
.github/workflows GitHub Pages, CI and desktop packaging
```

## Philosophy

- One renderer-independent tabletop domain, one action protocol, many game modules.
- 12-seat board. Runtime 2D/2.5D rendering; offline multi-angle sprite baking.
- Command/event replay rather than streaming gameplay animation frames.
- React for app UI, PixiJS for the playing surface, Lua for extensible rules.
- Browser-first, light on assets until the player chooses a game.
- Community-hosted assets so creators retain control over storage and distribution.

Copyright (c) 2026 Sennet. No license has been selected; all rights reserved until the project owner chooses a license.
