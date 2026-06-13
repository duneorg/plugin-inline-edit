/**
 * @dune/plugin-inline-edit
 *
 * Inline content editing plugin for Dune CMS.
 *
 * Consumes the `data-dune-*` marker vocabulary (see `@dune/core/ui/editable`):
 * the admin bar script annotates the first `<h1>` as the title field and
 * activates editors on elements marked `data-dune-body` / `data-dune-field`.
 * Body editing is TipTap WYSIWYG over the markdown source (lazy-loaded from
 * esm.sh, admin-only); titles and plain fields edit in place. Server side it
 * provides session management, WebSocket sync, and Y.js document persistence.
 *
 * Templates never import from this plugin — they mark editable regions with
 * attributes (or core's typed marker components), and any editor plugin can
 * consume them.
 *
 * ## Installation
 *
 * Add to your site's `site.yaml`:
 * ```yaml
 * plugins:
 *   - src: "jsr:@dune/plugin-inline-edit"
 * ```
 *
 * And add to your site's `deno.json` imports:
 * ```json
 * {
 *   "imports": {
 *     "@dune/plugin-inline-edit": "jsr:@dune/plugin-inline-edit@^1"
 *   }
 * }
 * ```
 *
 * @module
 * @since 1.0.0
 */

import type { DunePlugin } from "@dune/core/plugins";
import { createInlineEditManager } from "./manager.ts";
import { injectAdminBar } from "./bar.ts";

const plugin: DunePlugin = {
  name: "inline-edit",
  version: "2.1.2",
  description: "Y.js-backed real-time inline content editing (TipTap WYSIWYG) with admin bar.",
  hooks: {},

  // Browser editor bundle — built by core at startup (deno bundle, resolving
  // this plugin's own TipTap/Y.js deps) and served at
  // /plugins/inline-edit/editor.js. Lazy-imported by the admin bar script.
  clientEntries: {
    editor: import.meta.resolve("./client/editor.ts"),
  },

  adminServices({ storage, history, dataDir, contentDir }) {
    return {
      inlineEdit: createInlineEditManager({ storage, history, dataDir, contentDir }),
    };
  },

  async transformResponse({ req, response, auth, page, adminPrefix }) {
    // Only inject for authenticated admins with edit rights on content pages.
    if (!auth || !auth.hasPermission("pages.update")) return response;
    if (!page) return response;

    // Only inject into HTML responses.
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.includes("text/html")) return response;

    // Never inject into admin paths.
    const url = new URL(req.url);
    if (url.pathname.startsWith(adminPrefix)) return response;

    return injectAdminBar(response, {
      sourcePath: page.sourcePath,
      pageTitle: page.title,
      adminPrefix,
      userName: auth.username,
    });
  },
};

export default plugin;

export { createInlineEditManager } from "./manager.ts";
export type {
  InlineEditClient,
  InlineEditManagerOptions,
  InlineEditSession,
} from "./types.ts";
