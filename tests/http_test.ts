/**
 * The routes below /api/inline-edit/: source, commit, fields. Core has already
 * decided who may edit; these tests cover what the plugin decides on top.
 */

import { assertEquals } from "@std/assert";
import { createRequestHandler } from "../src/http.ts";

const PAGE = "pages%2Fabout%2Fdefault.md";
const FILE = "pages/about/default.md";

function setup(
  opts: { allowTsxFormat?: string[]; frontmatter?: Record<string, unknown> | null } = {},
) {
  const calls: unknown[][] = [];
  const handle = createRequestHandler({
    storage: {
      readText: (p: string) => {
        if (p !== `content/${FILE}`) return Promise.reject(new Error("missing"));
        return Promise.resolve("---\ntitle: About\n---\n\nHello\n");
      },
    } as never,
    contentDir: "content",
    allowTsxFormat: opts.allowTsxFormat,
    commit: (...a) => (calls.push(["commit", ...a]), Promise.resolve()),
    patchFields: (...a) => (calls.push(["fields", ...a]), Promise.resolve()),
  });
  const frontmatter = opts.frontmatter === undefined ? { title: "About" } : opts.frontmatter;
  const run = (
    method: string,
    path: string,
    editor: { id?: string; roles: string[]; relation?: "admin" | "editor" | "author" } = {
      roles: ["editor"],
    },
    body?: unknown,
  ) =>
    handle(
      new Request(`http://localhost/api/inline-edit/${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      {
        editor: {
          id: editor.id ?? "u1",
          username: "alice",
          roles: editor.roles,
          // Core decides this from the site's role_grants; by default a role name is its own relation.
          relation: editor.relation ?? (editor.roles.includes("admin")
            ? "admin"
            : editor.roles.includes("editor")
            ? "editor"
            : "author"),
          source: "site",
        },
        path,
        pageFrontmatter: () => Promise.resolve(frontmatter),
      },
    );
  return { run, calls };
}

Deno.test("source: returns the Markdown body without frontmatter", async () => {
  const { run } = setup();
  const res = await run("GET", `content/${PAGE}/source`);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { body: "\nHello\n" });
});

Deno.test("commit: POST commits as the editor's name", async () => {
  const { run, calls } = setup();
  const res = await run("POST", `content/${PAGE}/commit`);
  assertEquals(res.status, 200);
  assertEquals(calls, [["commit", FILE, "alice"]]);
});

Deno.test("fields: PATCH writes the given fields", async () => {
  const { run, calls } = setup();
  const res = await run("PATCH", `content/${PAGE}/fields`, undefined, { fields: { title: "New" } });
  assertEquals(res.status, 200);
  assertEquals(calls, [["fields", FILE, { title: "New" }, "alice"]]);
});

Deno.test("fields: a body that is not { fields: {} } is a 400, bad JSON too", async () => {
  const { run, calls } = setup();
  assertEquals(
    (await run("PATCH", `content/${PAGE}/fields`, undefined, { fields: "x" })).status,
    400,
  );
  assertEquals((await run("PATCH", `content/${PAGE}/fields`, undefined, { nope: 1 })).status, 400);
  assertEquals(
    (await run("PATCH", `content/${PAGE}/fields`, undefined, { fields: [] })).status,
    400,
  );
  assertEquals(calls, []);
});

Deno.test("wrong method, unknown action and unknown root are 405 / 404", async () => {
  const { run } = setup();
  assertEquals((await run("POST", `content/${PAGE}/source`)).status, 405);
  assertEquals((await run("GET", `content/${PAGE}/commit`)).status, 405);
  assertEquals((await run("POST", `content/${PAGE}/fields`)).status, 405);
  assertEquals((await run("POST", `content/${PAGE}/other`)).status, 404);
  assertEquals((await run("GET", `other/${PAGE}/source`)).status, 404);
  assertEquals((await run("GET", `content/${PAGE}`)).status, 404);
});

Deno.test("a path that escapes the content directory is refused", async () => {
  const { run, calls } = setup();
  for (
    const bad of [
      "..%2Fsecret.md",
      "%2Fetc%2Fpasswd",
      "pages%2F..%2Fx.md",
      "a%5Cb.md",
      "pages%2F%2Fx.md",
      "%E0%A4%A",
    ]
  ) {
    assertEquals((await run("POST", `content/${bad}/commit`)).status, 400, bad);
  }
  assertEquals(calls, []);
});

Deno.test("an author writes only a page they created; admin and editor write any", async () => {
  const mine = setup({ frontmatter: { createdBy: "u1" } });
  assertEquals(
    (await mine.run("POST", `content/${PAGE}/commit`, { roles: ["author"] })).status,
    200,
  );
  const theirs = setup({ frontmatter: { createdBy: "someone-else" } });
  assertEquals(
    (await theirs.run("POST", `content/${PAGE}/commit`, { roles: ["author"] })).status,
    403,
  );
  assertEquals(
    (await theirs.run("PATCH", `content/${PAGE}/fields`, { roles: ["author"] }, { fields: {} }))
      .status,
    403,
  );
  assertEquals(theirs.calls, []);
  for (const role of ["editor", "admin"]) {
    assertEquals(
      (await theirs.run("POST", `content/${PAGE}/commit`, { roles: [role] })).status,
      200,
      role,
    );
  }
});

Deno.test("a role list that mixes tags with an editing role counts as that role", async () => {
  const { run } = setup({ frontmatter: { createdBy: "someone-else" } });
  assertEquals(
    (await run("POST", `content/${PAGE}/commit`, { roles: ["member", "editor"] })).status,
    200,
  );
});

Deno.test("a path that is not a page is 404 for writes", async () => {
  const { run, calls } = setup({ frontmatter: null });
  assertEquals((await run("POST", `content/${PAGE}/commit`)).status, 404);
  assertEquals((await run("POST", `content/${PAGE}/commit`, { roles: ["author"] })).status, 404);
  assertEquals(calls, []);
});

Deno.test("TSX pages: only the roles named for them may write; the default is admin only", async () => {
  const tsx = "pages%2Fapp%2Fdefault.tsx";
  const dflt = setup();
  assertEquals(
    (await dflt.run("POST", `content/${tsx}/commit`, { roles: ["editor"] })).status,
    403,
  );
  assertEquals((await dflt.run("POST", `content/${tsx}/commit`, { roles: ["admin"] })).status, 200);
  const widened = setup({ allowTsxFormat: ["admin", "editor"] });
  assertEquals(
    (await widened.run("POST", `content/${tsx}/commit`, { roles: ["editor"] })).status,
    200,
  );
  const none = setup({ allowTsxFormat: [] });
  assertEquals((await none.run("POST", `content/${tsx}/commit`, { roles: ["admin"] })).status, 403);
});

Deno.test("a failing commit is a 500 that does not leak the error", async () => {
  const handle = createRequestHandler({
    storage: {} as never,
    contentDir: "content",
    commit: () => Promise.reject(new Error("disk /secret/path full")),
    patchFields: () => Promise.resolve(),
  });
  const res = await handle(new Request("http://localhost/x", { method: "POST" }), {
    editor: { id: "u1", username: "alice", roles: ["admin"], relation: "admin", source: "site" },
    path: `content/${PAGE}/commit`,
    pageFrontmatter: () => Promise.resolve({}),
  });
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "Internal error" });
});

Deno.test("ownership follows the relation core decided, not the role name: a mapped group is an editor", async () => {
  const theirs = setup({ frontmatter: { createdBy: "someone-else" } });
  // role_grants: { staff: editor } makes "staff" an editor relation, so it may write any page...
  assertEquals(
    (await theirs.run("POST", `content/${PAGE}/commit`, { roles: ["staff"], relation: "editor" }))
      .status,
    200,
  );
  // ...and an "editor" role the site mapped down to author is limited to its own pages.
  assertEquals(
    (await theirs.run("POST", `content/${PAGE}/commit`, { roles: ["editor"], relation: "author" }))
      .status,
    403,
  );
});
