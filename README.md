# @dune/plugin-inline-edit

Y.js-backed real-time inline content editing for [Dune CMS](https://jsr.io/@dune/core).

Provides everything inline editing needs, end to end:

- **Server side** — Y.js document sessions, WebSocket sync, debounced
  auto-flush to content history, commit/patch write-back to Markdown files
- **Admin bar injection** — annotates rendered pages and injects the editing
  toolbar for authenticated admins with edit rights (via core's
  `transformResponse` plugin hook)
- **Component kit** (`./ui/editable`) — Preact islands for theme authors:
  `EditableText`, `EditableMarkdown` (TipTap WYSIWYG), `EditableImage`,
  `EditableDate`, `EditableField`, `AdminBar`, plus a field-editor registry

Core defines the service interface and hosts the authenticated admin
endpoints; this plugin supplies the implementation. Without it, Dune's
inline-edit endpoints respond 501 and no edit chrome is injected.

## Installation

Requires `@dune/core` ≥ 0.18.

Add the plugin to your site's `site.yaml`:

```yaml
plugins:
  - src: "jsr:@dune/plugin-inline-edit"
```

And to your site's `deno.json` imports (needed for theme component imports):

```json
{
  "imports": {
    "@dune/plugin-inline-edit": "jsr:@dune/plugin-inline-edit@^1"
  }
}
```

## Using the component kit in themes

```tsx
import { EditableText, EditableMarkdown } from "@dune/plugin-inline-edit/ui/editable";

export default function Article({ page }) {
  return (
    <article>
      <EditableText field="title" sourcePath={page.sourcePath}>
        <h1>{page.title}</h1>
      </EditableText>
      <EditableMarkdown sourcePath={page.sourcePath}>
        <div dangerouslySetInnerHTML={{ __html: page.html }} />
      </EditableMarkdown>
    </article>
  );
}
```

All components render their children verbatim for anonymous visitors — no
extra DOM, no JavaScript. The TipTap/Y.js editor stack is loaded lazily via
dynamic import only when an admin activates editing.

Themes that use no components still get click-to-edit: the admin bar's
auto-overlay annotates the first `<h1>` and the main content container
automatically. Opt out per element with `data-dune-no-edit`.

## License

MIT
