/**
 * Against a real core: the plugin's `inline-edit` slot is what enables core's
 * `/api/inline-edit/ws` route (501 without it, WebSocket checks with it).
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { bootstrap } from "@dune/core/bootstrap";
import { createDuneApp } from "@dune/core/fresh-app";
import plugin from "../src/mod.ts";

async function withSite(
  plugins: unknown[],
  fn: (ctx: Awaited<ReturnType<typeof bootstrap>>, handler: (req: Request) => Promise<Response>) => Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: "dune_inline_edit_core_" });
  try {
    await Deno.mkdir(join(root, "content", "01.home"), { recursive: true });
    await Deno.writeTextFile(join(root, "content", "01.home", "default.md"), "---\ntitle: Home\n---\n\nHello\n");
    // deno-lint-ignore no-explicit-any
    const ctx = await bootstrap(root, { plugins: plugins as any, configOverrides: { admin: { enabled: false } as any } });
    const { app } = await createDuneApp(ctx, { root, port: 0, dev: false });
    await fn(ctx, app.handler());
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
}

Deno.test(
  "without the plugin the inline-edit WebSocket route is not enabled",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    await withSite([], async (ctx, handler) => {
      assertEquals(ctx.capabilities.get("inline-edit"), undefined);
      const res = await handler(new Request("http://localhost/api/inline-edit/ws"));
      assertEquals(res.status, 501);
    });
  },
);

Deno.test(
  "with the plugin core resolves the inline-edit slot and the route proceeds to the WebSocket checks",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    await withSite([plugin], async (ctx, handler) => {
      assertEquals(ctx.capabilities.providers().find((p) => p.name === "inline-edit"), {
        name: "inline-edit",
        kind: "slot",
        provider: "inline-edit",
        status: "active",
      });
      const res = await handler(new Request("http://localhost/api/inline-edit/ws"));
      assertEquals(res.status, 426);
    });
  },
);
