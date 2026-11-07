/**
 * The plugin meets core through the capability registry: it provides the
 * `editor.inline` slot in `setup()` and renders the `bar.actions` contributions
 * it reads from `ResponseTransformContext.capabilities`.
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

/** A reader holding the `admin.prefix` slot and the given `bar.actions` contributions. */
function reader(barActions: unknown[], prefix: string | null = "/admin") {
  return {
    get: (name: string) => (name === "admin.prefix" && prefix ? { prefix } : undefined),
    list: (point: string) => (point === "bar.actions" ? barActions : []),
    providers: () => [],
  };
}

Deno.test("transformResponse renders the buttons read from the bar.actions contributions", async () => {
  const response = new Response("<html><body><h1>Hi</h1></body></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // deno-lint-ignore no-explicit-any
  const out = await (plugin.transformResponse as any)({
    req: new Request("http://localhost/about"),
    response,
    auth: { username: "alice", role: "admin", hasPermission: () => true },
    page: { sourcePath: "content/about.md", route: "/about", title: "About", template: "post" },
    config: {},
    capabilities: reader([
      () => [{ id: "pdf:download", label: "PDF export", href: "/pdf/about" }],
      ({ page }: { page: { template: string } | null }) =>
        page?.template === "post" ? [{ id: "x:post-only", label: "Post only", href: "/x" }] : [],
    ]),
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
    config: {},
    capabilities: reader([() => [{ id: "a", label: "Never shown", href: "/a" }]]),
  }) as Response;
  assertEquals(out, response);
});

Deno.test("transformResponse injects nothing when no plugin provides admin.prefix", async () => {
  const response = new Response("<html><body>x</body></html>", { headers: { "Content-Type": "text/html" } });
  // deno-lint-ignore no-explicit-any
  const out = await (plugin.transformResponse as any)({
    req: new Request("http://localhost/about"),
    response,
    auth: { username: "alice", role: "admin", hasPermission: () => true },
    page: { sourcePath: "content/about.md", route: "/about", title: "About", template: "post" },
    config: {},
    capabilities: reader([], null),
  }) as Response;
  assertEquals(out, response);
});

Deno.test("transformResponse skips the admin's own pages, using the prefix the admin provides", async () => {
  const response = new Response("<html><body>x</body></html>", { headers: { "Content-Type": "text/html" } });
  // deno-lint-ignore no-explicit-any
  const out = await (plugin.transformResponse as any)({
    req: new Request("http://localhost/panel/pages"),
    response,
    auth: { username: "alice", role: "admin", hasPermission: () => true },
    page: { sourcePath: "content/about.md", route: "/about", title: "About", template: "post" },
    config: {},
    capabilities: reader([], "/panel"),
  }) as Response;
  assertEquals(out, response);
});
