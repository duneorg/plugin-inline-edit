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
import { BAR_ACTIONS } from "./bar-actions.ts";

const plugin: DunePlugin = {
  name: "inline-edit",
  version: "2.2.3",
  description: "Y.js-backed real-time inline content editing (TipTap WYSIWYG) with an editing bar, for any signed-in editor.",
  hooks: {},

  // Browser editor bundle — built by core at startup (deno bundle, resolving
  // this plugin's own TipTap/Y.js deps) and served at
  // /plugins/inline-edit/editor.js. Lazy-imported by the admin bar script.
  clientEntries: {
    editor: import.meta.resolve("./client/editor.ts"),
  },

  // The `editor.inline` capability: core gates `/api/inline-edit/*` (who may
  // edit, same-origin writes) and hands the WebSocket upgrade and every other
  // request to this manager; the admin uses it for its collab socket and
  // presence. Core builds it once the history engine and storage exist.
  setup(api) {
    api.capabilities.provide(
      "editor.inline",
      ({ storage, history, dataDir, contentDir, hooks, config }) =>
        createInlineEditManager({
          storage,
          history,
          dataDir,
          contentDir,
          hooks,
          allowTsxFormat: config.system.content.allow_tsx_format,
        }),
    );
  },

  transformResponse({ req, response, auth, page, capabilities }) {
    // Only inject for signed-in editors (a site user or the admin's user, core has
    // checked pages.update) on content pages.
    if (!auth || !auth.hasPermission("pages.update")) return response;
    if (!page) return response;

    // Only inject into HTML responses.
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.includes("text/html")) return response;

    // Never inject into the admin's own pages (core keeps transforms off them
    // already). Read per request: this module is shared between sites.
    const adminPrefix = capabilities.get("admin.prefix")?.prefix;
    if (adminPrefix && new URL(req.url).pathname.startsWith(adminPrefix)) return response;

    // Buttons any plugin contributed to the `bar.actions` point. This bar
    // renders them without knowing what they do.
    const actions = capabilities.list(BAR_ACTIONS).flatMap((contribute) => contribute({ page }));

    return injectAdminBar(response, {
      sourcePath: page.sourcePath,
      pageTitle: page.title,
      userName: auth.username,
      pluginVersion: plugin.version,
      actions,
    });
  },
};

export default plugin;

export { createInlineEditManager } from "./manager.ts";
export { BAR_ACTIONS } from "./bar-actions.ts";
export type { BarAction, BarActionContext } from "./bar-actions.ts";
export type {
  InlineEditClient,
  InlineEditManagerOptions,
  InlineEditSession,
} from "./types.ts";
