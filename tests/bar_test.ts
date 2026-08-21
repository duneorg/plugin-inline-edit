import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { annotateEditableElements, buildAdminBarHtml } from "../src/bar.ts";

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

Deno.test("buildAdminBarHtml: escape link and source overlay point at /pages/edit?path=..., not the nonexistent /pages/<path>", () => {
  // Regression test: adminPageUrl used to be `${adminPrefix}/pages/${encodedPath}`,
  // a route that was never registered (plugin-admin only has
  // /admin/pages/edit?path=... and /admin/pages/builder) — 404'd every time.
  const html = buildAdminBarHtml(baseOpts);
  const expectedUrl = "/admin/pages/edit?path=03.arbeitswelt%2F01.test.mdx";
  // The escape link is a real full-page navigation — no embedded=1, full
  // admin shell. The overlay iframe gets embedded=1 so plugin-admin's
  // _layout.tsx drops the redundant sidebar/topbar chrome (see its own
  // handling of that param).
  assertStringIncludes(html, `<a href="${expectedUrl}" class="dune-ab-escape"`);
  assertStringIncludes(
    html,
    `window.__DUNE_ADMIN_PAGE_URL__ = ${
      JSON.stringify(expectedUrl + "&embedded=1")
    }`,
  );
  assertEquals(html.includes(`/pages/03.arbeitswelt`), false);
});

Deno.test("buildAdminBarHtml: renders the source-editing overlay markup and open button", () => {
  const html = buildAdminBarHtml(baseOpts);
  assertStringIncludes(
    html,
    `<button id="dune-ab-edit-source">✎ Edit source</button>`,
  );
  assertStringIncludes(html, `<div id="dune-source-overlay">`);
  assertStringIncludes(html, `<iframe id="dune-source-overlay-frame"`);
  // Iframe src is set lazily by the client script on first open, not
  // server-rendered — the overlay must not eagerly load the editor.
  assertEquals(
    html.includes(`<iframe id="dune-source-overlay-frame" src=`),
    false,
  );
});

Deno.test("buildAdminBarHtml: @media print hides the admin bar and its overlays", () => {
  // An admin printing straight from the browser (Ctrl+P / print-to-PDF)
  // while viewing a page would otherwise get the fixed toolbar (and the
  // source-editing overlay, if open) baked into the printout. The scripted
  // PDF export (scripts/export-pdf.ts) browses anonymously and never sees
  // any of this to begin with — this covers the manual-print path only.
  const html = buildAdminBarHtml(baseOpts);
  const printBlock = html.match(/@media print\s*{([^]*?)}\s*}/)?.[0];
  if (!printBlock) throw new Error("no @media print block found");
  assertStringIncludes(printBlock, "#dune-admin-bar");
  assertStringIncludes(printBlock, "#dune-ao-edit-handle");
  assertStringIncludes(printBlock, "#dune-source-overlay");
  assertStringIncludes(printBlock, ".dune-bubble-menu");
  assertStringIncludes(printBlock, ".dune-ao-body-toolbar");
  assertStringIncludes(printBlock, "display: none !important");
});

Deno.test("buildAdminBarHtml: href action renders as a link", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{
      id: "pdf-export:download",
      label: "PDF",
      icon: "⬇",
      href: "/pdf/download?path=x",
    }],
  });
  assertStringIncludes(
    html,
    `<a id="pdf-export:download" class="dune-ab-action" href="/pdf/download?path=x">⬇ PDF</a>`,
  );
});

Deno.test("buildAdminBarHtml: onClick action renders as a button", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{
      id: "my-plugin:open",
      label: "Open",
      onClick: "openModal('x')",
    }],
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
  assertStringIncludes(
    html,
    `<a id="x" class="dune-ab-action" href="/x">X</a>`,
  );
  assertEquals(html.includes("shouldNotRun"), false);
});

Deno.test("buildAdminBarHtml: label/icon/href are HTML-escaped", () => {
  const html = buildAdminBarHtml({
    ...baseOpts,
    actions: [{
      id: "y",
      label: `<script>alert(1)</script>`,
      href: `/x?a="b"`,
    }],
  });
  assertEquals(html.includes("<script>alert(1)</script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
});

// ---------------------------------------------------------------------------
// The "Editing"/"Save" buttons are omitted entirely on pages with nothing
// to edit — "Edit source" always stays, since it works regardless.
// ---------------------------------------------------------------------------

Deno.test("buildAdminBarHtml: hasEditableContent defaults to true — Editing/Save render", () => {
  const html = buildAdminBarHtml(baseOpts);
  assertStringIncludes(html, `<button id="dune-ab-edit-toggle">`);
  assertStringIncludes(html, `<button id="dune-ab-save">`);
  assertStringIncludes(html, `<button id="dune-ab-edit-source">`);
});

Deno.test("buildAdminBarHtml: hasEditableContent:false omits Editing/Save but keeps Edit source", () => {
  const html = buildAdminBarHtml({ ...baseOpts, hasEditableContent: false });
  assertEquals(html.includes(`id="dune-ab-edit-toggle"`), false);
  assertEquals(html.includes(`id="dune-ab-save"`), false);
  assertStringIncludes(html, `<button id="dune-ab-edit-source">`);
});

// ---------------------------------------------------------------------------
// Save starts hidden and only appears once a field edit actually begins.
// ---------------------------------------------------------------------------

Deno.test("buildAdminBarHtml: #dune-ab-save starts hidden via CSS (display: none)", () => {
  const html = buildAdminBarHtml(baseOpts);
  const rule = html.match(/#dune-ab-save\s*{[^}]*}/)?.[0];
  if (!rule) throw new Error("no #dune-ab-save CSS rule found");
  assertStringIncludes(rule, "display: none");
});

Deno.test("buildAdminBarHtml: client script reveals Save on markDirty(), guards null buttons", () => {
  const html = buildAdminBarHtml(baseOpts);
  assertStringIncludes(html, "function markDirty()");
  assertStringIncludes(html, "saveBtn.style.display = 'inline-block'");
  // Both listeners must be null-guarded — the buttons don't exist in the DOM
  // at all when hasEditableContent is false.
  assertStringIncludes(html, "if (toggleBtn) {");
  assertStringIncludes(html, "if (saveBtn) {");
});

// ---------------------------------------------------------------------------
// annotateEditableElements: hasEditableContent detection
// ---------------------------------------------------------------------------

Deno.test("annotateEditableElements: a page with an <h1> and no data-dune-body reports hasEditableContent:true", () => {
  const { hasEditableContent } = annotateEditableElements(
    "<html><body><h1>Title</h1><p>text</p></body></html>",
    "a.md",
  );
  assertEquals(hasEditableContent, true);
});

Deno.test("annotateEditableElements: a page with data-dune-body and no <h1> reports hasEditableContent:true", () => {
  const { hasEditableContent } = annotateEditableElements(
    `<html><body><div data-dune-body>text</div></body></html>`,
    "a.md",
  );
  assertEquals(hasEditableContent, true);
});

Deno.test("annotateEditableElements: a page with neither reports hasEditableContent:false", () => {
  const { hasEditableContent } = annotateEditableElements(
    "<html><body><p>Just some text, no heading or body marker.</p></body></html>",
    "a.md",
  );
  assertEquals(hasEditableContent, false);
});

Deno.test("annotateEditableElements: a page already hand-annotated with data-dune-field reports hasEditableContent:true", () => {
  // Elements already carrying data-dune-* are left untouched by the
  // annotation pass itself (see the module doc) -- must still count.
  const { html, hasEditableContent } = annotateEditableElements(
    `<html><body><span data-dune-field="custom" data-dune-source="a.md">x</span></body></html>`,
    "a.md",
  );
  assertEquals(hasEditableContent, true);
  assertStringIncludes(html, `data-dune-field="custom"`);
});

Deno.test("annotateEditableElements: data-dune-no-edit on the body element means no editable content", () => {
  const { hasEditableContent } = annotateEditableElements(
    `<html><body><div data-dune-body data-dune-no-edit>text</div></body></html>`,
    "a.md",
  );
  assertEquals(hasEditableContent, false);
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
