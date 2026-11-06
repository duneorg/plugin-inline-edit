/**
 * The plugin meets core through the capability registry: it provides the
 * `inline-edit` slot in `setup()` and renders the `bar.actions` contributions
 * that arrive as `ResponseTransformContext.barActions`.
 */

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { createHistoryEngine, createStorage } from "@dune/core";
import plugin from "../src/mod.ts";

Deno.test("setup() provides the inline-edit slot, built from the capability context", async () => {
  const provided: Record<string, (ctx: unknown) => unknown> = {};
  // deno-lint-ignore no-explicit-any
  (plugin.setup as any)({
    capabilities: {
      provide: (name: string, factory: (ctx: unknown) => unknown) => {
        provided[name] = factory;
      },
      contribute: () => {},
    },
  });
  assertEquals(Object.keys(provided), ["editor.inline"]);

  const root = await Deno.makeTempDir({ prefix: "dune_inline_edit_caps_" });
  try {
    const storage = createStorage({ rootDir: root });
    const manager = provided["editor.inline"]({
      storage,
      history: createHistoryEngine({ storage, maxRevisions: 5, dataDir: ".dune/history" } as never),
      dataDir: ".dune/admin",
      contentDir: "content",
      hooks: undefined,
    }) as { handleUpgrade?: unknown; commit?: unknown; getPresence?: unknown };
    assertExists(manager);
    assertEquals(typeof manager.handleUpgrade, "function");
    assertEquals(typeof manager.commit, "function");
    assertEquals(typeof manager.getPresence, "function");
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
});

Deno.test("transformResponse renders the buttons delivered as barActions", async () => {
  const response = new Response("<html><body><h1>Hi</h1></body></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // deno-lint-ignore no-explicit-any
  const out = await (plugin.transformResponse as any)({
    req: new Request("http://localhost/about"),
    response,
    auth: { username: "alice", role: "admin", hasPermission: () => true },
    page: { sourcePath: "content/about.md", route: "/about", title: "About", template: "post" },
    adminPrefix: "/admin",
    config: {},
    barActions: [
      () => [{ id: "pdf:download", label: "PDF export", href: "/pdf/about" }],
      ({ page }: { page: { template: string } | null }) =>
        page?.template === "post" ? [{ id: "x:post-only", label: "Post only", href: "/x" }] : [],
    ],
  }) as Response;
  const html = await out.text();
  assertStringIncludes(html, "PDF export");
  assertStringIncludes(html, "Post only");
});

Deno.test("transformResponse does nothing for visitors without edit rights", async () => {
  const response = new Response("<html><body>x</body></html>", { headers: { "Content-Type": "text/html" } });
  // deno-lint-ignore no-explicit-any
  const out = await (plugin.transformResponse as any)({
    req: new Request("http://localhost/about"),
    response,
    auth: null,
    page: { sourcePath: "content/about.md", route: "/about", title: "About", template: "post" },
    adminPrefix: "/admin",
    config: {},
    barActions: [() => [{ id: "a", label: "Never shown", href: "/a" }]],
  }) as Response;
  assertEquals(out, response);
});
