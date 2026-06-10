/**
 * @dune/plugin-inline-edit
 *
 * Y.js-backed real-time inline content editing plugin for Dune CMS.
 *
 * Provides server-side session management, WebSocket sync, Y.js document
 * persistence, and admin bar injection. The client side (TipTap WYSIWYG,
 * Preact island components) lives in `@dune/core/ui/editable`.
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
  version: "1.0.0",
  description: "Y.js-backed real-time inline content editing (TipTap WYSIWYG) with admin bar.",
  hooks: {},

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
