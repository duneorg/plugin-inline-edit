# @dune/plugin-inline-edit

Y.js-backed real-time inline content editing for [Dune CMS](https://jsr.io/@dune/core).

Provides everything inline editing needs, end to end:

- **Server side** — Y.js document sessions, WebSocket sync, debounced
  auto-flush to content history, commit/patch write-back to Markdown files
- **Admin bar injection** — injects the editing toolbar and overlay script
  for authenticated admins with edit rights (via core's `transformResponse`
  plugin hook)
- **Editor client** — a TipTap WYSIWYG editor over the page's Markdown
  source, bundled by core from this plugin's `clientEntries` and
  lazy-imported only when a body edit starts

Core defines the service interface and hosts the authenticated admin
endpoints; this plugin supplies the implementation. Without it, Dune's
inline-edit endpoints respond 501 and no edit chrome is injected.

## Installation

Requires `@dune/core` ≥ 0.19.

Add the plugin to your site's `site.yaml`:

```yaml
plugins:
  - src: "jsr:@dune/plugin-inline-edit"
```

That's it — templates never import from this plugin, so no `deno.json`
import-map entry is needed.

## How themes opt in: markers

The plugin consumes the `data-dune-*` marker vocabulary from the rendered
HTML (see `@dune/core/ui/editable`). A theme marks the element wrapping the
rendered markdown body:

```tsx
<article>
  <h1>{page.title}</h1>
  <div data-dune-body dangerouslySetInnerHTML={{ __html: page.html }} />
</article>
```

or uses core's typed marker components, which render exactly the same
attributes:

```tsx
import { EditableText, EditableMarkdown } from "@dune/core/ui/editable";

<article>
  <h1>
    <EditableText field="title" sourcePath={page.sourcePath}>{page.title}</EditableText>
  </h1>
  <EditableMarkdown sourcePath={page.sourcePath}>
    <div dangerouslySetInnerHTML={{ __html: page.html }} />
  </EditableMarkdown>
</article>
```

The page title (first `<h1>`) is detected automatically; opt out per element
with `data-dune-no-edit`. The body is never guessed — without a
`data-dune-body` marker, body editing is unavailable for that page.

For admins, editing starts from a floating **✎ Edit** handle, so links inside
editable regions stay followable. Core scrubs all markers from HTML served to
anyone without a validated editing session — anonymous visitors get plain
markup and load no editor code.

## License

MIT
