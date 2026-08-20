import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAdminBarHtml } from "../src/bar.ts";

const baseOpts = {
  sourcePath: "03.arbeitswelt/01.test.mdx",
  pageTitle: "Test",
  adminPrefix: "/admin",
  userName: "admin",
  pluginVersion: "2.1.8",
};

Deno.test("buildAdminBarHtml: no actions — bar renders with no action elements", () => {
  const html = buildAdminBarHtml(baseOpts);
  // The CSS rule for .dune-ab-action is always present (static stylesheet);
  // what must be absent is an actual rendered element using that class.
  assertEquals(html.includes('class="dune-ab-action"'), false);
});

Deno.test("buildAdminBarHtml: href action renders as a link", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{ id: "pdf-export:download", label: "PDF", icon: "⬇", href: "/pdf/download?path=x" }],
  });
  assertStringIncludes(
    html,
    `<a id="pdf-export:download" class="dune-ab-action" href="/pdf/download?path=x">⬇ PDF</a>`,
  );
});

Deno.test("buildAdminBarHtml: onClick action renders as a button", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{ id: "my-plugin:open", label: "Open", onClick: "openModal('x')" }],
  });
  assertStringIncludes(
    html,
    `<button id="my-plugin:open" class="dune-ab-action" onclick="openModal('x')">Open</button>`,
  );
});

Deno.test("buildAdminBarHtml: href takes precedence over onClick when both are set", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{ id: "x", label: "X", href: "/x", onClick: "shouldNotRun()" }],
  });
  assertStringIncludes(html, `<a id="x" class="dune-ab-action" href="/x">X</a>`);
  assertEquals(html.includes("shouldNotRun"), false);
});

Deno.test("buildAdminBarHtml: label/icon/href are HTML-escaped", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{ id: "y", label: `<script>alert(1)</script>`, href: `/x?a="b"` }],
  });
  assertEquals(html.includes("<script>alert(1)</script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("buildAdminBarHtml: multiple actions render in order", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [
      { id: "a", label: "A", href: "/a" },
      { id: "b", label: "B", href: "/b" },
    ],
  });
  const aIdx = html.indexOf('id="a"');
  const bIdx = html.indexOf('id="b"');
  assertEquals(aIdx > -1 && bIdx > -1 && aIdx < bIdx, true);
});
