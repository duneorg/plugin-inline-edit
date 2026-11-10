/**
 * The bar's extension point.
 *
 * This plugin renders the editing bar and is the only reader of `bar.actions`,
 * so it declares the key (and its types) itself instead of core's contract
 * carrying it. A plugin that adds a button imports the key and the types from
 * `@dune/plugin-inline-edit` (or recreates the key from the name `bar.actions`):
 *
 * ```ts
 * import { BAR_ACTIONS } from "@dune/plugin-inline-edit";
 * api.capabilities.contribute(BAR_ACTIONS, ({ page }) =>
 *   page ? [{ id: "pdf:download", label: "PDF", href: `/pdf${page.route}` }] : []);
 * ```
 *
 * @module
 */

import { type CapabilityKey, capabilityKey } from "@dune/core/plugin-api";

/**
 * Context passed to a `bar.actions` contribution: what belongs on the bar for
 * this response. A plugin that links to its own pages builds the URLs itself
 * (the admin knows its prefix); the bar passes none.
 *
 * @since 3.0.0
 */
export interface BarActionContext {
  /** Content page matching the current URL, or null for non-content routes. */
  page: { sourcePath: string; route: string; title: string | null; template: string } | null;
}

/**
 * A button contributed to the editing bar through the `bar.actions`
 * contribution point. This plugin owns the bar; the contributing plugin controls
 * only the button's appearance and behavior, not its position or styling.
 *
 * @since 3.0.0
 */
export interface BarAction {
  /**
   * Unique id — namespace by plugin name to avoid collisions across
   * plugins, e.g. `"pdf-export:download"`.
   */
  id: string;
  /** Button label. */
  label: string;
  /** Optional emoji/icon prefix. */
  icon?: string;
  /**
   * Renders as a plain link (`<a href>`) when set — the common case for
   * downloads and navigation. Mutually exclusive with `onClick`; `href`
   * takes precedence if both are set.
   */
  href?: string;
  /**
   * Renders as a `<button>` running this literal JavaScript on click, when
   * `href` is not set. Trusted content from a loaded plugin, not user
   * input — no sanitization is applied, the same trust level as any other
   * server-rendered admin-only script.
   */
  onClick?: string;
}

/**
 * The bar's contribution point: each contributing plugin adds one function that
 * returns its buttons for a response. Consumer: this plugin.
 */
export const BAR_ACTIONS: CapabilityKey<(ctx: BarActionContext) => BarAction[]> = capabilityKey("bar.actions");
