/**
 * The plugin's HTTP routes, below `/api/inline-edit/`.
 *
 * Core has already authenticated the editor, checked `pages.update` and the
 * origin of writes (see `InlineEditManager.handleRequest`); what is left is
 * what is specific to a page: which files this editor may write.
 *
 *   GET   content/:encodedSourcePath/source   the Markdown body, no frontmatter
 *   POST  content/:encodedSourcePath/commit   flush the live session to history and disk
 *   PATCH content/:encodedSourcePath/fields   `{ fields: { title: "…", __body: "…" } }`
 *
 * `:encodedSourcePath` is the URL-encoded page source path,
 * e.g. `pages%2Fabout%2Fdefault.md`.
 *
 * @module
 */

import type { InlineEditRequestContext } from "@dune/core/inline-edit";
import type { StorageAdapter } from "@dune/core";
import { splitFile } from "./commit.ts";
import { warnThrottled } from "./log.ts";

/** Frontmatter key the admin stamps on create; the author of a page owns it. */
const PAGE_OWNER_KEY = "createdBy";

/** What the routes need from the manager that serves them. */
export interface RequestHandlerOptions {
  storage: StorageAdapter;
  contentDir: string;
  /** Roles that may write `.tsx` pages (`system.content.allow_tsx_format`); default admin only. */
  allowTsxFormat?: readonly string[];
  commit(sourcePath: string, author: string): Promise<void>;
  patchFields(sourcePath: string, fields: Record<string, unknown>, author: string): Promise<void>;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * A page path from a URL: relative, no traversal, nothing outside
 * `[a-zA-Z0-9._@-]` per segment.
 */
export function validatePagePath(p: string): boolean {
  if (p.length === 0 || p.length > 1024) return false;
  if (p.includes("\0") || p.includes("\\") || p.startsWith("/")) return false;
  const lower = p.toLowerCase();
  if (lower.includes("%2e%2e") || lower.includes("%00")) return false;
  if (/^[a-zA-Z]:\//.test(p)) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== ".." && /^[a-zA-Z0-9._@-]+$/.test(seg));
}

/** Build `InlineEditManager.handleRequest`. */
export function createRequestHandler(opts: RequestHandlerOptions) {
  const { storage, contentDir, commit, patchFields } = opts;
  const allowTsx = opts.allowTsxFormat ?? ["admin"];

  return async function handleRequest(req: Request, ctx: InlineEditRequestContext): Promise<Response> {
    const parts = ctx.path.split("/");
    if (parts.length !== 3 || parts[0] !== "content") return json({ error: "Not found" }, 404);

    let sourcePath: string;
    try {
      sourcePath = decodeURIComponent(parts[1]);
    } catch {
      return json({ error: "Invalid path" }, 400);
    }
    if (!validatePagePath(sourcePath)) return json({ error: "Invalid path" }, 400);
    const action = parts[2];

    if (action === "source") {
      if (req.method !== "GET") return json({ error: "Use GET" }, 405);
      return await readSource(sourcePath);
    }
    if (action !== "commit" && action !== "fields") return json({ error: "Not found" }, 404);
    const expected = action === "commit" ? "POST" : "PATCH";
    if (req.method !== expected) return json({ error: `Use ${expected}` }, 405);

    // Writes: TSX executes server-side code, so only the roles named for it may
    // rewrite one; and authors may only write their own pages.
    const { editor } = ctx;
    if (/\.tsx$/i.test(sourcePath) && !editor.roles.some((r) => allowTsx.includes(r))) {
      return json({
        error: "TSX format requires admin role. TSX pages execute server-side code and must be edited by trusted authors.",
      }, 403);
    }
    // `relation` is core's decision from system.role_grants: admin and editor edit any page, an
    // author only the pages it created.
    if (editor.relation === "author") {
      const frontmatter = await ctx.pageFrontmatter(sourcePath);
      if (!frontmatter) return json({ error: "Page not found" }, 404);
      if (frontmatter[PAGE_OWNER_KEY] !== editor.id) return json({ error: "Forbidden" }, 403);
    } else if (!await ctx.pageFrontmatter(sourcePath)) {
      return json({ error: "Page not found" }, 404);
    }

    try {
      if (action === "commit") {
        await commit(sourcePath, editor.username);
        return json({ ok: true });
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      const fields = (body as { fields?: unknown } | null)?.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        return json({ error: "Body must be { fields: { ... } }" }, 400);
      }
      await patchFields(sourcePath, fields as Record<string, unknown>, editor.username);
      return json({ ok: true });
    } catch (err) {
      warnThrottled(`http:${action}`, `${action} failed`, err);
      return json({ error: "Internal error" }, 500);
    }
  };

  async function readSource(sourcePath: string): Promise<Response> {
    try {
      const raw = await storage.readText(`${contentDir}/${sourcePath}`);
      return json({ body: splitFile(raw).body });
    } catch (err) {
      warnThrottled("http:source", "source read failed", err);
      return json({ error: "Internal error" }, 500);
    }
  }
}
