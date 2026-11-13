/**
 * Against a real core: the plugin's `editor.inline` slot is what enables core's
 * `/api/inline-edit/ws` route (501 without it, WebSocket checks with it).
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { bootstrap } from "jsr:@dune/core@^0.37.0/bootstrap";
import { createDuneApp } from "jsr:@dune/core@^0.37.0/fresh-app";
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
    const ctx = await bootstrap(root, { plugins: plugins as any });
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
      assertEquals(ctx.capabilities.get("editor.inline"), undefined);
      const res = await handler(new Request("http://localhost/api/inline-edit/ws"));
      assertEquals(res.status, 501);
    });
  },
);

Deno.test(
  "with the plugin core resolves the editor.inline slot and the route proceeds to the WebSocket checks",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    await withSite([plugin], async (ctx, handler) => {
      assertEquals(ctx.capabilities.providers().find((p) => p.name === "editor.inline"), {
        name: "editor.inline",
        kind: "slot",
        provider: "inline-edit",
        status: "active",
      });
      const res = await handler(new Request("http://localhost/api/inline-edit/ws"));
      assertEquals(res.status, 426);
    });
  },
);

// ── End to end: a site user edits with no admin plugin ─────────────────────────

import { createLocalUserStore } from "jsr:@dune/core@^0.37.0/auth/user-store";
import { createSessionManager, createSessionStore } from "jsr:@dune/core@^0.37.0/session";
import { createStorage } from "jsr:@dune/core@^0.37.0/storage";

const opts = { sanitizeOps: false, sanitizeResources: false };

/** A site with a login, an editor and a plain member, and this plugin; no admin. */
async function withLogin(
  fn: (api: {
    handler: (req: Request) => Promise<Response>;
    cookies: { editor: string; member: string };
    read: () => Promise<string>;
  }) => Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: "dune_inline_edit_login_" });
  try {
    await Deno.mkdir(join(root, "content", "01.home"), { recursive: true });
    await Deno.writeTextFile(join(root, "content", "01.home", "default.md"), "---\ntitle: Home\n---\n\nHello\n");
    await Deno.mkdir(join(root, "config"), { recursive: true });
    await Deno.writeTextFile(join(root, "config", "site.yaml"), "title: T\nurl: http://localhost\nauth:\n  mode: dune\n");
    const users = createLocalUserStore({ storage: createStorage({ rootDir: root }), usersDir: "data/users" });
    const ids = {
      editor: (await users.create({ email: "e@example.com", provider: "local", roles: ["editor"] })).id,
      member: (await users.create({ email: "m@example.com", provider: "local", roles: ["member"] })).id,
    };
    // deno-lint-ignore no-explicit-any
    const ctx = await bootstrap(root, { plugins: [plugin] as any });
    const { app } = await createDuneApp(ctx, { root, port: 0, dev: false });
    const sessions = createSessionManager(
      await createSessionStore({
        type: "local",
        storage: ctx.storage,
        sessionsDir: ".dune/admin/site-sessions",
        lifetimeMs: 60_000,
      }),
      60_000,
    );
    const cookie = async (id: string) => `dune_auth=${(await sessions.create(id)).id}`;
    await fn({
      handler: app.handler(),
      cookies: { editor: await cookie(ids.editor), member: await cookie(ids.member) },
      read: () => Deno.readTextFile(join(root, "content", "01.home", "default.md")),
    });
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
}

const PAGE = "01.home%2Fdefault.md";

Deno.test("a site user who may edit gets the bar and can read, patch and commit through /api/inline-edit", opts, async () => {
  await withLogin(async ({ handler, cookies, read }) => {
    // The bar is on the page, with no admin anywhere.
    const page = await handler(new Request("http://localhost/", { headers: { cookie: cookies.editor } }));
    const html = await page.text();
    assertEquals(html.includes('id="dune-admin-bar"'), true);
    assertEquals(html.includes(`/api/inline-edit/content/${PAGE}/commit`), true);

    // Plain visitors and members get no bar and no data-dune markers.
    for (const headers of [{} as Record<string, string>, { cookie: cookies.member }]) {
      const other = await (await handler(new Request("http://localhost/", { headers }))).text();
      assertEquals(other.includes("dune-admin-bar"), false);
    }

    const source = await handler(
      new Request(`http://localhost/api/inline-edit/content/${PAGE}/source`, { headers: { cookie: cookies.editor } }),
    );
    assertEquals(source.status, 200);
    assertEquals((await source.json()).body.trim(), "Hello");

    const patch = await handler(
      new Request(`http://localhost/api/inline-edit/content/${PAGE}/fields`, {
        method: "PATCH",
        headers: { cookie: cookies.editor, origin: "http://localhost" },
        body: JSON.stringify({ fields: { title: "Renamed" } }),
      }),
    );
    assertEquals(patch.status, 200);
    assertEquals((await read()).includes("title: Renamed"), true);
  });
});

Deno.test("a member, an anonymous visitor and a cross-origin write are all refused", opts, async () => {
  await withLogin(async ({ handler, cookies, read }) => {
    const url = `http://localhost/api/inline-edit/content/${PAGE}/fields`;
    const body = JSON.stringify({ fields: { title: "Hacked" } });
    const patch = (headers: Record<string, string>) =>
      handler(new Request(url, { method: "PATCH", headers: { origin: "http://localhost", ...headers }, body }));
    assertEquals((await patch({})).status, 401);
    assertEquals((await patch({ cookie: cookies.member })).status, 403);
    assertEquals((await patch({ cookie: cookies.editor, origin: "http://evil.test" })).status, 403);
    assertEquals((await read()).includes("Hacked"), false);
  });
});
