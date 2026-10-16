# Sennet implementation status and architecture

## Already implemented in this alpha

- Functional React/Vite interface with game picker, table, workshop, deck lab and settings.
- PixiJS 8 tabletop with rendered dodecagonal table, seat selection in 30-degree increments, object rendering, pointer dragging, basic selection and changes.
- Renderer-independent TypeScript engine with deterministic event processing (`ADD`, `MOVE`, `ROTATE`, `FLIP`, `DELETE`, `CLONE`, `ROLL`, `DRAW`, `SHUFFLE`, `NEXT_TURN`, `SET_MODE`).
- Game presets: Sandbox, Board Game, TCG, RPG, Wargames, Dice, Party, Custom.
- Basic starter deck builder, shuffling, drawing and export to portable JSON.
- Local-first session, action history, replay point selection, event log export, deterministic tests.
- Optional development WebSocket room server with 12 seats, event transmission, snapshots for reconnect, limited authoritatively generated randomness, per-view projected state, local JSON persistence and rate limiting.
- Lua 5.4/Wasmoon Worker playground with controlled `emit` API and 750 ms wall-clock watchdog.
- Offline lightweight heuristic bot acting through game commands.
- Hosted JSON game-pack import (CORS permitting), local import and export, creator-owned external sprite URLs, presigned PUT direct upload to creator-managed storage.
- Blender CLI model-to-sprite converter with selectable frame count.
- Tauri 2 native skeleton and GitHub CI/Pages/desktop workflows.

## Explicitly not production-ready

- **No durable identity system or authentication.** Room actors are generated in the browser and could be impersonated by another client. Never rely on this for competitive play, payments, moderation or private data. Add authenticated, short-lived identity tokens and server-side seat grants.
- **Not a fully featured card-game rules engine.** Current TCG is a card/deck playground, not a Magic/Pokémon-specific legal-move simulator. Games require rule packs, deck validators, rule triggers, turn phases and complete authority for state changes.
- **No production-safe confidential hands.** The relay projects sensitive fields and syncs private deck changes through snapshots, but complete hidden-information noninterference, deck commitments, secret-hand handling and reconnect protocols require dedicated work and tests before competitive use. The no-hidden-info sandbox can be used now.
- **Lua is experimental.** The worker uses basic standard-library removal and termination, but is *not* sufficient as a security review of hostile scripts. Need verified worker isolation, instruction/memory budget, pack signing, API allowlisting, resource quotas, versioning and server-approved scripting.
- **Game packs are untrusted data.** Static data is sanitized but image URLs may track players or contain inappropriate material. Add hostname policies, permissions, moderation, size/version limits, CDN proxy/privacy controls as appropriate, content signatures and opt-in execution.
- **Store policy incomplete.** BYOS only avoids storing large creator content; Sennet still pays for relay compute, event/database storage, signaling, accounts, metadata, abuse control, search and discovery.
- **Offline-to-online queue/conflict resolution not built.** Offline session and live rooms work separately. Autosync conflicts and idempotent re-join logic are planned.
- **Client rendering is naive for very large boards.** Scene is recreated after committed actions, with Pixi resource caching. Keyed diffing, culling, atlas/texture budgets and mobile performance profiling needed for hundreds/thousands of objects.
- **No true arbitrary 3D object interaction.** Imported GLB/glTF must be baked offline into sprite-angle images. Physical 3D tumbling, free-elevation cameras, realistic collisions and depth-perfect overlaps are intentionally out of scope.
- **Not fully built/distributed as native.** Tauri config and GitHub desktop workflow provided but platform signing, Android/iOS scaffolding, app stores and binary smoke tests remain.
- **PWA offline support is basic.** Installable manifest and same-origin service-worker cache exist, but local persistence, full offline game downloads, external asset caching and update control need production hardening.
- **No production load tests or built-in release automation for mobile.** Twelve seat UI positions do not guarantee twelve concurrent low-latency users at high object counts.

## Event model

```text
User input ──► Command (small JSON) ──► server validates ──► append Event
                 │                                   │
                 ▼                                   ▼
          offline local reducer                relay to clients
                 │                                   │
                 └─────────────► applyCommand ◄──────┘
                                        │
                                        ▼
                            Pixi visual reconstruction
```

Initial joins/reconnects use snapshots followed by actions. Private deck operations require additional per-view authoritative state so that secret content is not sent in public commands. For public actions, clients receive serialized event commands, not object-motion streams or graphical frames. Live-pointer visual prediction is future work.

## Assets and angle selection

```
Creator's model (.glb) → Blender offline render (24 views) → Creator's bucket/CDN
                                                                │
Player's browser ← HTTPS sprite-frame URL ← Sennet game-pack manifest reference
```

`nearestFrameIndex(seat, object.rotation, frameCount)` selects the closest azimuth frame (30° for 12 images, 15° for 24, 10° for 36). The initial camera is top-down with screen-space table rotation, not a physically accurate eye-level perspective. More convincing 2.5D could use an isometric affine transform, parallax, occlusion layers and elevations baked into atlases.

## Production milestones (in priority order)

1. Real accounts, authentication, authenticated/expiring invite links, authorization, trusted game pack IDs, moderator tools.
2. Hidden-information correctness, server-only shuffled deck order, client-redacted commands, cryptographically secure commitments for competitive play.
3. Game-specific engine: phases, legal action generators, win conditions, safe Lua hooks, game package API and stable versioned manifests.
4. Persistent transactional Postgres event log, optimistic revision control, exactly-once actions, idempotency and logs/snapshots pruning, bot seats.
5. Robust asset ownership/permissions, manifest signing, storage provider integrations (OAuth/direct uploads), creator quota controls, availability checks and takedown notices.
6. Persistent sessions, proper drop-in/out policies, spectators, match discovery, asynchronous notifications, chat, integrated replay and moderation.
7. Pixi keyed rendering, touch ergonomics, compressed sprite atlases, WASM Lua resource limits, voice/performance accessibility, mobile device testing.
8. Add true PWA packaging, Android/iOS native target init, desktop/mobile CI validation, app signing and store submissions.
