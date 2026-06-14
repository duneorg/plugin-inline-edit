# Changelog

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
