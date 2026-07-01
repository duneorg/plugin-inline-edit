# Changelog

## [2.1.5] — 2026-07-01

### Changed

- **WebSocket path updated to `/api/inline-edit/ws`** — the inline-edit admin bar now connects to the endpoint registered by `@dune/core` directly rather than deriving it from the admin prefix. Requires `@dune/core ^0.25`.

---

## [2.1.4] — 2026-06-16

### Fixed

- **Collaborative editing was non-functional** — the WebSocket sync handshake passed an invalid (genuinely empty) state vector into Y.js's update encoder, which threw on every connection attempt and on every broadcast of an edit to other connected editors. Inline editing's local UI (TipTap, bubble menu, toolbar) appeared to work normally because none of it depends on the WebSocket layer, but the real-time Y.js sync and persistence path was silently broken. Connections now complete the sync handshake correctly.
- **Idle-session GC leaked a timer per evicted document** — each editing session's `Awareness` instance starts its own cleanup interval that was never stopped when the session was garbage-collected after 5 minutes of inactivity. Long-running servers editing many documents over time would accumulate one leaked timer per evicted session. The interval is now stopped alongside the session's Y.Doc.
- Added test coverage (`tests/`) for the persistence path: frontmatter/body splicing, commit and field-patch flows against real storage and history, Y.js draft load/persist/delete round-trips, and end-to-end WebSocket sync tests that exercise the real wire protocol — these caught both fixes above.

---

## [2.1.3] — 2026-06-14

### Fixed

- **Editor bundle cache-busting** — the admin bar's dynamic `import()` of the editor bundle now appends `?v={pluginVersion}` to the URL. This ensures the browser fetches a fresh copy whenever the plugin is upgraded, rather than serving a stale `max-age=3600` cached bundle.

---

## [2.1.2] — 2026-06-13

### Fixed

- **Internal version field corrected** — `mod.ts` now reports `"2.1.2"` matching the package version, so the bundle cache key (`inline-edit-2.1.2-editor-*.js`) will always correspond to the correct editor build.

---

## [2.1.1] — 2026-06-13

### Fixed

- **Bundle cache never invalidated** — the plugin's internal `version` field in `mod.ts` was still `"1.0.0"` (never updated since the initial release), so Dune's client-bundle cache always found a stale hit and served the 1.0.0 editor bundle regardless of the installed JSR version. The internal version now matches the package version and will be kept in sync going forward.

---

## [2.1.0] — 2026-06-13

### Added

- **Bubble formatting toolbar** — selecting text while body editing shows a floating toolbar above the selection with buttons for Bold, Italic, Strikethrough, Inline code, H1/H2/H3, Bullet list, Ordered list, Task list, Blockquote, Code block, Link, Image, and Table. Buttons reflect the active mark/node at the cursor. Link and Image switch the toolbar to a URL-input sub-view that stays open while the user types (via tippy's `interactive` option); confirming sets the mark/inserts the node and returns to the formatting bar.
- **Link support** — `@tiptap/extension-link` preserves `[text](url)` markdown syntax through edit sessions. `openOnClick: false` lets links be selected and edited rather than followed.
- **Image support** — `@tiptap/extension-image` preserves `![alt](url)` image syntax. Images can be inserted via the toolbar URL-input flow.
- **Table support** — `@tiptap/extension-table` (+ row/cell/header) adds markdown GFM table editing. The toolbar inserts a 3×3 table with a header row; existing tables in markdown round-trip losslessly.
- **Task list support** — `@tiptap/extension-task-list` + `task-item` adds GFM `- [ ] task` / `- [x] done` syntax with nested task support.
- **Placeholder** — `@tiptap/extension-placeholder` shows a subtle hint in an empty editor.

---

## [2.0.0] — 2026-06-12

Requires `@dune/core` ≥ 0.19.

### Breaking Changes

- **`./ui/editable` export removed** — the Preact island component kit is
  gone. Themes now opt in through the `data-dune-*` marker vocabulary,
  written as raw attributes or rendered with the server-only marker
  components from `@dune/core/ui/editable`. Templates never import from this
  plugin anymore, so the site `deno.json` import-map entry can be dropped.

### Changed

- **Marker-based architecture** — the plugin consumes markers from the
  rendered HTML. Body editing requires an explicit `data-dune-body` marker;
  the container-detection heuristic and the lossy HTML→Markdown walker are
  removed — markdown round-trips losslessly via tiptap-markdown.
- **Editing activates from a floating ✎ Edit handle**, never by clicking
  content, so links inside editable regions stay followable.
- **Editor ships via core's `clientEntries`** — the TipTap/Y.js editor is
  bundled by core at startup, served at `/plugins/inline-edit/editor.js`,
  and lazy-imported on first body edit. Syncs through the existing
  WebSocket wire protocol with presence display and CRDT merging; falls
  back to standalone editing + fields-API save when the socket is
  unavailable.

## [1.0.0] — 2026-06-11

Initial release: inline editing extracted from `@dune/core` (≤ 0.16) into a
plugin — Y.js sessions, WebSocket sync, admin bar injection, and the Preact
island component kit at `./ui/editable`.
