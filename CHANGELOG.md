# Changelog

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
