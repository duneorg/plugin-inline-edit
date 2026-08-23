# Changelog

## [2.2.1] — 2026-08-23

### Fixed

- **`@dune/core` pin bumped to `^0.33.0`.** The previous `^0.32.0` range didn't
  cover `@dune/core`'s current version — a site running a newer core would have
  loaded a second, stale copy just for this plugin. No behavior change; nothing
  in this release depends on a 0.33-only export.

## [2.2.0] — 2026-08-22

### Added

- **Buttons contributed via `DunePlugin.adminBarActions` now render in the admin
  bar**, between Save and the "Open in admin" escape link — an `href` renders as
  a link, `onClick` as a button running that literal JS (label/icon/href
  HTML-escaped; `onClick` attribute-escaped for syntax safety). Lets another
  plugin (e.g. a PDF export) add a quick-link to the shared toolbar without this
  plugin knowing anything about what it does. Requires `@dune/core@0.32.0`,
  which added `ctx.plugins` to `ResponseTransformContext`; pin bumped to
  `^0.32.0` accordingly.
- **In-page "Edit source" overlay** for the full MDX editor — opens
  `/admin/pages/edit?path=...` in an on-page iframe modal, for editing MDX-heavy
  pages the inline body-editor can't annotate (no single `data-dune-body`
  element). Requires `@dune/plugin-admin@2.0.0`'s same-origin framing support
  for `/pages/edit`. The overlay's iframe passes `embedded=1`, which drops
  plugin-admin's sidebar/topbar chrome (redundant when floated over a content
  page with nowhere else to navigate). The escape link stays un-embedded, since
  that's a real full-page navigation.

### Fixed

- **The admin bar and its overlays no longer print.** Printing straight from the
  browser (Ctrl+P / print-to-PDF) while viewing a page baked the fixed admin
  toolbar, and the new source-editing overlay, into the printout — nothing hid
  this admin-only chrome under `@media print`. Only affects manual browser
  printing; the scripted PDF export browses anonymously and never sees the admin
  bar at all.
- **Save button no longer shows before any edit is made.** It now starts hidden
  and appears the moment a field edit begins, hiding again after a successful
  commit.
- **"Editing" toggle and Save button no longer render on a page with nothing
  editable.** Both were previously always shown, even when no title/body element
  was annotated — clicking "Editing" enabled hover handles that could never find
  a target, and there was nothing a commit could save. "Edit source" still
  renders — it works independent of inline annotation.
- **The "Open in admin →" escape link 404'd.** It pointed at
  `${adminPrefix}/pages/${path}`, a route plugin-admin never registered (only
  `/pages/edit?path=...` and `/pages/builder` exist). Fixed to use the correct
  URL.

## [2.1.8] — 2026-08-16

### Fixed

- **The body-editing toolbar overlapped the editor's first line of content.**
  `.dune-ao-body-toolbar` is a deliberately zero-height sticky container so it
  floats without displacing page layout, but nothing reserved the space its
  visible pill actually renders in. Added `margin-top` to the editor to clear
  it.
- **`deno check` failed on `src/client/editor.ts`** — `syncTimer`'s type didn't
  match what `setTimeout` returns in this lib configuration. No runtime behavior
  change.

## [2.1.7] — 2026-08-04

### Fixed

- **`commitDoc()`/`patchFrontmatterFields()` never fired `onPageUpdate`.** They
  wrote straight to storage via the history engine, with no hook firing anywhere
  in the path — unlike `@dune/plugin-admin`'s own page-save route, which fires
  `onPageUpdate` right after its write. Any plugin relying on that hook (e.g. to
  regenerate content derived from the edited page) silently never saw edits made
  through inline-edit, only edits made through the admin CRUD routes. Threads an
  optional `hooks: HookRegistry` through `InlineEditManagerOptions` →
  `createInlineEditManager` → `commitDoc`/`patchFrontmatterFields`, sourced from
  `@dune/core`'s `AdminServicesContext` (requires `@dune/core` ≥0.31.5, which
  added `AdminServicesContext.hooks`). Optional and fire-and-forget
  (`.catch(() => {})`, matching `plugin-admin`'s own call site) so older
  `@dune/core` versions without `AdminServicesContext.hooks`, and any hook
  handler that throws, never affect the save itself.
- **`@dune/core` pin narrowed to `^0.31.6`.** `AdminServicesContext.hooks`
  doesn't exist before `0.31.5` — the previous bare `@0.31` pin's floor would
  type-check against a core version that predates this release's own dependency,
  the same JSR-oldest-version-in-range issue hit on previous releases.

## [2.1.6] — 2026-07-18

### Fixed

- **The `@dune/core` dependency range was stale (`^0.19`)**, unrelated to the
  actual `@dune/core@^0.25` this package has required since 2.1.5 — a site on a
  newer core loaded a second, older copy of `@dune/core` just for this plugin.
  Bumped to a bounded per-minor pin, `jsr:@dune/core@0.31` (auto-tracks patch
  releases within that minor), so Deno unifies it with the host site's pinned
  core version. An unbounded range (`@0`, any 0.x) was tried first and reverted:
  JSR validates a package's `jsr:` subpath imports against the _oldest_ version
  satisfying the declared range, not the newest, so an open floor resolves to
  the earliest `@dune/core` ever published and fails publish for any subpath
  that postdates it (this package's `@dune/core/inline-edit` didn't exist until
  core 0.16.3).
- **`minimumDependencyAge` now excludes `jsr:@dune/core`** from Deno's 24-hour
  freshness gate (default since Deno 2.9) — without this, a version bump
  immediately after a `@dune/core` release fails publish since the new core
  version is "too fresh." `@dune/core` is a same-org first-party dependency
  published by the same release process, so the supply-chain risk that gate
  protects against doesn't apply here. Scoped to just this one package so
  third-party npm dependencies keep the full 24-hour window.

## [2.1.5] — 2026-07-01

### Changed

- **WebSocket path updated to `/api/inline-edit/ws`** — the inline-edit admin
  bar now connects to the endpoint registered by `@dune/core` directly rather
  than deriving it from the admin prefix. Requires `@dune/core ^0.25`.

---

## [2.1.4] — 2026-06-16

### Fixed

- **Collaborative editing was non-functional** — the WebSocket sync handshake
  passed an invalid (genuinely empty) state vector into Y.js's update encoder,
  which threw on every connection attempt and on every broadcast of an edit to
  other connected editors. Inline editing's local UI (TipTap, bubble menu,
  toolbar) appeared to work normally because none of it depends on the WebSocket
  layer, but the real-time Y.js sync and persistence path was silently broken.
  Connections now complete the sync handshake correctly.
- **Idle-session GC leaked a timer per evicted document** — each editing
  session's `Awareness` instance starts its own cleanup interval that was never
  stopped when the session was garbage-collected after 5 minutes of inactivity.
  Long-running servers editing many documents over time would accumulate one
  leaked timer per evicted session. The interval is now stopped alongside the
  session's Y.Doc.
- Added test coverage (`tests/`) for the persistence path: frontmatter/body
  splicing, commit and field-patch flows against real storage and history, Y.js
  draft load/persist/delete round-trips, and end-to-end WebSocket sync tests
  that exercise the real wire protocol — these caught both fixes above.

---

## [2.1.3] — 2026-06-14

### Fixed

- **Editor bundle cache-busting** — the admin bar's dynamic `import()` of the
  editor bundle now appends `?v={pluginVersion}` to the URL. This ensures the
  browser fetches a fresh copy whenever the plugin is upgraded, rather than
  serving a stale `max-age=3600` cached bundle.

---

## [2.1.2] — 2026-06-13

### Fixed

- **Internal version field corrected** — `mod.ts` now reports `"2.1.2"` matching
  the package version, so the bundle cache key (`inline-edit-2.1.2-editor-*.js`)
  will always correspond to the correct editor build.

---

## [2.1.1] — 2026-06-13

### Fixed

- **Bundle cache never invalidated** — the plugin's internal `version` field in
  `mod.ts` was still `"1.0.0"` (never updated since the initial release), so
  Dune's client-bundle cache always found a stale hit and served the 1.0.0
  editor bundle regardless of the installed JSR version. The internal version
  now matches the package version and will be kept in sync going forward.

---

## [2.1.0] — 2026-06-13

### Added

- **Bubble formatting toolbar** — selecting text while body editing shows a
  floating toolbar above the selection with buttons for Bold, Italic,
  Strikethrough, Inline code, H1/H2/H3, Bullet list, Ordered list, Task list,
  Blockquote, Code block, Link, Image, and Table. Buttons reflect the active
  mark/node at the cursor. Link and Image switch the toolbar to a URL-input
  sub-view that stays open while the user types (via tippy's `interactive`
  option); confirming sets the mark/inserts the node and returns to the
  formatting bar.
- **Link support** — `@tiptap/extension-link` preserves `[text](url)` markdown
  syntax through edit sessions. `openOnClick: false` lets links be selected and
  edited rather than followed.
- **Image support** — `@tiptap/extension-image` preserves `![alt](url)` image
  syntax. Images can be inserted via the toolbar URL-input flow.
- **Table support** — `@tiptap/extension-table` (+ row/cell/header) adds
  markdown GFM table editing. The toolbar inserts a 3×3 table with a header row;
  existing tables in markdown round-trip losslessly.
- **Task list support** — `@tiptap/extension-task-list` + `task-item` adds GFM
  `- [ ] task` / `- [x] done` syntax with nested task support.
- **Placeholder** — `@tiptap/extension-placeholder` shows a subtle hint in an
  empty editor.

---

## [2.0.0] — 2026-06-12

Requires `@dune/core` ≥ 0.19.

### Breaking Changes

- **`./ui/editable` export removed** — the Preact island component kit is gone.
  Themes now opt in through the `data-dune-*` marker vocabulary, written as raw
  attributes or rendered with the server-only marker components from
  `@dune/core/ui/editable`. Templates never import from this plugin anymore, so
  the site `deno.json` import-map entry can be dropped.

### Changed

- **Marker-based architecture** — the plugin consumes markers from the rendered
  HTML. Body editing requires an explicit `data-dune-body` marker; the
  container-detection heuristic and the lossy HTML→Markdown walker are removed —
  markdown round-trips losslessly via tiptap-markdown.
- **Editing activates from a floating ✎ Edit handle**, never by clicking
  content, so links inside editable regions stay followable.
- **Editor ships via core's `clientEntries`** — the TipTap/Y.js editor is
  bundled by core at startup, served at `/plugins/inline-edit/editor.js`, and
  lazy-imported on first body edit. Syncs through the existing WebSocket wire
  protocol with presence display and CRDT merging; falls back to standalone
  editing + fields-API save when the socket is unavailable.

## [1.0.0] — 2026-06-11

Initial release: inline editing extracted from `@dune/core` (≤ 0.16) into a
plugin — Y.js sessions, WebSocket sync, admin bar injection, and the Preact
island component kit at `./ui/editable`.
