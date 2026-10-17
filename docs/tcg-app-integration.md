# Android TCG app integration

Source: archived Flutter `tcg_app` from the 27 May 2026 laptop backup.

Open Games > Trading Card Games or the TCG App tab. Battleground starts a TCG table only if one is not already active; reopening it preserves the current match.

## Ported content and behavior

- All 24 original named games, years and accent colors; All TCGs default.
- Local dark/light mode, selected game and collapsed-section preferences, isolated under `sennet.tcg.*`.
- Home sections, original three initial card images, all four sets of change notes and all eight historical demo news articles. Historical content is labeled as such.
- Trading, Rule Book and Random Card shortcuts; Home, Search, Collection, Decks and Battleground navigation.
- All six sample card records with original external artwork URLs.
- Eight basic, six positive and six negative token choices.
- Card/token placement on the current player's mat through existing ADD commands, plus 90-degree card tap control through ROTATE.
- Search, saved collection and recent-card tracking now work on the original six-card sample set. The original Search/Collection/Decks tabs all displayed the same home screen.

## Existing Sennet behavior retained

No changes to the core engine, TableCanvas, PersonalDrawer, network protocol, table geometry, snapping, center merges, twelve seats, opposing views, opponent cycling, camera limits, stack pickup, multiplayer, game-pack import/export, recent sessions or replay. Decks and Settings link to Sennet's existing implementations. Added cards carry their original image URL in faceUrl, so existing pack and replay persistence applies.

The Flutter two-player battleground is represented by Sennet's existing, more capable mats rather than replacing those controls. Tap/flip use explicit table tools so the current click selection and long-hold stack gesture remain intact.

## Original placeholders

Trading and Rule Book had empty callbacks. Random Card only displayed a toast and its format/rarity filter rows were static. Most drawer controls had no callback. Settings showed hardcoded save/deck examples, with no load/save functionality. These are not live services or rules engines. Sennet's real table tools, multiplayer settings, recent tables, game library and deck builder supply the corresponding working operations. The imported news is not a live feed, and the six sample cards are not a full database.

Remote artwork needs network access and depends on the original hosts. The integration does not download or redistribute the images.
